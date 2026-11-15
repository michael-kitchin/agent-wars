# Maintainability Consolidation Execution Plan v10

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Remove ten groups of duplicated or oversized code. Each group becomes one helper, or reuses one that already exists, and the callers delegate to it. Three files near the 1000-line hard limit move their type blocks into sibling files. Behavior stays identical.

**Shape:** Phase 0 records a baseline. Phases 1 through 14 each make one change that can be verified on its own, using only earlier phases. Phase 15 runs the final verification, the doc check, and hands the user a short manual checklist for the renderer phases.

**Tech:** TypeScript (Electron main, sandboxed preload, esbuild-bundled renderer), `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Stop only when a verification fails** and the phase's "If verification fails" steps do not fix it. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`. The user reviews every change. The working tree already holds the user's uncommitted feature work (see Phase 0). The backups are the only way to undo a phase without destroying that work.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, except to remove an import that lint reports unused in a listed file.
- Line numbers are approximate ("near line N"). Find code by the quoted text, not by the number. Earlier phases shift later line numbers.
- **Code blocks are sketches.** Write the real code from the file you just read. When a sketch and the file disagree, the file wins. Record the difference in the Completion Log.
- **Tests come first.**
  - **The test calls code that exists today** (for example `postOrdersChatRequest`). Write the test and run it against the *old* code before you edit production code. It must pass before and after the edit. A test that only passes after the edit proves nothing.
  - **The test calls a new helper.** Write the helper and its test, then run the test, before you change any caller. The callers' existing tests then serve as characterization tests. They must pass unchanged after the callers switch.

### Behavior Rule (Strict)

The user chose pure refactors:

- Return values, user-facing strings, thrown error messages, prompt text, IPC payloads, JSON schema output, and save format stay identical.
- Keep the order of side effects (log lines, telemetry calls, database reads, sends) as it is today.
- Existing log lines stay unchanged. A new exported helper may add one `logTrace` line where the Conventions require it. No phase removes a log line except where it says so.
- SQL text may change in exactly one place: Phase 7 routes `turn_state` reads through the existing `readTurnStateRow`, which selects both columns. The rows read and the values returned stay the same.

### Backup and Revert

Nothing is committed, and several phases edit files that already hold uncommitted work. Before each phase, copy every file the phase **edits** into a backup folder outside the repo.

Run this from the repo root at the start of a phase. Set `$step` to the phase number and `$files` to that phase's **Edit** list. The paths below are an example for Phase 1 only. Replace them every phase.

```powershell
$step = '1'
$files = @('src/main/operations/liftRules.ts', 'src/shared/headOnContact.ts')
$backup = Join-Path $env:TEMP "aw-consolidation-v10\step-$step"
foreach ($f in $files) {
  $dest = Join-Path $backup $f
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item $f $dest -Force
}
```

To revert a phase:

```powershell
foreach ($f in $files) { Copy-Item (Join-Path $backup $f) $f -Force }
# Then delete every file the phase added (its "Add" list).
```

---

## Verification Bar

Every phase ends with all three commands, run from the repo root:

```powershell
npm test
npm run build:renderer
npm run check:circular
```

- `npm test` runs the native rebuild, `build:main`, `lint`, `naming:check`, `check:renderer-types`, every compiled `dist/main/**/*.test.js` and `dist/shared/**/*.test.js`, and `notices:check`. It takes about 20 minutes. New `*.test.ts` files under `src/main` or `src/shared` are discovered automatically. Tests under `src/renderer` are **not** run, so every new test in this plan lives under `src/shared` or `src/main`.
- `npm run check:circular` exited 1 in the last plan because of four known cycles (listed in Phase 0). It passes for this plan when it prints **exactly** the cycles recorded in Phase 0 and no others. A new cycle fails the phase. Type-only imports are erased and cannot cause a cycle.
- `npm run check:renderer-types` compares renderer type errors with `scripts/renderer-typecheck-baseline.json`. Running `tsc -p tsconfig.renderer.json` by hand also shows the baseline errors, which is expected. Use the npm script.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a gate pass.
- **Quick loop while you work:** `npm run build:main`, then `node dist/main/<path>.test.js` (or `dist/shared/...`). This is a shortcut only. The full bar decides pass or fail.
- **Native module lock.** If `npm test` fails in `rebuild:native:node` with `EBUSY` on `better_sqlite3.node`, close any running Electron app, rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`, rerun `npm test`, then delete the `.locked` file. This is an environment problem, not a phase failure.

---

## Non-Goals

- Do not change gameplay, AI prompts, IPC channels, save format, or UI layout.
- Do not split function bodies out of large files. File-size work in this plan moves type and constant blocks only (Phases 12–14).
- Carried over from earlier plans, still out of scope: merging the `tempoBullet` helpers, unifying `initDatabase` or the database open/recover path, importing channel constants into `preload.ts`, the game-config JSON readers, the completion-parse helpers, dwell-tooltip wiring, and `renderSealiftSection`.
- Considered for this plan and left out (do not touch): the finite-cost guard `typeof x.cost === 'number' && Number.isFinite(x.cost)`, pluralization helpers, the `Map` counter increment, `seats.find` versus `findSeat`, the hex-code-to-H3 parsers in `src/main/openRouter/` (their logging differs), the pack-extract helpers in `basemap/` and `gameMap/`, the build-popup header sections, the `unit-select` button builders, `hasLegalAttackThisTurn`, `periodNoun`, the Web Mercator latitude clamp in `basemapPrefetch.ts` (its constant differs by one ULP), and `compareHexIds` in `possibleUnitActionsPartition.ts` (it uses `localeCompare`, a different order).
- Phase 1 does not rewrite code-unit comparisons of a field. These stay: `briefingSectionsOperations.ts`, `briefingSectionsMissiles.ts`, `campaignRules.ts`, `landOperationCandidates.ts`, `operationMemory.ts`, `mapLabelPlacement.ts`, `tacticalSealiftStackState.ts`, and `unitBirthCellSelection.ts`. Each compares a string field (`id` or `h3Index`), not the whole sort element.
- Do not edit anything under `.spec/completed/`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`. Lint enforces some of them.

- **Orienting comments.** Every new function, constant, type, interface, and field needs a JSDoc block with a one-line summary, then `Purpose:` (or `Contract:` for types and interfaces), `When to use:`, `Expected outcome:`, and `Exceptions:`. Lint rule `orienting-comments/require-orienting-block` fails the build without one. Many existing blocks are generic filler ("Supports maintainability by documenting why…", "Use per team conventions…"). **Do not copy that filler.** Write what the code does, when to call it, what it returns, and what it throws. Do not write where code came from ("moved from", "consolidated", "shared copy of").
- **Moving code.** When a phase moves a declaration, move its existing comment block with it unchanged, unless the phase says to rewrite it.
- **Logging in `src/main`.**
  - A new **exported** function that changes state logs `logDebug` on entry. A new exported getter or pure builder logs `logTrace`, unless the phase says it delegates to a function that already traces. Tactical modules use `tacticalLogMutate` and `tacticalLogQuery` from `tacticalLogging.ts` instead.
  - Log context carries ids, keys, and counts only. Never log an API key, a `game_config` value, or a prompt body.
  - New **private** helpers add no log lines. Existing log lines they carry move with them unchanged.
- **No logging in `src/shared` or `src/renderer`.** Shared code must not import `logger.ts`, because that module imports `fs`.
- **Names.** camelCase files and functions, PascalCase types, UPPER_SNAKE constants. No `Utils`, `Helpers`, or `Impl` suffix on new files. Follow `doc/naming-conventions-contract-v1.md`. Names from this plan (phase numbers, "v10", opportunity numbers) must never appear in code, comments, test names, or `doc/`.
- **Seat ids.** Production code uses `HUMAN_SEAT_ID` and similar constants, never `'human'` literals. Tests may use literals.
- **Size limits.** Files should stay under 600 lines and must stay under 1000. Functions take 6 or fewer named parameters. Use a parameter object for more.
- **`readonly`.** Mark parameter arrays and object fields `readonly` where they are not reassigned. Use `const` unless a value is reassigned.
- **Tests.** Test happy paths and essential failures only. When adding to an existing test file, match its style: either `node:test` `test(...)` calls, or named `async function testX()` cases called from `run()`. A new test file copies the imports and structure of the nearest sibling test file. A `function` declaration in a test file needs the same orienting block as production code. Arrow callbacks passed to `test(...)` do not.
- **Re-exports.** Where a phase keeps an old import path working with `export { … } from` or `export type { … } from`, give the re-export an orienting block only if lint asks for one. That block names the module that now defines the symbols.
- **Docs.** When a phase changes a name or path that `doc/` mentions, update that document in the same phase. Each phase says what to check.

---

## Opportunities

| # | Phases | Area | Duplication removed |
|---|--------|------|---------------------|
| 1 | 1 | String order | Seven private copies of the code-unit string comparator and six inline comparator lambdas |
| 2 | 2–3 | Land units | About 70 inline `=== 'infantry' \|\| === 'armor'` checks, replaced by one shared `isLandUnitType` |
| 3 | 4 | Operations | Three copies of the lift-objective reinforcer count |
| 4 | 5 | Object guards | Six private `isRecord` copies in two behaviors (arrays allowed, arrays rejected) |
| 5 | 6 | Air-strike targets | The four target types spelled out in six places across main, renderer, and the prompt schema |
| 6 | 7 | Turn state | Thirteen `turn_state` reads that bypass the existing `readTurnStateRow` |
| 7 | 8 | Chat retries | Three copy-pasted retry blocks in `postOrdersChatRequest` |
| 8 | 9–10 | Renderer map helpers | A dead duplicate of `spanForProjectedHex`, two inline copies of `getMapZoomStrokeScale`, and three copies of the client-pixel-to-hex hit-test |
| 9 | 11 | Renderer popovers | Two identical dismiss-and-reposition listener blocks and two identical placement bodies |
| 10 | 12–14 | File size | Type and constant blocks of `seaOperationAdvance.ts` (919), `terrainMetadataLoad.ts` (900), and `tools/pathfinding.ts` (946) |

---

## Phase 0 — Baseline

**Intent:** Confirm the tree builds and passes, and record what later phases compare against.

**Files:** None edited. Fill in the Phase 0 Inventory at the end of this document.

**Steps:**

1. Run `git status --short`. Record the output. The tree is expected to hold the user's uncommitted feature work, including `src/main/operations/seaOperationAdvance.ts`, `src/main/operations/seaOperationAdvance.test.ts`, `src/main/openRouter/promptSpec/operationRuleText.ts`, `src/main/openRouter/promptSpec/coachingText.test.ts`, and several files under `doc/ai-commander-prompts/` plus `doc/hybrid-ai.md`. **That work is the baseline.** Do not stop for it, and never revert it. Phases 1 and 12 edit `seaOperationAdvance.ts` on top of it, so take the backups.
2. Run the verification bar. Record the result of each command. If `npm test` or `npm run build:renderer` fails, record the failing step and its first error in the Defect Inventory, then stop. Do not start Phase 1 on a red baseline.
3. Record the cycle list that `npm run check:circular` prints. The last plan recorded these four:
   - `productionTools` → `gameActions` → … → `envelopeContract` → `callbackVocabularyText` → `orderResponseParsing` → `productionTools`
   - `standingOrders` → … → `envelopeContract` → … → `envelopeOrderRows` → `standingOrders`
   - `openRouterUiHelpers` → `mapToastBody` → `toastInlineMarks` → `unitDrawing` → `mapHelpers` → `worldLeafletMap` → `openRouterUiHelpers`
   - `terrainTooltipStrategicState` → `selection` → … → `controlTooltip` → `terrainTooltipStrategicState`

   If the list differs, record the real list. The real list is the baseline.
4. Confirm that every file this plan edits exists, and record its line count:

```powershell
$files = @(
  'src/main/operations/airOperationCandidates.ts','src/main/operations/landOperationCandidates.ts',
  'src/main/operations/seaOperationCandidates.ts','src/main/operations/liftRules.ts','src/main/operations/liftRules.test.ts',
  'src/main/operations/operationTurnFlow.ts','src/main/operations/seaOperationAdvance.ts','src/main/operations/liftTerrain.ts',
  'src/shared/headOnContact.ts','src/main/unitOrigin/tacticalBirthCountry.ts','src/main/unitOrigin/strategicMajorityCountry.ts',
  'src/main/gameActions/sealift.ts','src/shared/airportFerryRoute.ts','src/shared/queuePauseReasons.ts',
  'src/shared/turnReportHexCodes.ts','src/shared/unitIds.ts','src/main/gameActions/landMovementConstraints.ts',
  'src/main/terrainMetadataLoad.ts','src/main/terrainNamingLoad.ts','src/main/terrainRoadRailSidesLoad.ts',
  'src/main/terrainRoadRailVectorsLoad.ts','src/shared/mapLabelPack.ts','src/shared/vectorPackDecode.ts',
  'src/shared/ipc/ordersTypes.ts','src/main/ipcPayloadGuards.ts','src/main/main.ts',
  'src/main/openRouter/orderResponseParsing.ts','src/main/openRouter/promptSpec/envelopeJsonSchema.ts',
  'src/renderer/map/initCore.ts','src/main/gameDb/turnStateReads.ts','src/main/gameDb/turnStateReads.test.ts',
  'src/main/gameActions/airDropResolution.ts','src/main/gameActions/airFerryRoute.ts',
  'src/main/gameActions/airStrikeResolution.ts','src/main/gameActions/buildQueue.ts',
  'src/main/gameActions/controlAndProduction.ts','src/main/gameActions/dismissMercenary.ts',
  'src/main/gameActions/gameActionsCore.ts','src/main/gameActions/hireOrders.ts',
  'src/main/gameActions/readyStrategicResolutionPipeline.ts','src/main/gameActions/submitOrders.ts',
  'src/main/gameDb/fogState.ts','src/main/openRouter/commanderPool.ts',
  'src/main/openRouter/ordersChatRequestHelpers.ts','src/main/openRouter/ordersChatRequestHelpers.test.ts',
  'src/renderer/rendering/renderGeometry.ts','src/renderer/map/terrainView.ts',
  'src/renderer/rendering/terrainRendering.ts','src/renderer/rendering/tacticalCityOverlays.ts',
  'src/main/rendererPureHelperContracts.test.ts','src/renderer/map/mapHelpers.ts',
  'src/renderer/map/mainMapInteractions.ts','src/renderer/entryCallbacks.ts','src/renderer/map/drawInteraction.ts',
  'src/renderer/gameplay/newGameOptionsPopover.ts','src/renderer/openRouter/commanderPopover.ts',
  'src/main/tools/pathfinding.ts','doc/terrain-pipeline.md','doc/ux/new-game-dialog.md','doc/ux/hex-tooltips.md'
)
foreach ($f in $files) { if (Test-Path $f) { '{0}  {1}' -f (Get-Content $f).Count, $f } else { "MISSING  $f" } }
```

If any file is `MISSING`, find it with `rg --files -g '<name>'` and correct the path in this plan before you continue.

**Verification:** `npm test` and `npm run build:renderer` pass, the cycle list is recorded, and the inventory is filled in.

---

## Phase 1 — Code-Unit String Comparator

**Intent:** Seven modules define a private comparator that orders strings by UTF-16 code units with `<` and `>`, and six more write it inline as a lambda. Every copy avoids `localeCompare` on purpose, so the order does not depend on the machine's locale. Put one exported comparator in `src/shared` and make every copy call it.

**Add:** `src/shared/codeUnitOrder.ts`, `src/shared/codeUnitOrder.test.ts`

**Edit:** `src/main/operations/airOperationCandidates.ts`, `src/main/operations/liftRules.ts`, `src/main/operations/operationTurnFlow.ts`, `src/main/operations/seaOperationAdvance.ts`, `src/main/operations/seaOperationCandidates.ts`, `src/main/operations/liftTerrain.ts`, `src/shared/headOnContact.ts`, `src/main/unitOrigin/tacticalBirthCountry.ts`, `src/main/unitOrigin/strategicMajorityCountry.ts`, `src/main/gameActions/sealift.ts`, `src/shared/airportFerryRoute.ts`, `src/shared/queuePauseReasons.ts`, `src/shared/turnReportHexCodes.ts`, `src/shared/unitIds.ts`, `doc/terrain-pipeline.md`

**Why it is safe:** Every copy returns -1 when `left < right`, 1 when `left > right`, and 0 otherwise. `compareOrdinal` writes it as `if (a < b) return -1; return a > b ? 1 : 0;`, which gives the same results. `Array.prototype.sort` with an equivalent comparator gives the same order.

**New module.** `src/shared/codeUnitOrder.ts` exports one function and imports nothing:

```ts
export function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
```

Its comment says it orders by UTF-16 code units, does not depend on locale, and exists so sorted ids, cells, and names come out the same on every machine. It also says `localeCompare` gives a different order and must not replace it.

**Add tests first.** `src/shared/codeUnitOrder.test.ts`, in the `test(...)` style of `src/shared/webMercator.test.ts`:

| Call | Expected |
|------|----------|
| `compareCodeUnits('a', 'b')` | `-1` |
| `compareCodeUnits('b', 'a')` | `1` |
| `compareCodeUnits('a', 'a')` | `0` |
| `compareCodeUnits('Z', 'a')` | `-1` (code unit 90 sorts before 97, where `localeCompare` would put `a` first) |
| `['b', 'B', 'a', 'A'].sort(compareCodeUnits)` | `['A', 'B', 'a', 'b']` |

Write the module and the test, then run the test before you change any caller.

**Edits:**

1. In each of `airOperationCandidates.ts` (near line 36), `liftRules.ts` (near 97), `operationTurnFlow.ts` (near 66), `seaOperationAdvance.ts` (near 278), and `seaOperationCandidates.ts` (near 38): delete the private `compareIds` function and its comment block. Replace every remaining `compareIds` reference in that file with `compareCodeUnits`. Import it from `'../../shared/codeUnitOrder'`.
2. `src/shared/headOnContact.ts`: delete private `compareAscending` (near line 168) and its comment. Replace its uses (near lines 213, 214, 235) with `compareCodeUnits`. Import from `'./codeUnitOrder'`.
3. `src/main/unitOrigin/tacticalBirthCountry.ts`: delete exported `compareOrdinal` (near line 27) and its comment. Replace its four uses in this file with `compareCodeUnits`. Import from `'../../shared/codeUnitOrder'`.
4. `src/main/unitOrigin/strategicMajorityCountry.ts`: change `import { compareOrdinal } from './tacticalBirthCountry';` to import `compareCodeUnits` from `'../../shared/codeUnitOrder'`, and rename the one use (near line 33).
5. Replace these inline lambdas. Each becomes the comparator name or a call to it:

| File | Near line | Today | After |
|------|-----------|-------|-------|
| `main/operations/liftTerrain.ts` | 171 | `found.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));` | `found.sort(compareCodeUnits);` |
| `main/gameActions/sealift.ts` | 211 | `.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))` | `.sort(compareCodeUnits)` |
| `shared/airportFerryRoute.ts` | 225 | same lambda | `.sort(compareCodeUnits)` |
| `shared/turnReportHexCodes.ts` | 39 | `[...known].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))` | `[...known].sort(compareCodeUnits)` |
| `shared/queuePauseReasons.ts` | 149 | `.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))` | `.sort(([left], [right]) => compareCodeUnits(left, right))` |
| `shared/unitIds.ts` | 286 | `return a < b ? -1 : a > b ? 1 : 0;` | `return compareCodeUnits(a, b);` |

   Passing `compareCodeUnits` directly is only valid when the array holds strings. If TypeScript rejects one of these sites, write `(left, right) => compareCodeUnits(left, right)` instead. If the array is not a string array at all, leave that site unchanged and record it.

6. `doc/terrain-pipeline.md` (near line 28) says "with `compareOrdinal` breaking a tie". Change `compareOrdinal` to `compareCodeUnits`. Change nothing else in the sentence.

**Do not touch** `compareHexIds` in `src/main/openRouter/possibleUnitActionsPartition.ts`. It uses `localeCompare`.

**Doc check:** `rg -n "compareOrdinal|compareAscending" doc` must return nothing after edit 6.

**Verification:** The bar. Then `rg -n "function compareIds|function compareAscending|function compareOrdinal|left < right \? -1 : left > right" src` must return nothing. The operations, head-on contact, unit-origin, queue-pause, turn-report, and unit-id tests must pass unchanged.

**If verification fails:** An order-dependent test failure means a site's element type is not a plain string, or the lambda compared a field instead of the whole value. Compare the site with its backup.

---

## Phase 2 — Shared Land-Unit Predicate (`src/main`)

**Intent:** `src/main/gameActions/landMovementConstraints.ts` exports `isLandUnitType(unitType)`, but about 45 sites in `src/main` and 25 in `src/shared` and `src/renderer` repeat `x === 'infantry' || x === 'armor'` or its negation. Move the predicate to `src/shared` so all three layers can use it, then replace the `src/main` sites. Phase 3 does the rest.

**Add:** `src/shared/landUnitType.ts`, `src/shared/landUnitType.test.ts`

**Edit:** `src/main/gameActions/landMovementConstraints.ts`, plus every non-test `src/main` file the search below lists, **except** `src/main/tacticalBattle/testSupport/twoAiBattleFixture.ts` (test support) and `src/main/operations/{air,land,sea}OperationCandidates.ts` (Phase 4 rewrites those lines). Record the final file list in the Completion Log, and back up each file before you edit it.

**New module.** `src/shared/landUnitType.ts` imports nothing and exports:

```ts
export function isLandUnitType(unitType: string): unitType is 'infantry' | 'armor' {
  return unitType === 'infantry' || unitType === 'armor';
}
```

Its comment says land units are infantry and armor, the only types that march over land, embark on carriers, and occupy hexes as ground forces. It also says the type guard narrows a unit-type union.

`landMovementConstraints.ts`: delete the local `isLandUnitType` and its comment block. Add `import { isLandUnitType } from '../../shared/landUnitType';` because the file uses it near line 96. Then add `export { isLandUnitType } from '../../shared/landUnitType';` so its four existing importers keep working. They are `gameActionsCore.ts`, `strategicOrderValidation.ts`, `humanMarchPreview/humanMarchPreviewGroundRoute.ts`, and `humanMarchPreview/humanMarchPreviewResolve.ts`.

**Add tests first.** `src/shared/landUnitType.test.ts` checks that `isLandUnitType` is `true` for `'infantry'` and `'armor'`, and `false` for `'naval'`, `'air'`, `'missile'`, `''`, and `'Infantry'`. Run it before you edit any caller.

**Find the sites:**

```powershell
rg -n --glob '!*.test.ts' --glob '!**/testSupport/**' -e "=== 'infantry' \|\| [A-Za-z_.?\[\]]+ === 'armor'" -e "!== 'infantry' && [A-Za-z_.?\[\]]+ !== 'armor'" -e "=== 'armor' \|\| [A-Za-z_.?\[\]]+ === 'infantry'" src/main
```

**Rewrite rules.** Apply them one site at a time. `X` stands for the expression being tested, such as `unit.unitType`, `u.unit_type`, `args.moveType`, or `unitType`.

1. Both comparisons must test the **same** `X`, character for character. If they test different expressions, leave the site.
2. `X === 'infantry' || X === 'armor'` (in either order) becomes `isLandUnitType(X)`.
3. `X !== 'infantry' && X !== 'armor'` (in either order) becomes `!isLandUnitType(X)`.
4. **Operator precedence (the one real hazard).** `&&` binds tighter than `||`.
   - For an `||` pair, replace it only when the pair stands alone: it is the whole condition, the whole return value, the whole arrow body, the whole ternary test, or it sits inside its own parentheses. When the pair has its own parentheses, `(X === 'infantry' || X === 'armor')` becomes `isLandUnitType(X)`, and you drop those now-redundant parentheses. **If an `&&` touches either comparison without parentheses between them, leave the site and record it.**
   - For an `&&` pair, the pair may sit inside a longer `&&` chain, such as `a && X !== 'infantry' && X !== 'armor' && b`. Replace just the two comparisons. If an `||` touches either comparison without parentheses, leave the site and record it.
5. If TypeScript rejects `isLandUnitType(X)` because `X` may be `null` or `undefined`, or is not a string, restore that site and record it. Do not add `?? ''`, casts, or `String(...)`.
6. If a site's file has no access to the predicate, import it from the shared module with the correct relative path, for example `'../../shared/landUnitType'` from `src/main/gameActions/`, or `'../shared/landUnitType'` from `src/main/`. Do not import it through `landMovementConstraints.ts` in new code.
7. `src/main/operations/seaOperationCandidates.ts` private `isGroundUnit` (near line 52) belongs to Phase 4. Skip it here.
8. A longer `&&` chain keeps the clauses that are not the land pair. In `src/shared/tacticalMarchHoverPreview.ts`, `moveType !== 'infantry' && moveType !== 'armor' && moveType !== 'naval'` becomes `!isLandUnitType(moveType) && moveType !== 'naval'`. Do not drop the naval clause.

**Doc check:** `rg -n "isLandUnitType" doc`. If a document names `landMovementConstraints.ts` as its home, change it to `src/shared/landUnitType.ts`.

**Verification:** The bar. Then rerun the search. The only remaining `src/main` matches should be the sites you recorded as left unchanged, the three operations candidate files, and the test-support fixture.

**If verification fails:** A type error at a site you rewrote means rule 5 applies. A behavior failure usually means rule 4 was missed. Compare the site with its backup and restore it.

---

## Phase 3 — Shared Land-Unit Predicate (`src/shared` and `src/renderer`)

**Intent:** Apply Phase 2's rewrite to the remaining layers.

**Add:** None.

**Edit:** Every non-test file under `src/shared` and `src/renderer` that the search lists. At planning time these were: `shared/humanMarchPreviewGroupAssembly.ts`, `shared/collectTacticalLegalMoveDestinationHexes.ts`, `shared/orderPreviewSlowTerrainTooltip.ts`, `shared/tacticalLandMarchContinuity.ts`, `shared/tacticalMarchBeatSearch.ts`, `shared/tacticalMarchStepCost.ts`, `shared/tacticalTerrainMovement.ts`, `shared/tacticalMarchHoverPreview.ts`, `shared/tacticalMovementPlanner.ts`, `shared/tacticalTerrainCombatModifiers.ts`, `shared/terrainBonusMarch.ts`, `shared/terrainEffectsForTooltip.ts`, `renderer/core/selection.ts`, and `renderer/map/mapHelpers.ts`. Exclude `src/shared/landUnitType.ts` itself.

**Find the sites:** Phase 2's command with `src/shared src/renderer` in place of `src/main`.

**Rewrite rules:** Phase 2's rules 1–6. Shared files import `'./landUnitType'`. Renderer files import `'../../shared/landUnitType'`.

**Doc check:** None.

**Verification:** The bar. `npm run check:renderer-types` must show no new error. Rerun the search. The only matches should be `landUnitType.ts` and the sites you recorded.

---

## Phase 4 — Lift-Objective Reinforcer Count

**Intent:** The air, land, and sea operation candidate modules each have a private `countReinforcers`. It counts enemy land units that can reach a lift city within `etaTurns` but are not already inside `LIFT_OBJECTIVE_CLEAR_RADIUS`. Move it into `liftRules.ts`, which already owns that radius and is imported by all three modules.

**Add:** None.

**Edit:** `src/main/operations/liftRules.ts`, `src/main/operations/liftRules.test.ts`, `src/main/operations/airOperationCandidates.ts`, `src/main/operations/landOperationCandidates.ts`, `src/main/operations/seaOperationCandidates.ts`

**Why it is safe:** The air copy (near line 50) and the land copy (near 55) are byte-identical. The sea copy (near 217) writes `unit.player === seatId || !isGroundUnit(unit)`, which skips the same units as the two separate `continue` lines in the others, because `isGroundUnit` is the infantry-or-armor test.

**New export** in `liftRules.ts`:

```ts
export function countObjectiveReinforcers(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly cityH3: string;
  readonly etaTurns: number;
}): number
```

The body is the air copy's loop, with `!isLandUnitType(unit.unitType)` in place of the inline pair. Add `logTrace('liftRules countObjectiveReinforcers', { seatId, cityH3, etaTurns, count })` just before the return. `liftRules.ts` already imports `logTrace`. Imports to add: `import type { GameStateSnapshot } from '../gameDb';` (type-only, so it adds no cycle), `isWithinGridRangePure` from `'../../shared/h3GridRangePure'`, and `isLandUnitType` from `'../../shared/landUnitType'`. The comment explains that an objective counts as contested when enemy land units can arrive before the lift does.

**Add tests first.** Add one `test(...)` to `liftRules.test.ts`. Build the state the way `airOperationCandidates.test.ts` does: an object literal cast to `GameStateSnapshot`, with cells from `latLngToCell` and `gridDisk` in `h3-js`. Read that file's fixture first and copy its unit-row shape. Take `city = latLngToCell(0, 0, 1)`. A cell at exact grid distance `k` is any member of `gridDisk(city, k)` that is not in `gridDisk(city, k - 1)`. `LIFT_OBJECTIVE_CLEAR_RADIUS` is 2. Call with `seatId: 'ai1'` and `etaTurns: 3`, and assert the count is exactly 1 when the state holds:

| Unit | Seat | Distance from city | Counted? |
|------|------|--------------------|----------|
| infantry | enemy (`'ai2'`) | 3 | yes |
| naval | enemy | 3 | no: not a land unit |
| armor | own (`'ai1'`) | 3 | no: own seat |
| armor | enemy | 1 | no: inside the clear radius |
| infantry | enemy | 5 | no: beyond `etaTurns` |

Run the test before you change any caller.

**Edits:**

1. Each of the three candidate modules: delete private `countReinforcers` and its comment block. Rename the one call (air near 224, land near 136, sea near 380) to `countObjectiveReinforcers` and import it from `'./liftRules'`. Keep the arguments exactly as they are.
2. `seaOperationCandidates.ts`: keep `isGroundUnit`. Lines near 286 and 289 still use it. Change its body to `return isLandUnitType(unit.unitType);` and import `isLandUnitType` from `'../../shared/landUnitType'`.
3. Each file: remove imports that lint now reports unused (for example `isWithinGridRangePure` or `LIFT_OBJECTIVE_CLEAR_RADIUS`). Check each one with `rg` first, because some files still use them elsewhere.

**Doc check:** `doc/README.md` (near line 120) names `LIFT_OBJECTIVE_CLEAR_RADIUS` in `liftRules.ts`. It is unchanged. No edit needed.

**Verification:** The bar. `airOperationCandidates.test.ts`, `landOperationCandidates.test.ts`, `seaOperationCandidates.test.ts`, `operationCandidates.test.ts`, and `liftRules.test.ts` pass. `rg -n "function countReinforcers" src` returns nothing. `liftRules.ts` stays under 600 lines.

---

## Phase 5 — Object Guards

**Intent:** Four terrain loaders in `src/main` define `isRecord(x)` as `typeof x === 'object' && x !== null`, which accepts arrays. Two shared decoders define `isRecord(value)` with `&& !Array.isArray(value)`, which rejects arrays. Give each behavior one named export, so the difference is visible at the call site.

**Add:** `src/shared/objectGuards.ts`, `src/shared/objectGuards.test.ts`

**Edit:** `src/main/terrainMetadataLoad.ts`, `src/main/terrainNamingLoad.ts`, `src/main/terrainRoadRailSidesLoad.ts`, `src/main/terrainRoadRailVectorsLoad.ts`, `src/shared/mapLabelPack.ts`, `src/shared/vectorPackDecode.ts`

**New module.** `src/shared/objectGuards.ts` imports nothing:

```ts
export function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
```

Each comment states its array behavior in the `Expected outcome:` line. `isNonNullObject` says "Arrays pass." `isNonArrayObject` says "Arrays fail." The comment on `isNonNullObject` also says why it exists: the terrain loaders rely on it, so switching them to `isNonArrayObject` would change their error messages for an array input.

**Add tests first.** `objectGuards.test.ts`:

| Input | `isNonNullObject` | `isNonArrayObject` |
|-------|-------------------|--------------------|
| `{}` | true | true |
| `{ a: 1 }` | true | true |
| `[]` | **true** | **false** |
| `null` | false | false |
| `undefined` | false | false |
| `'x'` | false | false |
| `0` | false | false |

**Edits:**

1. The four terrain loaders: delete private `isRecord` and its comment block. Replace every `isRecord(` in the file with `isNonNullObject(`. Import from `'../shared/objectGuards'`.
2. `mapLabelPack.ts` and `vectorPackDecode.ts`: delete private `isRecord` and its comment block. Replace every `isRecord(` with `isNonArrayObject(`. Import from `'./objectGuards'`.
3. **Do not touch** the inline check in `src/main/openRouter/requestOrdersToolDispatch.ts`, or any other `typeof … === 'object'` expression that is not a call to a function named `isRecord`.

**Doc check:** None.

**Verification:** The bar. `terrainNamingLoad.test.ts`, `terrainMetadataParity.test.ts`, `terrainClassifierFromMetadata.test.ts`, `terrainRoadRailVectorsLoad.test.ts`, `terrainTacticalMapOverlay.test.ts`, `src/shared/mapLabelPack.test.ts`, and `src/shared/vectorPackDecode.test.ts` pass unchanged. `rg -n "function isRecord" src` returns nothing.

---

## Phase 6 — Air-Strike Target Types

**Intent:** `src/shared/ipc/ordersTypes.ts` declares `AirStrikeTargetType = 'units' | 'urban' | 'airport' | 'seaport'`. The same four values are spelled out again in two IPC guards, a private type, the order-response parser, the renderer's target select, the prompt JSON schema enum, and an IPC handler's payload type. A fifth target type would need seven coordinated edits today. Give the values one runtime source and one guard.

**Add:** `src/shared/airStrikeTarget.ts`, `src/shared/airStrikeTarget.test.ts`

**Edit:** `src/main/ipcPayloadGuards.ts`, `src/main/main.ts`, `src/main/openRouter/orderResponseParsing.ts`, `src/main/openRouter/promptSpec/envelopeJsonSchema.ts`, `src/renderer/map/initCore.ts`

**New module.** `src/shared/airStrikeTarget.ts`. The name is not `airStrikeTargetTypes.ts`: the `Types` suffix is for a type-only module, and this file exports a runtime array and a function. `naming:check` would not catch that suffix.

```ts
import type { AirStrikeTargetType } from './ipc/ordersTypes';

export const AIR_STRIKE_TARGET_TYPES: readonly AirStrikeTargetType[] = ['units', 'urban', 'airport', 'seaport'];

export function isAirStrikeTargetType(value: unknown): value is AirStrikeTargetType {
  return (AIR_STRIKE_TARGET_TYPES as readonly unknown[]).includes(value);
}
```

Keep that array order. The prompt schema enum is emitted in this order, and `envelopeJsonSchema.test.ts` or the prompt examples may pin it. The constant's comment says this list is the schema enum and the value set every guard accepts, and that the SQL `CHECK` in `src/main/gameDb/schema.ts` must list the same values.

**Add tests first.** `airStrikeTarget.test.ts`:
- `AIR_STRIKE_TARGET_TYPES` deep-equals `['units', 'urban', 'airport', 'seaport']`.
- `isAirStrikeTargetType` is true for each of the four, and false for `'Units'`, `' units'`, `''`, `null`, `undefined`, and `1`.
- Read `src/main/gameDb/schema.ts` as text. The `target_type` `CHECK` (near line 58) lists the same four literals. Do not edit `schema.ts`.

**Edits:**

1. `ipcPayloadGuards.ts`:
   - Delete private `type GroupTargetType` (near line 20) and its comment. Use `AirStrikeTargetType` in the return type of `parseGroupedStrikePayload` (near 65). Import it as a type from `'../shared/ipc/ordersTypes'`, merging it into the existing type import from that module if there is one.
   - In `parseGroupedStrikePayload`, replace the four-line `!==` block (near 69–76) with:

     ```ts
     const targetType = payload?.targetType;
     if (!isAirStrikeTargetType(targetType)) return null;
     return { unitIds, targetH3Index: payload.targetH3Index, targetType };
     ```

   - In `parseAirStrikeRows` (near 253–260), replace the parenthesized four-way `!==` group with `!isAirStrikeTargetType(targetType)`. Keep the two `typeof` checks before it and the `||` between them.
   - Import `isAirStrikeTargetType` from `'../shared/airStrikeTarget'`.
   - In `parseAirStrikeRows`, if the `||` condition does not narrow `targetType` for the `push`, give the predicate its own `if` before the `push`. Do not cast.
2. `main.ts` (near line 507): in the `validateGroupAirStrikeTarget` handler's payload type, replace `'units' | 'urban' | 'airport' | 'seaport'` with `AirStrikeTargetType`, imported as a type from `'../shared/ipc/ordersTypes'`.
3. `orderResponseParsing.ts` (near line 446): keep the trim and lower-case normalization of `targetTypeRaw`. Replace only the four-way `===` test, so the expression reads `isAirStrikeTargetType(targetTypeRaw) ? targetTypeRaw : undefined`. **Do not touch** the three-value check near line 272 (`first === 'urban' || …`). It excludes `'units'` on purpose.
4. `envelopeJsonSchema.ts` (near line 36): delete the local `AIR_STRIKE_TARGET_TYPES` constant and its comment, and import the shared one from `'../../../shared/airStrikeTarget'`. `enumSchema(AIR_STRIKE_TARGET_TYPES)` (near 380) accepts it unchanged because `readonly AirStrikeTargetType[]` is assignable to `readonly string[]`. Leave `INFRASTRUCTURE_TARGET_TYPES` alone.
5. `initCore.ts` (near line 455): replace the four-way `===` test with `isAirStrikeTargetType(value)`, imported from `'../../shared/airStrikeTarget'`.

**Do not touch** `src/main/gameDb/schema.ts`. SQL stays as it is.

**Doc check:** `rg -n "AIR_STRIKE_TARGET_TYPES|GroupTargetType" doc`. `doc/ai-commander-prompts/source-inventory.md` names `envelopeJsonSchema.ts` as a file, not the constant. Update only text that names a removed symbol.

**Verification:** The bar. `ipcPayloadGuards.test.ts`, `ipcPayloadGuardsTacticalCommit.test.ts`, `orderResponseParsing.test.ts`, and `envelopeJsonSchema.test.ts` pass unchanged. Then run `rg -n "'units' \|\| |!== 'units' &&|'units' \| 'urban'" src --glob '!*.test.ts'`. It should show only `ordersTypes.ts`, `airStrikeTarget.ts`, and any site you recorded.

---

## Phase 7 — Turn-State Reads

**Intent:** `src/main/gameDb/turnStateReads.ts` exports `readTurnStateRow(getOne)` and says it is "One SQL string and row shape for every main-process reader of `turn_state`." Fourteen readers still write their own `SELECT … FROM turn_state WHERE id = 1`. `commanderPool.ts` already calls `readTurnStateRow`. Add two narrow readers on top of it and route those sites through them. Each caller keeps its own default for a missing row. The rewrite table lists every direct site.

**Add:** None.

**Edit:** `src/main/gameDb/turnStateReads.ts`, `src/main/gameDb/turnStateReads.test.ts`, `src/main/gameActions/airDropResolution.ts`, `src/main/gameActions/airFerryRoute.ts`, `src/main/gameActions/airStrikeResolution.ts`, `src/main/gameActions/buildQueue.ts`, `src/main/gameActions/controlAndProduction.ts`, `src/main/gameActions/dismissMercenary.ts`, `src/main/gameActions/gameActionsCore.ts`, `src/main/gameActions/hireOrders.ts`, `src/main/gameActions/readyStrategicResolutionPipeline.ts`, `src/main/gameActions/submitOrders.ts`, `src/main/gameDb/fogState.ts`, `src/main/openRouter/commanderPool.ts`

**New exports** in `turnStateReads.ts`:

```ts
export function readTurnNumberOrFirst(getOne: DbReadOps['getOne']): number {
  return readTurnStateRow(getOne)?.turn_number ?? 1;
}

export function readTurnPhase(getOne: DbReadOps['getOne']): string | undefined {
  return readTurnStateRow(getOne)?.phase;
}
```

Neither adds a log line, because `readTurnStateRow` already traces. Say so in each comment's `Purpose:`. `readTurnNumberOrFirst`'s comment says it returns 1 when no row exists, the default every turn-number reader uses. `readTurnPhase`'s comment says it returns `undefined` when no row exists, and that callers choose their own default: action guards that allow the action use `?? 'planning'`, and guards that reject it compare with `!==`.

**Add tests first.** In `turnStateReads.test.ts`, in its `test(...)` style:
- `readTurnNumberOrFirst` returns 4 for the row `{ phase: 'planning', turn_number: 4 }` and 1 when `getOne` returns `undefined`.
- `readTurnPhase` returns `'resolution'` for `{ phase: 'resolution', turn_number: 2 }` and `undefined` when there is no row.
- Both pass the existing `TURN_SQL` to `getOne`.

**Rewrite table.** Import the helpers from the right relative path (`'../gameDb/turnStateReads'` from `gameActions/` and `openRouter/`, `'./turnStateReads'` from `gameDb/`).

| File | Near line | After |
|------|-----------|-------|
| `airDropResolution.ts` | 198 | `const turnNumber = readTurnNumberOrFirst(dbGetOne);` |
| `airFerryRoute.ts` | 44 | `const turnNumber = readTurnNumberOrFirst(dbGetOne);` |
| `airStrikeResolution.ts` | 430 | `const turnNumber = readTurnNumberOrFirst(dbGetOne);` |
| `controlAndProduction.ts` | 154 | `return readTurnNumberOrFirst(dbGetOne);` |
| `hireOrders.ts` | 360 | `return readTurnNumberOrFirst(gameDbOps.getOne);` |
| `readyStrategicResolutionPipeline.ts` | 116 | `turnNumber: readTurnNumberOrFirst(dbGetOne),` |
| `commanderPool.ts` | 496 | `return readTurnNumberOrFirst(dbGetOne);` (it already calls `readTurnStateRow(dbGetOne)?.turn_number ?? 1`) |
| `fogState.ts` `getCurrentTurnNumberFromDb` | 185–186 | `return readTurnNumberOrFirst(ops.getOne);` |
| `buildQueue.ts` | 410 | `const phase = readTurnPhase(dbGetOne) ?? 'planning';` |
| `dismissMercenary.ts` | 63 | `const phase = readTurnPhase(gameDbOps.getOne) ?? 'planning';` |
| `hireOrders.ts` | 238 | `const phase = readTurnPhase(gameDbOps.getOne) ?? 'planning';` |
| `readyStrategicResolutionPipeline.ts` | 115 | `phase: readTurnPhase(dbGetOne) ?? 'planning',` |
| `gameActionsCore.ts` | 313–314 | `if (readTurnPhase(dbGetOne) !== VALID_PHASE) return { success: false, reason: 'Not in planning phase' };` Delete the `turnRow` const. `turnRow` has no other use in that function. Confirm with `rg -n turnRow` on the file. |
| `submitOrders.ts` | 181–183 | `const phase = readTurnPhase(dbGetOne);` then `if (phase !== deps.validPhase) {` and `logError('submitOrders: not in planning phase', phase);`. The logged value is the same as `turnRow?.phase`. |
| `fogState.ts` | 254 | `const turnRow = readTurnStateRow(ops.getOne);`. Then near line 301, `turnRow?.turnNumber ?? 1` becomes `turnRow?.turn_number ?? 1`. Near line 323, `turnRow?.phase ?? 'planning'` stays as it is. |

Keep each caller's own default and comparison exactly as shown. A missing row must still allow the action in `buildQueue`, `dismissMercenary`, `hireOrders`, and `readyStrategicResolutionPipeline`, and still reject it in `gameActionsCore` and `submitOrders`.

If TypeScript rejects `gameDbOps.getOne` or `ops.getOne` as `DbReadOps['getOne']`, leave that site unchanged and record it. Do not widen the helper's parameter type.

**Do not touch:** `humanMarchPreviewDiagnostics.ts` (diagnostic read with column aliases), `gameDb/databaseBootstrap.ts` (`ensureTurnStateRowWhenDbOpen` reads `SELECT 1`, and `repairStrandedStrategicResolutionPhaseWhenDbOpen` reads `phase` and may update that row; both stay), and `saveGame/saveFileInspect.ts` (reads a staged database through `prepare`).

**Doc check:** `rg -n "turnStateReads|readTurnStateRow" doc`. Update only a line that lists the module's exports.

**Verification:** The bar. `turnStateReads.test.ts`, `gameDb.test.ts`, `gameActionsProduction.test.ts`, `gameActions/airDropResolution.test.ts`, `gameActions/airFerryRoute.test.ts`, the hire and dismiss tests, `freshMatchLoad.test.ts`, and `openRouter/commanderPool.test.ts` pass unchanged. Then run `rg -n "FROM turn_state WHERE id = 1" src/main --glob '!*.test.ts'`. Only `turnStateReads.ts`, the three "Do not touch" files, and any site you recorded should match.

---

## Phase 8 — Chat Request Retry Rules

**Intent:** Inside `postOrdersChatRequest` in `src/main/openRouter/ordersChatRequestHelpers.ts`, the closure `sendPrepared` (near lines 202–241) has three copy-pasted retry blocks. The first retries after a rejected cache mark, the second after rejected consecutive user messages, and the third after a cache mark is rejected again once the messages are joined. Each block checks a predicate, logs, honors cancellation, writes an `onLog` line, records telemetry, marks the model, and resends. Replace them with an ordered table of three rules and one loop. No test covers these paths today, so pin them first.

**Add:** None.

**Edit:** `src/main/openRouter/ordersChatRequestHelpers.ts`, `src/main/openRouter/ordersChatRequestHelpers.test.ts`

**Add tests first.** Add three cases to `ordersChatRequestHelpers.test.ts`, written in its named `async function testX()` style, and call each one from `run()`. Each starts with `resetOpenRouterModelCapabilitiesForTests()` and posts through a new local helper with an orienting block:

```ts
function postCacheModelRequest(post: OpenRouterChatTransport, telemetry: OrdersChatRequestSettings['telemetry']) {
  return postOrdersChatRequest({
    post,
    key: 'k',
    modelId: 'anthropic/test-model',
    baseBody: {
      model: 'anthropic/test-model',
      messages: [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'lead-in' },
        { role: 'user', content: 'situation' },
      ],
      max_tokens: 100,
    },
    settings: { ...structuredSettings(), telemetry },
    attachResponseFormat: false,
    requestLabel: 'test',
  });
}
```

The `anthropic/` prefix makes `modelUsesExplicitPromptCache` true. With `attachResponseFormat: false`, the request goes straight to `sendPrepared`. The rejection texts must match the predicates in `promptCacheBreakpoint.ts`: `isCacheBreakpointRejection` needs the substring `cache_control`, and `isConsecutiveUserMessageRejection` matches `roles must alternate`.

| Test | Queued results | Assertions |
|------|----------------|------------|
| `testCacheMarkRejectionRetriesWithoutMark` | `{ ok: false, status: 400, error: 'cache_control is not supported' }`, then `OK_RESULT` | `result.ok` is true. 2 bodies. The first body's system message content is an array (marked). The second's is the string `'rules'` (unmarked). `telemetry.summary().fallbacks` deep-equals `['cacheBreakpointDropped']`. |
| `testRoleRejectionJoinsSituation` | `{ ok: false, status: 400, error: 'Roles must alternate' }`, then `OK_RESULT` | 2 bodies. The first has 3 messages, the second has 2, and the second's message 1 content is `'lead-in\nsituation'`. The second body's system message is still marked. Fallbacks deep-equal `['situationMessagesJoined']`. |
| `testCacheRejectionAfterJoinRetriesAgain` | the role rejection, then the cache rejection, then `OK_RESULT` | 3 bodies. The third has 2 messages and an unmarked system message. Fallbacks deep-equal `['situationMessagesJoined', 'cacheBreakpointDropped']`. |

Use `telemetryRecorder()` from the same file for the telemetry argument. If `summary().fallbacks` records more or less than the table expects against the **old** code, the old code is the truth. Fix the test's expectation to match it and record that in the Completion Log. Run all three against the unchanged production code. They must pass.

**Production edit.** Inside `postOrdersChatRequest`, after `prepareCachedBody`, define the rule shape and the ordered rules, then rewrite `sendPrepared` as one loop:

```ts
interface PreparedRetryRule {
  readonly rejects: (result: { readonly error?: string }) => boolean;
  readonly isMarked: (modelId: string) => boolean;
  readonly mark: (modelId: string) => void;
  readonly fallback: ConsultFallbackKind;
  readonly logLabel: string;
  readonly logLine: string;
}
```

Declare `PreparedRetryRule` and the rules array at **module scope**, outside the function, so each gets its own orienting block. The interface is not exported. Every field of `PreparedRetryRule` gets an orienting block, the same requirement as Phase 11. Lint fails without one. Name the array `PREPARED_RETRY_RULES: readonly PreparedRetryRule[]`. Its entries, in this order, copy today's text exactly:

| # | `rejects` | `isMarked` | `mark` | `fallback` | `logLabel` | `logLine` |
|---|-----------|-----------|--------|------------|-----------|-----------|
| 1 | `isCacheBreakpointRejection` | `isCacheBreakpointDroppedForModel` | `markCacheBreakpointDroppedForModel` | `'cacheBreakpointDropped'` | `'ordersChatRequestHelpers postOrdersChatRequest: cache breakpoint rejected'` | `'Model rejected the prompt cache mark; retrying once without it.'` |
| 2 | `isConsecutiveUserMessageRejection` | `isSituationMessagesJoinedForModel` | `markSituationMessagesJoinedForModel` | `'situationMessagesJoined'` | `'ordersChatRequestHelpers postOrdersChatRequest: consecutive user messages rejected'` | `'Model rejected two user messages; retrying once with the situation joined.'` |
| 3 | same as 1 | same as 1 | same as 1 | same as 1 | `'ordersChatRequestHelpers postOrdersChatRequest: cache breakpoint rejected after join'` | same as 1 |

Copy each string from the current file, not from this table. The array comment explains that the order matters: a provider can reject the joined messages' cache mark only after the join, so the cache rule runs again last.

`sendPrepared` becomes:

```ts
const sendPrepared = async (body: Record<string, unknown>): Promise<OpenRouterChatTransportResult> => {
  let result = await sendRecoveringToolChoice(prepareCachedBody(body));
  for (const rule of PREPARED_RETRY_RULES) {
    if (result.ok || !rule.rejects(result) || rule.isMarked(modelId)) continue;
    logInfo(rule.logLabel, { requestLabel, modelId, error: result.error });
    if (signal?.aborted) return { ok: false, error: 'Cancelled' };
    onLog?.(rule.logLine, false);
    settings.telemetry?.recordFallback(rule.fallback);
    rule.mark(modelId);
    result = await sendRecoveringToolChoice(prepareCachedBody(body));
  }
  return result;
};
```

This keeps every effect in the old order. The predicate runs only on a failed result. A cancelled signal returns at once without checking later rules, as the old early returns did. Keep `sendPrepared`'s existing comment block. Import `ConsultFallbackKind` as a type from `'./consultTelemetry'`, merged into the existing type import.

**Doc check:** `doc/ai-commander-prompts/source-inventory.md` section 4.4 describes these retries in prose. No symbol it names changes. Confirm with `rg -n "sendPrepared|PREPARED_RETRY_RULES" doc` (expect nothing).

**Verification:** The bar. The three new cases and the six existing cases in `ordersChatRequestHelpers.test.ts` pass, along with `promptCacheBreakpoint.test.ts`. `rg -c "markCacheBreakpointDroppedForModel" src/main/openRouter/ordersChatRequestHelpers.ts` shows exactly one use in the rules array, plus any import line.

---

## Phase 9 — Renderer Geometry Duplicates

**Intent:** `spanForProjectedHex` is defined byte-for-byte in both `src/renderer/rendering/renderGeometry.ts` and `src/renderer/map/terrainView.ts`. Every importer uses the `terrainView` copy, so the `renderGeometry` one is dead. `getMapZoomStrokeScale` (in `terrainRendering.ts`) is written out inline twice in `tacticalCityOverlays.ts`. Keep one definition of each in the leaf module `renderGeometry.ts`, which has no imports. Re-export them so no other importer changes.

**Add:** None.

**Edit:** `src/renderer/rendering/renderGeometry.ts`, `src/renderer/map/terrainView.ts`, `src/renderer/rendering/terrainRendering.ts`, `src/renderer/rendering/tacticalCityOverlays.ts`, `src/main/rendererPureHelperContracts.test.ts`

**Add tests first.** The renderer has no behavior tests. Its guard is the source-contract style in `rendererPureHelperContracts.test.ts`. Add two `test(...)` cases there, written in the style of `'terrainView imports projectedPolygonOverlapsViewport from renderGeometry'`:
- `terrainView.ts` does not contain `export function spanForProjectedHex(`, and `renderGeometry.ts` does.
- `tacticalCityOverlays.ts` does not contain `Math.max(0.88, Math.min(1.22`, `terrainRendering.ts` does not contain `export function getMapZoomStrokeScale(`, and `renderGeometry.ts` does.

These tests fail before the edit and pass after it. That is expected for a source-contract test, because it pins a structure and not behavior. Record that in the Completion Log.

**Edits:**

1. `terrainView.ts`: delete the `spanForProjectedHex` function and its comment block (near line 192). Add `spanForProjectedHex` to the existing `import { … } from '../rendering/renderGeometry'` line if the file uses it internally (check with `rg`), and add `export { spanForProjectedHex } from '../rendering/renderGeometry';`. `newGameMapPreviewRendering.ts` and the other importers keep importing it from `./terrainView`.
2. `renderGeometry.ts`: keep its `spanForProjectedHex` unchanged. Move `getMapZoomStrokeScale` here from `terrainRendering.ts`, with its existing comment block (near line 40), unchanged.
3. `terrainRendering.ts`: add `import { getMapZoomStrokeScale } from './renderGeometry';` for its three internal uses, and `export { getMapZoomStrokeScale } from './renderGeometry';` so `newGameMapPreviewRendering.ts` keeps working.
4. `tacticalCityOverlays.ts` (near lines 228 and 342): replace `Math.max(0.88, Math.min(1.22, 1.22 - ((zoom - 2) * (0.32 / 8))))` with `getMapZoomStrokeScale(zoom)`. Import it from `'./renderGeometry'`. Check that the variable passed in is named `zoom` at both sites. If it has another name, pass that name. `src/shared/mapLabelCityNames.test.ts` slices from the first `if (tactical)` through the first `for (const parent of`. The second zoom formula sits inside that slice. Change only that expression there. The slice must still contain `noteCityWhenCenterIsInView` and must not contain `exploredHexes`. The first formula, in `drawTacticalCityOverlays`, is outside the slice.

**Doc check:** `doc/ux/map-surface.md` (near line 147) lists `src/renderer/map/terrainView.ts`. The path is unchanged. If that section lists `spanForProjectedHex` or `getMapZoomStrokeScale` by name, add `src/renderer/rendering/renderGeometry.ts` beside it.

**Verification:** The bar. `rendererPureHelperContracts.test.ts`, `mapLabelCityNames.test.ts`, and the renderer-consolidation source-contract tests pass. `npm run check:renderer-types` shows no new entry. `rg -n "export function spanForProjectedHex|export function getMapZoomStrokeScale" src/renderer` shows only `renderGeometry.ts`.

---

## Phase 10 — Renderer Hex Hit-Test

**Intent:** Three renderer sites turn a pointer position into the hex under it. Each takes the main map's container rect, picks the tactical hit-test when `S.tacticalBattleSnapshot` is set, and otherwise hit-tests against a `Set` of `S.gameState.hexes`. Add two helpers next to the existing hit-tests in `mapHelpers.ts`.

**Add:** None.

**Edit:** `src/renderer/map/mapHelpers.ts`, `src/renderer/map/mainMapInteractions.ts`, `src/renderer/entryCallbacks.ts`, `src/renderer/map/drawInteraction.ts`, `doc/ux/hex-tooltips.md`

**New exports** in `mapHelpers.ts`, placed after `hitTestTacticalHexAtContainerPixel`:

```ts
export function hitTestMapHexAtContainerPoint(x: number, y: number, gameState: GameStateSnapshot): string | null {
  const tb = S.tacticalBattleSnapshot;
  if (tb) return hitTestTacticalHexAtContainerPixel(x, y, tb);
  return hitTestHexAtContainerPixel(x, y, new Set(gameState.hexes.map((h) => h.h3Index)));
}

export function hitTestMapHexAtClientPoint(clientX: number, clientY: number): string | null {
  if (!S.gameState) return null;
  const map = getMainLeafletMap() as { getContainer: () => HTMLElement } | null;
  if (!map) return null;
  const rect = map.getContainer().getBoundingClientRect();
  return hitTestMapHexAtContainerPoint(clientX - rect.left, clientY - rect.top, S.gameState);
}
```

Move the three-line comment in `clientXYToHit` that explains why tactical mode must not fall back to strategic hit-testing (it starts "Do not fall back to strategic hit-testing…"). It goes onto the `if (tb)` line of `hitTestMapHexAtContainerPoint`. `mapHelpers.ts` already imports `S`, `GameStateSnapshot`, and `getMainLeafletMap` from `./worldLeafletMap`. Do not add a second import. That adds no new module edge. The tooltip restore this phase changes is called from the build popup (`src/renderer/gameplay/buildQueuePopup.ts`) and the stack callout (`src/renderer/map/stackCallout.ts`). The New Game popovers do not call it.

**Edits:**

1. `mainMapInteractions.ts`: delete the nested `function clientXYToHit` (near line 408). Its two calls (near 617 and 792) become `hitTestMapHexAtClientPoint(e.clientX, e.clientY)`. The deps entry `clientXYToHit,` (near 947) becomes `clientXYToHit: hitTestMapHexAtClientPoint,`. Keep the deps property name `clientXYToHit`, because `mapDoubleClickHandler.ts` reads it. Remove the now-unused imports of `hitTestHexAtContainerPixel` and `hitTestTacticalHexAtContainerPixel` only if lint reports them. **Do not touch** `pointerHitsDrawnUnitIcon` or the `shouldHideStrategicMapUnitsForZoom` line. `rendererDrawConsolidation.test.ts` pins both.
2. `entryCallbacks.ts` `restoreTerrainTooltipAfterPopoverClose` (near lines 425–437): replace the block from `const map = getMainLeafletMap()` through the closing `}` of the `if (tb) … else …` with `hoverH3 = hitTestMapHexAtClientPoint(S.lastPointerClientX, S.lastPointerClientY);`. Keep `if (!hoverH3) return;` and `S.hoveredHexH3 = hoverH3;` after it. The function returns early when `S.gameState` is null (near line 411), and nothing awaits between that check and this block, so the helper's null guard changes nothing.
3. `drawInteraction.ts` (near lines 322–327): keep `px` and `py`. Replace `const hexSet = …`, `const tb = …`, and the ternary with `const hit = hitTestMapHexAtContainerPoint(px, py, S.gameState);`. First run `rg -n "\btb\b|hexSet" ` on the file. If `tb` or `hexSet` is used later in the same block, keep that declaration. **Do not touch** the `containerPixelHitsDrawnUnitIcon(px, py, hit, drawnAtHit.length)` line or `!shouldHideStrategicMapUnitsForZoom()`. They are pinned.
4. `doc/ux/hex-tooltips.md` Code Entry Points (near line 107): if `src/renderer/map/mapHelpers.ts` is not listed, add `- src/renderer/map/mapHelpers.ts (\`hitTestMapHexAtClientPoint\`)`, matching the list's formatting. If it is listed with a symbol list, add the new name to that list.

**Doc check:** `rg -n "clientXYToHit" doc`. Nothing is expected, because the deps property keeps its name.

**Verification:** The bar. `rendererDrawConsolidation.test.ts`, `mapGestureWiring.test.ts`, `rendererMapEntryConsolidation.test.ts`, and the stack popover contracts pass. `npm run check:renderer-types` shows no new entry. `npm run check:circular` shows only the baseline cycles. `rg -n "hexes.map\(\(h\) => h.h3Index\)" src/renderer` no longer matches the three edited sites. Add the hover-tooltip items to the user's manual checklist (Phase 15).

---

## Phase 11 — Renderer Popover Lifecycle

**Intent:** `newGameOptionsPopover.ts` and `commanderPopover.ts` attach the same four listeners when a popover opens: Escape closes it, a `pointerdown` outside the popover and its anchor closes it, and scroll (capture) or resize repositions it. Each also builds the same `detachListeners` closure and the same `placeBelowAnchor` call. Put both behaviors in one chrome module.

**Add:** `src/renderer/chrome/anchoredPopoverLifecycle.ts`

**Edit:** `src/renderer/gameplay/newGameOptionsPopover.ts`, `src/renderer/openRouter/commanderPopover.ts`, `doc/ux/new-game-dialog.md`

**New module.** `src/renderer/chrome/anchoredPopoverLifecycle.ts` imports only `placeBelowAnchor` from `'../../shared/popoverPlacement'`:

```ts
export interface AnchoredPopoverHooks {
  readonly containsTarget: (target: Node) => boolean;
  readonly close: () => void;
  readonly reposition: () => void;
}

export function attachAnchoredPopoverListeners(hooks: AnchoredPopoverHooks): () => void {
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') hooks.close();
  };
  const onPointer = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (hooks.containsTarget(target)) return;
    hooks.close();
  };
  const onMove = (): void => hooks.reposition();
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointer);
  document.addEventListener('scroll', onMove, true);
  window.addEventListener('resize', onMove);
  return () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onPointer);
    document.removeEventListener('scroll', onMove, true);
    window.removeEventListener('resize', onMove);
  };
}

export function placePopoverBelowAnchor(popover: HTMLElement, anchor: HTMLElement): void {
  // The current body of placeCommanderPopover after its guard line, unchanged.
}
```

Comments: `attachAnchoredPopoverListeners` returns the detach function, and the caller must call it exactly once when the popover closes. `placePopoverBelowAnchor` expects a visible popover, because a hidden one has an empty box. That second fact comes from the existing comment on `placeNewGameOptionsPopover`. Every interface field needs its own orienting block.

**Edits:**

1. `newGameOptionsPopover.ts` `toggleNewGameOptionsPopover` (near 61–93): replace the block from `const onKey` through the end of the `detachListeners = () => { … };` assignment with:

   ```ts
   detachListeners = attachAnchoredPopoverListeners({
     containsTarget: (target) => !!(popover?.contains(target) || anchor?.contains(target)),
     close: closeNewGameOptionsPopover,
     reposition: placeNewGameOptionsPopover,
   });
   ```

   `placeNewGameOptionsPopover` (near 124) keeps its guard `if (!popover || popover.hidden || !anchor) return;`. Its remaining body becomes `placePopoverBelowAnchor(popover, anchor);`. Drop the `placeBelowAnchor` import if lint reports it unused.
2. `commanderPopover.ts` `openCommanderPopover` (near 220–239): the same replacement, with `close: closeCommanderPopover` and `reposition: placeCommanderPopover`. `placeCommanderPopover` (near 548) keeps `if (!popover || !anchor) return;`, then calls `placePopoverBelowAnchor(popover, anchor);`. Leave `closeCommanderPopover`, `notifyClosed`, `applyOpenDraft`, and `reanchorCommanderPopover` as they are.
3. `doc/ux/new-game-dialog.md` Code Entry Points: next to `src/renderer/gameplay/newGameOptionsPopover.ts` (near line 100) and `src/renderer/openRouter/commanderPopover.ts` (near line 115), add one entry `src/renderer/chrome/anchoredPopoverLifecycle.ts` (`attachAnchoredPopoverListeners`, `placePopoverBelowAnchor`), matching the list's style. `doc/ux/opponent-tab-commander.md` (near 106) also lists `commanderPopover.ts`. Add the same entry there.

**Why it is safe:** The listener set, the capture flag, the containment test, and the detach order are unchanged. The `close` and `reposition` references are module function declarations, so they resolve the same way at event time. `!!(a || b)` has the same truthiness as the old `if (a || b)`.

**Doc check:** As in edit 3.

`commanderPopover.ts` is 559 lines. This edit must leave it under 600.

**Verification:** The bar. `npm run check:renderer-types` shows no new entry. `npm run check:circular` shows only the baseline cycles. `rg -n "addEventListener\('pointerdown'" src/renderer/gameplay/newGameOptionsPopover.ts src/renderer/openRouter/commanderPopover.ts` returns nothing. Add the popover items to the manual checklist. `commanderPopover.ts` stays under 600 lines.

---

## Phase 12 — Operation Step Types

**Intent:** `src/main/operations/seaOperationAdvance.ts` (about 919 lines) opens with the operation-step contract types. Five other modules import them, including the air operation module, which has nothing else to do with sea operations. Move the types to their own file and re-export them from the old path.

**Add:** `src/main/operations/operationStepTypes.ts`

**Edit:** `src/main/operations/seaOperationAdvance.ts`

**Edits:**

1. Create `operationStepTypes.ts` with a module comment that says it holds the contract between an operation's pure advance and the turn hook that applies its actions. Move these five exported declarations, each with its comment block and in file order, from `seaOperationAdvance.ts` into it: `OperationAction` (near line 28, with its comment starting near 20), `StoredOrderFact` (near 44), `OperationFacts` (near 73), `OperationOutcome` (near 174), and `OperationStep` (near 184, through its closing `}` near 238). Do not move `RemainingForce` or anything after it.
2. Add to the new file only the `import type` lines its declarations need. Expect `Operation` and possibly `OperationPhase` from `'../../shared/operationTypes'`. Use `import type` only. This file must have no runtime imports.
3. In `seaOperationAdvance.ts`, import the five types back with `import type { … } from './operationStepTypes';` and add `export type { OperationAction, StoredOrderFact, OperationFacts, OperationOutcome, OperationStep } from './operationStepTypes';`. The importers (`airOperationAdvance.ts`, `operationActions.ts`, `operationAdvance.ts`, `operationCommands.ts`, `operationTurnFlow.ts`) and the tests then need no change. Remove `OperationPhase` from the remaining import if lint reports it unused.
4. This file holds the user's uncommitted feature work. Edit only the moved block, the import, and the re-export. Diff the result against the Phase 12 backup. Every other line must be unchanged.

**Doc check:** `rg -n "OperationStep|OperationFacts|StoredOrderFact|seaOperationAdvance" doc`. At planning time nothing matched.

**Verification:** The bar. `seaOperationAdvance.test.ts`, `airOperationAdvance.test.ts`, `operationTurnFlow.test.ts`, and the other `src/main/operations/*.test.ts` files pass unchanged. `seaOperationAdvance.ts` drops by about 210 lines.

---

## Phase 13 — Terrain Metadata Schema

**Intent:** `src/main/terrainMetadataLoad.ts` (about 900 lines) spends lines 10–530 on the metadata schema: the schema version, classifier thresholds, resolution constants, count keys, scalerank limits, and the record and envelope interfaces. The parsing code follows. Move the schema block to its own file and re-export it.

**Add:** `src/main/terrainMetadataSchema.ts`

**Edit:** `src/main/terrainMetadataLoad.ts`

**Edits:**

1. Create `terrainMetadataSchema.ts` with a module comment that says it defines the shape and fixed limits of the bundled hex metadata files, and that `terrainMetadataLoad.ts` validates files against it. Move, in file order with their comment blocks: `EXPECTED_HEX_METADATA_SCHEMA_VERSION`, `ClassifierThresholds`, `DEFAULT_CLASSIFIER_THRESHOLDS`, `DEFAULT_NODATA_FALLBACK_TERRAIN`, `METADATA_PARENT_RESOLUTION`, `METADATA_CHILD_RESOLUTION`, `TERRAIN_METADATA_COUNT_KEYS`, `ScalerankCountRow`, `UrbanByScalerankRow`, `MAJOR_POINT_FEATURE_MAX_SCALERANK`, `URBAN_OVERLAY_MAX_SCALERANK`, `HexMetadataRecordStrategic`, `HexMetadataRecordTactical`, and `HexMetadataEnvelope`. That is everything from the comment above `EXPECTED_HEX_METADATA_SCHEMA_VERSION` (near line 10) through the closing `}` of `HexMetadataEnvelope` (near line 530). Leave the file's own module comment, if any, at the top of `terrainMetadataLoad.ts`.
2. Give the new file the imports the moved block needs: `import type { PipelineTerrainKind } from '../shared/pipelineTerrain';`, `GLOBAL_GAME_MAP` from `'../shared/activeGameMap'`, and `STRATEGIC_H3_RESOLUTION`, `TACTICAL_H3_RESOLUTION` from `'../shared/h3Resolutions'`. Keep in `terrainMetadataLoad.ts` only the imports its remaining code still uses. Lint reports any that are unused.
3. In `terrainMetadataLoad.ts`, import back what the parser uses. Then re-export every moved name so its importers need no change: one `export { … } from './terrainMetadataSchema';` for the constants and one `export type { … } from './terrainMetadataSchema';` for the interfaces.
4. Keep `recordHasMajorAirport` and `recordHasMajorSeaport` in `terrainMetadataLoad.ts`. They are functions.

**Doc check:** At planning time `rg -n "terrainMetadataLoad|EXPECTED_HEX_METADATA_SCHEMA_VERSION|DEFAULT_CLASSIFIER_THRESHOLDS" doc` matched nothing. Rerun it, and update any line that names the defining file of a moved constant.

**Verification:** The bar. `terrainMetadataParity.test.ts`, `terrainClassifierFromMetadata.test.ts`, `gameMap/westernEuropePack.test.ts`, and every other test that imports from `terrainMetadataLoad` pass unchanged. `npm run check:circular` shows only the baseline cycles. `terrainMetadataLoad.ts` is under 600 lines.

---

## Phase 14 — Pathfinding Result Types

**Intent:** `src/main/tools/pathfinding.ts` (about 946 lines) holds five tool request and result interfaces in lines 220–522: `PlanRouteOptions`, `PlanRouteOk`, `PlanRouteError`, `CheckDistanceOk`, and `CheckDistanceError`. Move them to a sibling types file and re-export them. About 32 files import from `pathfinding.ts`, and none of them changes.

**Add:** `src/main/tools/pathfindingTypes.ts`

**Edit:** `src/main/tools/pathfinding.ts`

**Edits:**

1. Create `pathfindingTypes.ts` with a module comment that says it holds the request and result shapes of the `plan_route` and `check_distance` tools. Move the five interfaces with their comment blocks, in file order.
2. The five interfaces reference `LatLng` only. Import it with `import type { LatLng } from './h3LatLng';`. Do not import from `pathfinding.ts` unless a moved field names a type that stays in that file. If one does, such as `PathfindingSession`, import it with `import type { … } from './pathfinding';`. A type-only import is erased and adds no runtime cycle. Use `import type` for every import in this file.
3. In `pathfinding.ts`, import the five types back with `import type` and add `export type { PlanRouteOptions, PlanRouteOk, PlanRouteError, CheckDistanceOk, CheckDistanceError } from './pathfindingTypes';`. Leave the existing `export type { LatLng } from './h3LatLng';` and `PathfindingSession` in place.

**Doc check:** `doc/ai-tools.md` (near line 23) names `src/main/tools/pathfinding.ts` as the tool's home. That stays true. No edit needed.

**Verification:** The bar. `tools/pathfinding.test.ts`, `pathfinding.test.ts`, `tools/standingOrders.test.ts`, and the `possibleUnitActions*.test.ts` files pass unchanged. `pathfinding.ts` drops to about 645 lines.

---

## Phase 15 — Final Verification, Doc Check, and Hand-Off

**Steps:**

1. Run the verification bar once more, then `npm run verify:modularization`. If `verify:modularization` stops on `check:circular` with only the baseline cycles, run its manifest directly with `node scripts/run-main-node-tests.cjs --manifest scripts/verify-modularization-tests.manifest`, then record both results. The last plan saw the same thing.
2. Confirm that `npm run check:circular` prints exactly the Phase 0 cycle list.
3. Run this and resolve every match in a maintained document. Skip the historical documents named in `AGENTS.md`.

   ```powershell
   rg -n "compareOrdinal|compareAscending|\bcompareIds\b|GroupTargetType|countReinforcers|\bisRecord\b" doc
   ```

4. Confirm that no plan identifier leaked: `rg -n -i "phase [0-9]+|\bv10\b|opportunit" src` must show no line this plan added. Many files contain the word "phase" for game phases. Check only lines in the files you edited.
5. Run `git status --short` and compare it with the Phase 0 output. Ignore build outputs (`static/renderer.js`, anything under `dist/`) and every file that was already changed at Phase 0. Every other changed or added file must appear in some phase's **Edit** or **Add** list, or in the Phase 2 or 3 site lists you recorded. If one does not, restore it from that phase's backup (or delete it, if it was added) and record it in the Defect Inventory.
6. Record line counts again for the Phase 0 inventory files and the new files. Every file must be under 1000 lines, and no file that started under 600 may end over 600. Expected: `seaOperationAdvance.ts` about 700, `terrainMetadataLoad.ts` under 600, `pathfinding.ts` about 645. `commanderPopover.ts` stays under 600.
7. Run the bar while Electron is closed, so the native rebuild is not locked. Then start the app with `npm start` and exercise the checklist below on the desktop window. The IDE browser does not host this app. Do it in this order: New Game options popover and commander popover from the start screen (Escape, outside click, inside click, scroll, and resize); start a match, hover strategic hexes, open the build popup or a stack callout, close it with the pointer still over a hex, and confirm the tooltip returns; enter a tactical battle, hover cells, leave the footprint, and zoom city outlines. Close Electron before any later native rebuild. If a step cannot be reached, this phase is not complete. Report which item was not verified. Do not mark it passed.
8. Fill in the Completion Log, then report to the user. Name each new module, every site left unchanged and why, the documents updated (or that none needed changes), and this manual checklist. The checklist stays in the hand-off even after the app pass.

**Manual checklist for the user (renderer phases 9–11):**

- [ ] Strategic map: move the pointer over several hexes. The hex tooltip follows the pointer and names the right hex.
- [ ] Open the build popup or a stack callout, close it with the pointer still over a hex, and confirm the hex tooltip comes back for the hex under the pointer. The New Game popovers do not take this path.
- [ ] Tactical battle: hover tactical cells, and move the pointer off the battle footprint. The tooltip clears when the pointer leaves the tactical grid.
- [ ] Tactical battle: city outlines and labels draw at the same stroke weight as before when you zoom in and out.
- [ ] New Game dialog: open the Options popover. Escape closes it. A click outside closes it. A click inside it, or on its button, does not. Scrolling the dialog and resizing the window keep it attached below its button.
- [ ] New Game dialog: open a commander popover from a side row and repeat the same four checks. Opening Options while a commander popover is open closes the commander popover.

---

## Reliability Checklist

Check each item before you mark a phase complete:

- [ ] The phase's files were backed up before the first edit.
- [ ] Tests came first, as defined in How to Use. Tests of existing code passed against the old code. A new helper's tests passed before any caller changed.
- [ ] Every new function, type, interface, field, and constant has a full orienting comment that describes behavior, not history, and is not generic filler.
- [ ] No `src/shared` or `src/renderer` file imports `logger.ts`.
- [ ] Every user-facing string, log label, `onLog` line, prompt string, and schema enum is byte-identical to the backup.
- [ ] `npm run check:circular` shows only the baseline cycles.
- [ ] No baseline file was edited.
- [ ] No commit, push, stash, checkout, restore, reset, or clean was run.
- [ ] The user's pre-existing uncommitted changes are still present, as `git diff` against the Phase 0 status shows.

## Success Definition

- All ten groups are done, or each skipped site is recorded with its reason.
- The verification bar passes. `verify:modularization`, or its manifest, passes.
- New tests pass: `codeUnitOrder`, `landUnitType`, `objectGuards`, `airStrikeTarget`, plus the additions to `liftRules.test.ts`, `turnStateReads.test.ts`, `ordersChatRequestHelpers.test.ts`, and `rendererPureHelperContracts.test.ts`.
- `seaOperationAdvance.ts`, `terrainMetadataLoad.ts`, and `tools/pathfinding.ts` are each at least 200 lines shorter.
- No behavior, prompt, IPC, schema, or save-format change.

## Locked Decisions

- Pure refactors only. The user ruled out behavior changes.
- The user's uncommitted feature work in the tree is the baseline and is edited on top of, never reverted.
- File-size work moves type and constant blocks only, with re-exports from the old path. No function bodies move between files, except the small helpers named in Phases 4, 9, and 10.
- Renderer phases are included. They are verified by build, type baseline, source contracts, the agent's pass through the running app, and the user's manual checklist.
- `isNonNullObject` and `isNonArrayObject` stay separate. The terrain loaders accept arrays today.
- Each `turn_state` caller keeps its own missing-row default.
- The `clientXYToHit` deps property keeps its name.

---

## Phase 0 Inventory

| Item | Value |
|------|-------|
| `git status --short` | `?? .spec/2026-11-14-maintainability-consolidation-execution-plan-v10.md` only. The feature work named in the steps is already committed. That commit is the baseline. |
| `npm test` | Pass. Exit 0. |
| `npm run build:renderer` | Pass. Exit 0. |
| `check:circular` cycle list | Three cycles: `orderlessUnitSuggestions` → `promptText` → `consultationText` → `envelopeContract` → `callbackVocabularyText` → `orderResponseParsing` → `productionTools` → `gameActions` → `gameActionsCore` → `standingOrders` → `standingOrdersInjectionText` → `orderlessUnitSuggestions`. `openRouterUiHelpers` → `mapToastBody` → `toastInlineMarks` → `unitDrawing` → `mapHelpers` → `worldLeafletMap` → `basemapLayer` → `openRouterUiHelpers`. `terrainTooltipStrategicState` → `selection` → `openRouterUiHelpers` → `aiPlanningState` → `commanderPoolClient` → `newGameReturn` → `controlTooltip` → `terrainTooltipStrategicState`. |
| Line counts | Every listed file exists. Oversized before edits: `seaOperationAdvance.ts` 919, `terrainMetadataLoad.ts` 900, `pathfinding.ts` 946, `sealift.ts` 935, `mainMapInteractions.ts` 973, `entryCallbacks.ts` 933. |

## Defect Inventory

| Phase | Command | First error | Action taken |
|-------|---------|-------------|--------------|
| — | — | No phase stopped. The unused-import lint in `seaOperationAdvance.ts` was fixed in the same phase and the bar was re-run green. | None. |

## Completion Log

| Phase | Result | Sites left unchanged (and why) | Sketch differences | Docs updated |
|-------|--------|-------------------------------|--------------------|--------------|
| 0 | Baseline recorded. `npm test` and `npm run build:renderer` exit 0. `check:circular` prints exactly three cycles (see Phase 0 Inventory). `git status` was only this untracked spec; that committed tree is the baseline. | — | The steps expected four cycles and uncommitted feature work. The tree had three cycles and the feature work was already committed. | None. |
| 1 | Bar exit 0. `compareCodeUnits` is UTF-16 `<` / `>`. | Field comparators stay (non-goal). | None. | `doc/terrain-pipeline.md` (`compareCodeUnits`). |
| 2 | Bar exit 0. `landMovementConstraints.ts` re-exports `isLandUnitType` and no longer defines it. | `twoAiBattleFixture.ts`, `air`/`land`/`sea`OperationCandidates.ts (later phase), every `*.test.ts`, and single-type checks. Extra parentheses around the call were left. | The first rewrite recursed; the local function was deleted before the bar. | None. `isLandUnitType` is not named in `doc/`. |
| 3 | Bar exit 0. Shared and renderer pairs rewritten. `landUnitType.ts` itself was not rewritten. | Same skips as the previous phase, plus any pair whose two comparisons differ, that lacks parentheses around `&&`/`||`, or whose value is not a string. | Imports were prepended when a file did not already start with `import`. | None. |
| 4 | Bar exit 0. Focused tests passed before callers changed. `countReinforcers` is gone. `sea` keeps `isGroundUnit` as `return isLandUnitType(unit.unitType)`. | — | None. | None. |
| 5 | Bar exit 0. Terrain loaders use `isNonNullObject`. `mapLabelPack.ts` and `vectorPackDecode.ts` use `isNonArrayObject`. | Other `typeof === 'object'` sites, including `requestOrdersToolDispatch.ts`. | None. | None. |
| 6 | Bar exit 0. Schema CHECK text was not edited. The test reads `schema.ts` and requires the same four values. | `tacticalHumanAirStrikeValidation.ts` (`targetType !== 'units' &&` is not the four-value list). `orderResponseParsing.ts` three-value check (`'urban' \|\| 'airport' \|\| 'seaport'`, excludes `'units'`). | File is `airStrikeTarget.ts` because it has a runtime array and function. | None. |
| 7 | Bar exit 0. New helpers add no log. Callers keep their own missing-row defaults. `turn_number` replaces `AS turnNumber` at the switched call sites. | `humanMarchPreviewDiagnostics.ts`, `databaseBootstrap.ts` (its read may UPDATE), `saveFileInspect.ts`. | Fourteen readers, not thirteen. | None. |
| 8 | Bar exit 0. The three sequential checks, the cancellation order, and the mark-before-resend stay. The after-join log sentence matches the first cache retry. | — | `markCacheBreakpointDroppedForModel` appears three times in the file (the import plus two rules), not once. `PreparedRetryRule` is not exported. | None. |
| 9 | Bar exit 0. Both zoom formulas call `getMapZoomStrokeScale`. The source-contract tests failed before the move and passed after it. | The contract slice still contains `noteCityWhenCenterIsInView` and does not contain `exploredHexes`. Neither formula sits inside that slice; both were still replaced. | The `terrainRendering.ts` re-export lives in the import block. | None. `doc/ux/map-surface.md` names neither function. |
| 10 | Bar exit 0. `clientXYToHit` keeps its property name. | `getMainLeafletMap` was already imported in `mapHelpers.ts`. | The old `if (!map) return` is the helper returning null plus the kept `if (!hoverH3) return`. | `doc/ux/hex-tooltips.md` (`hitTestMapHexAtClientPoint`). |
| 11 | Bar exit 0. `commanderPopover.ts` is 536 lines. Listener sets, capture flag, containment, detach order, and `placeBelowAnchor` bodies match. | The new-game panel grip keeps its own `pointerdown` listener. The new-game placement guard includes `popover.hidden`; the commander guard does not. | None. | `doc/ux/new-game-dialog.md` (twice) and `doc/ux/opponent-tab-commander.md`. |
| 12 | Bar exit 0 after the unused-import fix. `seaOperationAdvance.ts` is 709 lines (was 919). `OperationPhase` stays imported there. `RemainingForce` stays. | `StoredOrderFact` is re-exported and is not imported for local use. | None. | None. |
| 13 | Bar exit 0. Loader is 402 lines (was 900). Schema file is 532. `recordHasMajorAirport` and `recordHasMajorSeaport` stay in the loader. | Constants and types that are only re-exported are not also imported locally. | None. | None. |
| 14 | Bar exit 0. `pathfinding.ts` is 659 lines (was 946), over 600 and under 1000. `export type { LatLng }` and `PathfindingSession` stay. | — | Moved block is 315 lines in `pathfindingTypes.ts`. The estimate was about 645 lines left in `pathfinding.ts`. | None. `doc/ai-tools.md` still names `src/main/tools/pathfinding.ts`. |
| 15 | Code bar is green and was run while Electron was closed (the previous phase's `npm test`, exit 0). `verify:modularization` stopped on `check:circular` with exactly the three baseline cycles, then the manifest exited 0. Doc search for the old names found nothing. No plan identifier leaked into `src`. No inventory file is over 1000 lines. No file that started under 600 ended over 600. `sealift.ts` is 937 (was 935). App pass is complete. The three items left from the first pass were reached on a second pass. | See the app note under this table. | — | No further doc edits. |

Phase 2 production files rewritten beyond the named lists: `strategicOrderValidation.ts`, `regionScenarioSeeding.ts`, `oneStepMoveDestinations.ts`, `afterResolution.ts`, `briefingSectionsOperations.ts`, `briefingSectionsSealift.ts`, `campaignObjectiveFlow.ts`, `openRouter.ts`, `operationCandidates.ts`, `computeTacticalBattleSnapshot.ts`, `tacticalAirDrop.ts`, `tacticalAirStrikeUnits.ts`, `tacticalCombatInput.ts`, `tacticalMovementApply.ts`, `tacticalOpponentOrderValidation.ts`, `tacticalPlanStateMovement.ts`, `tacticalSealiftSlotUpdate.ts`, `tacticalSealiftStackState.ts`, `tacticalSnapshotGuards.ts`, `combatEstimationTheater.ts`, `orderlessUnitSuggestions.ts`, `standingOrdersGeneration.ts`, `tacticalPathfinding.ts`.

Phase 3 files: `humanMarchPreviewGroupAssembly.ts`, `collectTacticalLegalMoveDestinationHexes.ts`, `orderPreviewSlowTerrainTooltip.ts`, `tacticalLandMarchContinuity.ts`, `tacticalMarchBeatSearch.ts`, `tacticalMarchStepCost.ts`, `tacticalTerrainMovement.ts`, `tacticalMarchHoverPreview.ts`, `tacticalMovementPlanner.ts`, `tacticalTerrainCombatModifiers.ts`, `terrainBonusMarch.ts`, `terrainEffectsForTooltip.ts`, `selection.ts`, `mapHelpers.ts`.

App pass, after the bar. The loaded match was already inside a tactical battle, so the tactical checks ran on that battle before New Game. Strategic hover named the hex under the pointer on more than one hex. A non-observe match was started so the build popup could open; closing it with the pointer still over a hex brought the hex tooltip back. Options: Escape closes, a click outside closes, a click inside does not, and scrolling left the popover in the panel. Commander: a click inside does not close it, Escape closes it, a click outside closes it, and scrolling left it under its button. Electron was then closed. The save file was copied back from the backup taken before those clicks, and the turn-1 autosave created by the test match was deleted. The restored file's hash matches the backup. The app was not reopened.

A second pass reached the three remaining items. The New Game dialog was closed without starting a match. Resizing was a window-size change, because a pointer drag on the page closes the popover. Shrinking the window kept the Options popover open and attached to Game Options; its bottom sat on the window edge while the button was clipped, and growing the window put the popover fully above that button. With the commander popover open, shrinking the window flipped it above the model button and left it open. Opening Options while the commander popover was open closed the commander and opened Options. Start game, Ready, and Save were not used. A Save As dialog opened by a missed click was cancelled. Electron was closed. The launch flush had changed the live database hash while leaving the size at 1044480 bytes, so the file was copied back from the backup. The restored hash matches the backup. No new turn-1 autosave was created. The four earlier autosaves were left. The app was not reopened.
