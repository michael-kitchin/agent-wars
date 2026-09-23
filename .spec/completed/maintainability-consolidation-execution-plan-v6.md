# Maintainability consolidation and reuse — execution plan (v6)

Audience: a **lower-quality coding agent**. Prefer mechanical, copy-exact refactors. Avoid cleverness, generics gymnastics, and opportunistic cleanup.

Goal: improve maintainability through **consolidation, reuse, and small extractions**, with **no intended behavior change** and **fully automated verification after every phase**.

This plan continues the series in `.spec/completed/maintainability-consolidation-execution-plan-v{1..5}.md`. Everything those plans already consolidated is out of scope here and must not be re-done.

Shape: **two enablers** (a renderer type-check gate, and a reusable source-assertion helper module) followed by **nine consolidations**, as Phases 0 through 10.

---

## How to use this document

1. Work **one phase per change set**, in the order given.
2. Run the **full verification bar** (below) at the end of every phase.
3. **Stop and report** after each phase: files touched, grep results, test outcome, before/after line counts. Wait for human go-ahead before starting the next phase.
4. If a phase fails verification, **revert that phase entirely**. Do not patch forward into the next phase.
5. If a phase's diff grows beyond the files that phase lists, **stop and report** instead of expanding scope.
6. If reality disagrees with a line number, count, or claim in this document, **trust the code and stop to report the discrepancy**. Line numbers here were accurate when the plan was written and will shift as you work.
7. Never commit or push. The human reviews every change.

Every phase is verifiable by automated commands alone. **No manual smoke test is required or expected.** If you find yourself wanting to justify a change with "a human should click this", you have gone outside the plan — stop and report.

---

## Verification bar (run at the end of every phase)

```bash
npm test
npm run build:renderer
npm run check:circular
```

Notes:

- `npm test` already runs `rebuild:native:node`, `build:main`, `lint`, and every discovered `dist/**/*.test.js`. New `*.test.ts` files under `src/main` or `src/shared` are discovered automatically after `build:main`; **no `package.json` wiring is needed for new tests**.
- After Phase 1, `npm test` also runs the renderer type-check gate, which is the primary automated guard for every renderer change in later phases.
- `.github/workflows/build.yml` runs `npm run test`, so anything wired into the `test` script is automatically covered in CI. Nothing else needs to change in the workflow.
- `npm run check:circular` compares against `scripts/circular-deps-baseline.json`. It fails only on **new or reshaped** cycles. There are 46 known baseline cycles; do not try to fix them here.
- If `check:circular` reports a new cycle caused by your change, **fix the import direction** rather than refreshing the baseline. Refreshing a baseline to silence a new finding is not allowed anywhere in this plan.

---

## Non-goals (explicit)

1. No gameplay rule changes: no movement costs, combat math, pathfinding, fog, or production changes.
2. No change to any emitted **prompt text**, briefing text, toast text, log message text, IPC **channel name strings**, or generated JSON schemas. Copy strings verbatim when moving code.
3. No large decomposition of `src/renderer/renderer.ts`, `src/main/game-actions/gameActionsCore.ts`, `src/main/gameDb.ts`, `src/renderer/gameplay/readyHandler.ts`, or `src/shared/ipc/readyTypes.ts`. This plan takes only the narrow, named slices below.
4. No migration of hand-built markdown prompt tables onto `buildPromptTableLines`. The separator strings differ (`|---------|` versus `| --- |`), so migrating would change prompt bytes.
5. No splitting of `src/renderer/core/state.ts`. Its ~40 importers make it too risky for automated-only verification.
6. No extraction of `renderSealiftSection` or the stack callout out of `renderer.ts`, and no extraction of the duplicated resolution-playback pass in `drawGameScene`. Those are async DOM, IPC, and canvas paths with no automated behavior coverage.
7. No dependency upgrades, no `@types/leaflet`, no preload bundling change.
8. No fixing of the 53 pre-existing renderer type errors beyond the specific defects named in Phase 2. The rest are captured as a baseline.
9. No plan, phase, or opportunity identifiers in source, comments, configuration, or `doc/`. This `.spec` file is the only place they may appear.

---

## Baseline facts (re-measure in Phase 0)

Observed while planning:

| Area | File | Lines | Why it matters here |
|------|------|------:|---------------------|
| Renderer entry | `src/renderer/renderer.ts` | 3023 | One wrong-path type import; otherwise untouched by this plan |
| Ready flow | `src/renderer/gameplay/readyHandler.ts` | 1175 | Six identical tool-count rollbacks; two identical continent-name loops |
| Renderer source assertions | `src/main/rendererConsolidation.test.ts` | 1097 | Already over the 1000-line hard limit; two phases need to add assertions |
| Tactical guards | `src/main/tacticalBattle/tacticalSnapshotGuards.ts` | 695 | Two ~130-line near-identical movement-outcome functions |
| Strategic sealift | `src/main/game-actions/sealift.ts` | 923 | Two private slot helpers duplicated in tactical code |
| DB ops types | `src/main/game-db/dbOps.ts` | 195 | Declares `DbWriteOps` and `DbReadOps` twice |
| IPC guards | `src/main/ipcPayloadGuards.ts` | 369 | Two grouped-payload parsers differ only by field name |
| Renderer tsconfig | `tsconfig.renderer.json` | 11 | `rootDir` makes the project uncompilable; renderer TS is never type-checked |

Renderer type-check state today (with `rootDir` corrected): **53 errors across 14 files** — 18 `TS18048`, 13 `TS18047`, 9 `TS2345`, 5 `TS2353`, 4 `TS2300`, and one each of `TS2307`, `TS2352`, `TS2488`, `TS2322`.

---

## Conventions the executing agent must follow

### Orienting comments (enforced by ESLint)

`eslint-rules/require-orienting-block.cjs` runs as an **error** on `src/**/*.ts`. Every new or changed module-level function, class member, interface member, and enum member needs exactly **one** `/** ... */` block immediately before it, with:

- A first summary line that does **not** contain `Purpose:`, `Contract:`, or `When to use:`.
- Then four labeled lines, each with non-empty text: `Purpose:` (or `Contract:` for interface and abstract members), `When to use:`, `Expected outcome:`, `Exceptions:`.

Use this shape, filled in with real content:

```ts
/**
 * Registers an IPC handler that logs entry, catches failures, and returns a fallback.
 *
 * Purpose: Collapses identical try/catch+logError wrappers for read-only loaders.
 * When to use: When a handler's failure mode is "log and return fallback" with a stable debug label.
 * Expected outcome: Successful invokes return `handler()`; thrown errors log and return `fallback`.
 * Exceptions: Does not rethrow; always returns `T`.
 */
```

Members with `override` are exempt. Do not stack two `/** */` blocks before one declaration — the rule rejects that.

New `scripts/*.cjs` functions are not linted, but still get the same five-line comment shape. Match the style already in `scripts/run-main-node-tests.cjs`.

### Logging

Use `logDebug` / `logTrace` / `logError` from `src/main/logger.ts`. Signature is `(message: string, ...args: unknown[]) => void`.

- New **main-process** public functions: `logDebug` once on entry with the identifying arguments.
- New main-process getter-style functions that do not modify state: `logTrace`.
- Every `catch`: `logError`.
- **`src/shared` modules must not log.** This is a hard technical constraint, not a style preference: `src/main/logger.ts` imports `fs` and `path`, and `src/shared` is bundled into the browser renderer by esbuild. Importing the logger into shared code would break `npm run build:renderer` or crash at runtime.
- **`src/renderer` modules must not log.** They have none today; do not introduce it.
- Message style: `functionName: event` with objects as later arguments, for example `logDebug('readTurnStateRow', { hasRow: row !== undefined })`.

### Tests

- Colocate `*.test.ts` next to the module, under `src/main` or `src/shared` only. Renderer files cannot host tests — `tsconfig.main.json` never compiles them to `dist`, so the runner cannot see them.
- Either existing style is acceptable. Prefer the `node:test` style for new files:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('describes the contract', () => {
  assert.deepEqual(actual, expected);
});
```

- Test **happy paths and essential failure cases only**. Do not test accessors, DTO shapes, or pure pass-through delegation.
- Do not add a test whose only assertion is that a function exists.

### Renderer source-text assertions

Renderer code cannot be unit-tested, so refactors there are guarded two ways: the type-check gate from Phase 1, and source-text assertions that prove duplicated code is gone and the new module is imported and called.

`src/main/rendererConsolidation.test.ts` holds today's assertions and is **already 1097 lines, over the 1000-line hard limit**. Therefore:

- Phase 7 extracts its `getFunctionSource` and `assertMatches` helpers into `src/main/testSupport/rendererSourceAssertions.ts`.
- Phases 8 and 9 put their new assertions in **new topic-scoped test files** that import those helpers. **Do not append to `rendererConsolidation.test.ts`.**
- This plan does not bring that file under the limit; it only stops the growth. Splitting its existing contents is recorded as out of scope for a future plan.

Use source-text assertions only to prove code moved. Do not try to simulate canvas or DOM behavior.

### Documentation impact

`doc/README.md` is authoritative about which docs track which engine symbols (combat constants, unit caps, fog radii, tactical budgets, resolution phase order, tool names). **None of the phases in this plan change any of those symbols or their values, so no file under `doc/` needs editing.** Before reporting a phase complete, confirm you have not renamed or moved a symbol listed in the `doc/README.md` tracking table. If you have, stop and report rather than editing `doc/`.

---

## Opportunities, in execution order

**Enablers**

- **A. Renderer type-check gate.** `tsconfig.renderer.json` sets `rootDir` to `src/renderer`, so the project cannot compile at all (`TS6059` for every `src/shared` import) and no npm script type-checks the renderer. Add a corrected config plus a baseline-gated checker so all later renderer work is automatically verified.
- **B. Reusable source-assertion helpers.** `getFunctionSource` and `assertMatches` are private to an over-limit test file; new assertions have nowhere compliant to live.

**Consolidations**

1. **Two real defects the gate exposes.** `renderer.ts` imports a type from `'../../shared/unitDisplayNames'` (wrong depth, silently `any`), and `openRouterUiHelpers.ts` has a duplicated import line producing four `TS2300` errors.
2. **`dbOps.ts` duplicate declarations.** `DbWriteOps` and `DbReadOps` are each declared twice (interface merging hides it), plus three unused types.
3. **`readTurnStateRow`.** The literal `'SELECT phase, turn_number FROM turn_state WHERE id = 1'` appears in four modules.
4. **Grouped IPC payload parsers.** `parseGroupedTargetPayload` and `parseGroupedDestinationPayload` differ only by the H3 field name.
5. **Sealift slot assignment and normalization.** `buildSlotsByNavalId` / `normalizeSlots` in strategic sealift are duplicated as `tacticalSlotsByNavalSubIds` / `normalizeTacticalSealiftSlots` in tactical code (~55 duplicated lines, pure, currently untested).
6. **Shared HTML text formatting.** A five-character HTML escaper and a semicolon-group naming formatter each exist twice in the renderer.
7. **`projectedPolygonOverlapsViewport`.** Identical implementations in `terrainView.ts` and `renderGeometry.ts`.
8. **`readyHandler` repetition.** Six identical tool-count rollbacks and two identical eleven-line unknown-battle continent-name loops.
9. **Twin tactical movement-outcome functions.** `tacticalComputeMovementOrderOutcome` and `tacticalComputeHumanMovementOrderOutcome` are ~130 lines each and differ in only three places.

Consolidations 6 and 7 ship together in one phase; the rest get one phase each.

---

## Phases

### Phase 0 — Baseline (no source change)

**Intent:** Prove the tree is green and record numbers so later diffs are provably mechanical.

**Files:** this document only (fill in the inventory section at the bottom).

**Steps:**

1. Run the verification bar. Confirm green **before** editing anything. If `npm test` is already red, stop and report; do not start Phase 1.
2. Record line counts (PowerShell: `(Get-Content <file> | Measure-Object -Line).Lines`) for:
   - `src/renderer/renderer.ts`
   - `src/renderer/gameplay/readyHandler.ts`
   - `src/main/rendererConsolidation.test.ts`
   - `src/main/tacticalBattle/tacticalSnapshotGuards.ts`
   - `src/main/game-actions/sealift.ts`
   - `src/main/tacticalBattle/tacticalSealiftStackState.ts`
   - `src/main/game-db/dbOps.ts`
   - `src/main/ipcPayloadGuards.ts`
   - `src/renderer/map/terrainTooltipRes1State.ts`
   - `src/renderer/gameplay/buildQueuePopupFormatting.ts`
   - `src/renderer/map/terrainView.ts`
   - `src/renderer/rendering/renderGeometry.ts`
3. Record grep counts:
   - `rg -n "SELECT phase, turn_number FROM turn_state" src`
   - `rg -n "toolCountsBeforeReadyClick" src/renderer/gameplay/readyHandler.ts`
   - `rg -n "projectedPolygonOverlapsViewport" src/renderer`
   - `rg -n "normalizeTacticalSealiftSlots" src/main`
   - `rg -n "player: 'opponent'," src/main/tacticalBattle/tacticalSnapshotGuards.ts`
4. Record the current renderer type-error count for reference:
   `npx tsc -p tsconfig.renderer.json --noEmit --rootDir src 2>&1 | rg -c "error TS"`
   Expect **53**. If the number differs materially, note it and continue; Phase 1 generates the real baseline anyway.

**Verification:** bar is green with zero source changes.

**Stop gate:** Report the inventory. Wait for go-ahead.

---

### Phase 1 — Renderer type-check gate

**Intent:** Make renderer TypeScript compile-checkable and add a baseline-gated guard, so every later renderer change is automatically verified. This phase enables Phases 2, 8, and 9.

**Opportunities covered:** enabler A.

**Files:**

- **Edit** `tsconfig.renderer.json`
- **Add** `scripts/renderer-typecheck-report.cjs`
- **Add** `scripts/renderer-typecheck-report.test.cjs`
- **Add** `scripts/check-renderer-typecheck.cjs`
- **Add** `scripts/dump-renderer-typecheck-baseline.cjs`
- **Add** `scripts/renderer-typecheck-baseline.json`
- **Edit** `scripts/run-main-node-tests.cjs` (register the new `.cjs` test)
- **Edit** `package.json` (three scripts plus two pipeline wirings)

**Steps:**

1. Fix `tsconfig.renderer.json`. Set `"rootDir": "src"`, add `"noEmit": true`, and remove `"outDir": "static"` (nothing uses it; `build:renderer` produces `static/renderer.js` through esbuild). Leave `extends`, `module`, `target`, `lib`, and `include` unchanged. Result:

   ```json
   {
     "extends": "./tsconfig.base.json",
     "compilerOptions": {
       "module": "ESNext",
       "target": "ES2022",
       "noEmit": true,
       "rootDir": "src",
       "lib": ["ES2022", "DOM", "DOM.Iterable"]
     },
     "include": ["src/renderer/**/*.ts", "src/renderer/**/*.d.ts"]
   }
   ```

2. **Immediately run `npm run lint` and stop if it is not green.** `eslint.config.js` lists this file in `parserOptions.project`, so the config change alters the TypeScript program ESLint uses. Lint is green today and must stay green. If new lint errors appear, revert the tsconfig edit and report — do not start silencing them.

3. Add `scripts/renderer-typecheck-report.cjs` with three exported functions and no side effects on require:

   - `normalizeTypecheckErrorLines(rawOutput)` — split on `/\r?\n/`; keep only lines matching `/^(\S.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/`; return `` `${filePath}|${code}|${message}` `` for each, with backslashes in `filePath` replaced by `/`. Indented continuation lines and config-level diagnostics that do not match the pattern are ignored. **Line and column are deliberately dropped** so moving code inside a file does not churn the baseline.
   - `computeDisallowedTypecheckEntries(entries, baselineEntries)` — returns the entries that are not present in `baselineEntries`. Keep it pure: take arrays, build the `Set` internally, return an array.
   - `runRendererTypecheck()` — `spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.renderer.json'], { cwd: repoRoot, encoding: 'utf8' })`, concatenate `stdout` and `stderr`, and return `{ raw, entries: normalizeTypecheckErrorLines(raw) }`. `require.resolve('typescript/bin/tsc')` resolves in this repo; `--noEmit` is already in the tsconfig so do not pass it again.

   Each gets the five-line orienting comment shape. Keep the file under 140 lines.

4. Add `scripts/renderer-typecheck-report.test.cjs` using `node:test` and `node:assert/strict`. Test only the two pure functions:

   - `normalizeTypecheckErrorLines`: two real-looking error lines from different files normalize as expected; indented continuation lines and non-matching lines are dropped.
   - `computeDisallowedTypecheckEntries`: an entry absent from the baseline is returned; an entry present in the baseline is not.

   Do **not** invoke `tsc` from the test.

5. Register the test: in `scripts/run-main-node-tests.cjs`, add `'renderer-typecheck-report.test.cjs'` to the `for (const extraName of [...])` list. The loop already guards with `fs.existsSync`, so nothing else changes.

6. Add `scripts/dump-renderer-typecheck-baseline.cjs`: require the report module, run the type-check, sort `entries`, and write `JSON.stringify(sorted, null, 2)` to the path in `process.argv[2]` (default `scripts/renderer-typecheck-baseline.json`). Mirror the intent comment style of `scripts/dump-circular-deps.cjs`.

7. Generate the baseline:

   ```bash
   node scripts/dump-renderer-typecheck-baseline.cjs scripts/renderer-typecheck-baseline.json
   ```

   Confirm it is a JSON array with roughly 53 entries.

8. Add `scripts/check-renderer-typecheck.cjs`, following the structure of `scripts/check-circular-deps.cjs`:

   - Read the baseline array.
   - Run the type-check, then `computeDisallowedTypecheckEntries(entries, baseline)`.
   - Fail with `process.exit(1)` and print each disallowed entry when there are any.
   - Also fail if `entries.length > baseline.length`, printing both counts. This catches a second copy of an already-baselined message.
   - Otherwise print `check-renderer-typecheck: ok`, the entry count, and any baseline entries that no longer occur (reported as resolved, not a failure).
   - Include a top-of-file comment saying the baseline is refreshed with `node scripts/dump-renderer-typecheck-baseline.cjs scripts/renderer-typecheck-baseline.json`, and that it must **never** be refreshed to hide a newly introduced error.

9. Add to `package.json` scripts:

   - `"typecheck:renderer": "tsc -p tsconfig.renderer.json"`
   - `"check:renderer-types": "node scripts/check-renderer-typecheck.cjs"`
   - `"dump:renderer-types-baseline": "node scripts/dump-renderer-typecheck-baseline.cjs scripts/renderer-typecheck-baseline.json"`

   Then wire the gate into both pipelines, inserting `npm run check:renderer-types` immediately after `npm run lint`:

   - `test`: `... && npm run lint && npm run check:renderer-types && node scripts/run-main-node-tests.cjs`
   - `verify:modularization`: add `&& npm run check:renderer-types` after its existing `npm run lint`.

**Verification:**

- `npm run lint` green (step 2).
- `npm run typecheck:renderer` reports real errors instead of failing on config: `npm run typecheck:renderer 2>&1 | rg -c "TS6059"` finds no matches.
- `npm run check:renderer-types` prints `ok`.
- Full bar green. `npm test` now includes the gate.
- The gate's own failure path is covered by the `computeDisallowedTypecheckEntries` unit test, so no temporary broken-code experiment is needed. Do not introduce one.

**Stop gate:** Report the baseline entry count, the lint result, and the `check:renderer-types` output. Wait for go-ahead.

---

### Phase 2 — Fix the two defects the gate exposes

**Intent:** Remove two real latent defects that were invisible while the renderer was unchecked, and prove the baseline shrinks.

**Opportunities covered:** #1.

**Files:**

- **Edit** `src/renderer/openRouter/openRouterUiHelpers.ts` (delete one line)
- **Edit** `src/renderer/renderer.ts` (one line)
- **Edit** `scripts/renderer-typecheck-baseline.json` (regenerate)

**Steps:**

1. `src/renderer/openRouter/openRouterUiHelpers.ts` lines 7 and 8 are the identical import:

   ```ts
   import { READY_REQUEST_TIMEOUT_MS, TOAST_DURATION_MS } from '../core/constants';
   ```

   Delete the duplicate, keeping exactly one. This clears four `TS2300` errors.

2. `src/renderer/renderer.ts` around line 2838, inside `buildKillToastFormatterBundle`, the parameter reads:

   ```ts
   killLabelUnits?: import('../../shared/unitDisplayNames').UnitDisplayIdentity[]
   ```

   `renderer.ts` sits at `src/renderer/`, so the correct specifier is `'../shared/unitDisplayNames'` — the same path the static import at line 23 already uses. Change it, and make the array `readonly` so it matches the backing module's parameter type:

   ```ts
   killLabelUnits?: readonly import('../shared/unitDisplayNames').UnitDisplayIdentity[]
   ```

   Do not change the function body or the delegate call. Do not change `renderer.ts` anywhere else. Fixing the path also stops silently degrading this parameter to `any`, which is why the `readonly` is needed: the delegate's declared parameter is `readonly`.

3. Re-run `npm run typecheck:renderer` and confirm `TS2307` and `TS2300` are gone. The pre-existing `TS2322` about `killLabelUnits` should also disappear once the array is `readonly`; that is expected.

4. Regenerate the baseline: `npm run dump:renderer-types-baseline`. Diff it and confirm the change is **only removals**. If any entry was **added**, stop and report — an added entry means step 2 introduced a new type error, and you must fix that rather than accept it into the baseline.

**Verification:**

- Full bar green.
- New baseline entry count is strictly lower than the Phase 1 count. Report both numbers and the removed entries.
- `rg -n "\.\./\.\./shared/" src/renderer/renderer.ts` returns nothing.
- `rg -c "READY_REQUEST_TIMEOUT_MS, TOAST_DURATION_MS" src/renderer/openRouter/openRouterUiHelpers.ts` returns 1.

**Stop gate:** Report; wait for go-ahead.

---

### Phase 3 — `dbOps.ts` duplicate declarations

**Intent:** One declaration per DB ops type, so a future reader is not silently relying on interface declaration merging.

**Opportunities covered:** #2.

**Files:**

- **Edit** `src/main/game-db/dbOps.ts`

**Steps:**

1. The file has two blocks. The first (through `DbRowRecord`) contains everything other modules import: `DbWriteOps`, `DbReadOps`, `DbAvailabilityOps`, `BasicDbOps`, `GuardedDbOps`, `GuardedDbRunAndGetAllOps`. The second re-declares `DbWriteOps` and `DbReadOps` and adds `DbQueryOps`, `DbConnectionStateOps`, `DbConnectedQueryOps`.

2. Confirm the second block's additions are unused before deleting:

   ```bash
   rg -n "DbQueryOps|DbConnectionStateOps|DbConnectedQueryOps|DbRowRecord" src
   ```

   Expect hits **only** inside `src/main/game-db/dbOps.ts`. If any other file references them, stop and report instead of deleting.

3. Delete the entire second block — the duplicate `DbWriteOps` and `DbReadOps` declarations and the three unused types, with their orienting comments. Also delete `DbRowRecord`, which becomes unreferenced once the second `DbReadOps` is gone (the surviving `DbReadOps` uses `Record<string, unknown>` inline).

4. Change nothing else. Do not rename the surviving types, do not add types, and do not touch any importing module.

**Verification:**

- Full bar green (`build:main` inside `npm test` proves every importer still compiles).
- `rg -c "export interface DbWriteOps" src/main/game-db/dbOps.ts` returns 1; same for `export interface DbReadOps`.
- `rg -n "DbQueryOps|DbConnectionStateOps|DbConnectedQueryOps|DbRowRecord" src` returns nothing.
- Report before and after line count for `dbOps.ts` (expect roughly 195 to 106).

**Stop gate:** Report; wait for go-ahead.

---

### Phase 4 — `readTurnStateRow`

**Intent:** One place that knows how to read the current phase and turn number, so the SQL and row shape cannot drift across four modules.

**Opportunities covered:** #3.

**Files:**

- **Add** `src/main/game-db/turnStateReads.ts`
- **Add** `src/main/game-db/turnStateReads.test.ts`
- **Edit** `src/main/tacticalBattle/computeTacticalBattleSnapshot.ts`
- **Edit** `src/main/tacticalBattle/tacticalBattlePersistence.ts`
- **Edit** `src/main/game-actions/gameActionsReadyEntrypoints.ts`
- **Edit** `src/main/game-actions/meleeInterceptStrategicResolve.ts`

**Steps:**

1. Create `src/main/game-db/turnStateReads.ts`. Take the accessor as a parameter (the injected-accessor style `loadScenarioState` already uses in `src/main/game-db/scenarioState.ts`), but as a bare function so call sites stay short:

   ```ts
   export type TurnStateRow = { phase: string; turn_number: number };

   export function readTurnStateRow(
     getOne: DbReadOps['getOne']
   ): TurnStateRow | undefined {
     logTrace('readTurnStateRow');
     return getOne<TurnStateRow>('SELECT phase, turn_number FROM turn_state WHERE id = 1');
   }
   ```

   Import `DbReadOps` as a type from `./dbOps`, and `logTrace` from `../logger` — this is a read-only accessor, so `logTrace`, not `logDebug`. Many `src/main/game-db` modules already import the logger, so this introduces no new dependency shape. Copy the SQL string **character for character** from the existing call sites. Orienting comments on the type and the function.

2. Replace all four call sites. Each currently reads:

   ```ts
   const turnRow = dbGetOne<{ phase: string; turn_number: number }>(
     'SELECT phase, turn_number FROM turn_state WHERE id = 1'
   );
   ```

   and becomes:

   ```ts
   const turnRow = readTurnStateRow(dbGetOne);
   ```

   Keep the local variable name and every downstream condition exactly as-is. Confirm each site really uses `dbGetOne`; if one uses a different accessor, pass that accessor. Do not change any surrounding guard, log message, or return value.

3. Test with a fake `getOne`: one happy case (fake returns a row; assert the row is returned and that the SQL string the fake received equals the expected literal) and one essential failure (fake returns `undefined`; assert `undefined` is returned).

**Verification:**

- Full bar green, including `npm run check:circular` — the new module imports only a type from `./dbOps` and the logger, so it cannot create a cycle; confirm anyway.
- `rg -n "SELECT phase, turn_number FROM turn_state" src` hits only `src/main/game-db/turnStateReads.ts` and its test.
- `rg -n "readTurnStateRow" src` shows the four call sites plus the module and test.

**Stop gate:** Report; wait for go-ahead.

---

### Phase 5 — Grouped IPC payload parser

**Intent:** One parser for "unit id list plus one H3 string" so the two grouped-order payload shapes cannot validate differently.

**Opportunities covered:** #4.

**Files:**

- **Edit** `src/main/ipcPayloadGuards.ts`
- **Add or edit** `src/main/ipcPayloadGuards.test.ts` (create if absent)

**Steps:**

1. In `src/main/ipcPayloadGuards.ts`, add a private helper next to the existing parsers. It takes the **raw values**, not the payload object and a field name — passing the object plus a string key would force an index-signature workaround and give a weaker type:

   ```ts
   function parseUnitIdsWithH3(
     unitIdsRaw: unknown,
     h3IndexRaw: unknown
   ): { unitIds: string[]; h3Index: string } | null {
     const unitIds = parseUnitIdList(unitIdsRaw);
     if (unitIds === null) return null;
     if (typeof h3IndexRaw !== 'string') return null;
     return { unitIds, h3Index: h3IndexRaw };
   }
   ```

2. Rewrite the two public parsers as thin wrappers that **keep their exact current signatures and returned property names**:

   ```ts
   export function parseGroupedTargetPayload(payload: {
     unitIds?: unknown;
     targetH3Index?: unknown;
   }): { unitIds: string[]; targetH3Index: string } | null {
     const parsed = parseUnitIdsWithH3(payload?.unitIds, payload?.targetH3Index);
     if (!parsed) return null;
     return { unitIds: parsed.unitIds, targetH3Index: parsed.h3Index };
   }
   ```

   and the same shape for `parseGroupedDestinationPayload` with `payload?.destinationH3Index`.

   The original short-circuit was `if (unitIds === null || typeof payload?.targetH3Index !== 'string') return null;`. The helper splits that into two checks **in the same order**, so the observable result is identical. Do not reorder the unit-id parse relative to the H3 check.

3. Leave `parseGroupedStrikePayload` and every other parser in the file alone. Its `targetType` validation is not part of this phase.

4. Tests: for each public parser, one happy case (valid ids plus valid H3 returns the expected object with the expected property name) and two essential failures (missing or non-string H3 field returns `null`; invalid `unitIds` returns `null`). If `ipcPayloadGuards.test.ts` already exists, add to it rather than creating a second file.

**Verification:**

- Full bar green.
- `rg -n "parseUnitIdsWithH3" src/main/ipcPayloadGuards.ts` shows one definition and two uses.
- No call-site churn: `rg -n "parseGroupedTargetPayload|parseGroupedDestinationPayload" src/main/main.ts` shows the same sites as before.

**Stop gate:** Report; wait for go-ahead.

---

### Phase 6 — Sealift slot assignment and normalization

**Intent:** One implementation of the sealift slot rules (armor occupies slot 1 alone; otherwise up to two infantry in lexicographic order) shared by the strategic DB path and the tactical snapshot path, and unit-tested for the first time.

**Opportunities covered:** #5.

The tactical copies are behaviourally identical to the strategic originals; the existing orienting comment on `tacticalSlotsByNavalSubIds` even says it mirrors `buildSlotsByNavalId`. This phase makes that literal.

**Placement note:** the new module goes under `src/main/game-actions/`, **not** `src/shared/`. Both consumers are main-process, tests under `src/main` are discovered the same way, and shared should not accumulate main-only domain logic.

**Files:**

- **Add** `src/main/game-actions/sealiftSlotAssignment.ts`
- **Add** `src/main/game-actions/sealiftSlotAssignment.test.ts`
- **Edit** `src/main/game-actions/sealift.ts`
- **Edit** `src/main/tacticalBattle/tacticalSealiftStackState.ts`
- **Edit** `src/main/tacticalBattle/tacticalSealiftSlotUpdate.ts`

**Steps:**

1. Create `src/main/game-actions/sealiftSlotAssignment.ts` exporting:

   ```ts
   export type SealiftSlotPair = { slot1UnitId: string | null; slot2UnitId: string | null };
   export type SealiftSlotAssignmentRow = {
     landUnitId: string;
     navalUnitId: string;
     landUnitType: 'infantry' | 'armor';
   };

   export function buildSealiftSlotsByNavalId(
     navalIds: readonly string[],
     assignments: readonly SealiftSlotAssignmentRow[]
   ): Map<string, SealiftSlotPair>;

   export function normalizeSealiftSlots(
     navalIds: readonly string[],
     slotsByNavalId: Map<string, SealiftSlotPair>,
     landTypeById: ReadonlyMap<string, 'infantry' | 'armor'>
   ): void;
   ```

   Copy the bodies **verbatim** from `buildSlotsByNavalId` (`src/main/game-actions/sealift.ts`, around lines 355 to 383) and `normalizeSlots` (around lines 393 to 422). Keep the mutate-in-place contract of `normalizeSealiftSlots` — callers depend on it, and its `Expected outcome:` line must say so. Add `logDebug` on entry to each function with `{ navalCount, assignmentCount }` and `{ navalCount }` respectively (main-process public functions). Orienting comments on both types and both functions, stating the slot rules in `Expected outcome:`.

2. `src/main/game-actions/sealift.ts`: delete `buildSlotsByNavalId` and `normalizeSlots`. Import the shared functions. Keep the local name `SealiftSlots` working by aliasing it, so the file's other five references need no edit:

   ```ts
   type SealiftSlots = SealiftSlotPair;
   ```

   Delete the old `interface SealiftSlots` declaration and its orienting comment; a type alias is not visited by the orienting-comments lint rule, so no comment is required on the alias, though a short one is welcome. Replace the two call sites with `buildSealiftSlotsByNavalId(...)` and `normalizeSealiftSlots(...)`, same arguments in the same order. `satisfies SealiftSlots` at the end of the file keeps working with an alias.

3. `src/main/tacticalBattle/tacticalSealiftStackState.ts`: delete `tacticalSlotsByNavalSubIds` and the exported `normalizeTacticalSealiftSlots`. Import and call the shared functions. Do not change any other logic in `buildTacticalSealiftStackStateFromSnapshot`.

4. `src/main/tacticalBattle/tacticalSealiftSlotUpdate.ts`: delete the local `type SealiftSlots = { ... }` at line 22, import `SealiftSlotPair`, and replace the `normalizeTacticalSealiftSlots` import and call with `normalizeSealiftSlots`. Leave `embarkOrdersFromTacticalSlots` alone.

5. Tests in `src/main/game-actions/sealiftSlotAssignment.test.ts`, happy paths and essential failures only:

   - `buildSealiftSlotsByNavalId`: armor takes slot 1 and clears slot 2; two infantry land in lexicographic order; a naval id with no assignments gets both slots `null`.
   - `normalizeSealiftSlots`: a land id claimed by two carriers is kept only on the first; a land id missing from `landTypeById` is cleared; slot 2 promotes to slot 1 when slot 1 is empty; armor in slot 2 moves to slot 1 and clears slot 2.

**Verification:**

- Full bar green, including `npm run check:circular`. `tacticalSealiftStackState.ts` already imports `../game-actions/sealift`, and the new module imports only the logger, so no new cycle is possible; confirm anyway.
- `rg -n "function buildSlotsByNavalId|function normalizeSlots|function tacticalSlotsByNavalSubIds|normalizeTacticalSealiftSlots" src` returns nothing.
- `rg -n "buildSealiftSlotsByNavalId|normalizeSealiftSlots" src` shows the new module, its test, and the three consumers.
- Report before and after line counts for `sealift.ts` and `tacticalSealiftStackState.ts`.

**Stop gate:** Report; wait for go-ahead.

---

### Phase 7 — Reusable renderer source-assertion helpers

**Intent:** Give the next two phases a compliant home for their source-text assertions, instead of growing a test file that is already over the hard size limit.

**Opportunities covered:** enabler B.

**Files:**

- **Add** `src/main/testSupport/rendererSourceAssertions.ts`
- **Edit** `src/main/rendererConsolidation.test.ts`

**Steps:**

1. Create `src/main/testSupport/rendererSourceAssertions.ts` (this directory already holds four fixture modules) exporting three functions with orienting comments:

   - `getFunctionSource(source: string, functionName: string): string` — move the body **verbatim** from `rendererConsolidation.test.ts` (around lines 18 to 40). Do not change the regex or the brace-depth scan.
   - `assertMatches(source: string, pattern: RegExp, message: string): void` — move verbatim.
   - `readRendererSource(...segments: string[]): string` — new convenience wrapper returning `fs.readFileSync(path.resolve(process.cwd(), 'src', 'renderer', ...segments), 'utf8')`, matching the path pattern used throughout the existing test file.

   No logging: this is test support, and adding logger noise to every assertion helps nobody. Say so in the `Exceptions:` line if you like, but do not import the logger.

2. In `src/main/rendererConsolidation.test.ts`, delete the two moved helper definitions and import them from `./testSupport/rendererSourceAssertions`. Change **nothing else** in that file — do not rewrite its `fs.readFileSync` call sites to use `readRendererSource`, and do not touch any assertion. The goal is the smallest possible diff.

3. Add no tests. These are test helpers exercised by every consumer; a test for `getFunctionSource` would be testing test infrastructure and is not warranted.

**Verification:**

- Full bar green. `rendererConsolidation.test.ts` must still appear in the `npm test` output and still pass every assertion it had before.
- `rg -c "function getFunctionSource" src/main` returns 1, in `testSupport/rendererSourceAssertions.ts`.
- Report before and after line count for `rendererConsolidation.test.ts` (expect roughly 1097 to 1062). It remains over the 1000-line hard limit; that pre-existing violation is out of scope here, and the next two phases must not add to it.

**Stop gate:** Report; wait for go-ahead.

---

### Phase 8 — Renderer pure helper consolidation

**Intent:** Give two duplicated pure helpers one tested home each. Both are pure, so the type-check gate plus new unit tests give full automated coverage.

**Opportunities covered:** #6 and #7.

**Files:**

- **Add** `src/shared/htmlTextFormatting.ts`
- **Add** `src/shared/htmlTextFormatting.test.ts`
- **Add** `src/main/rendererPureHelperContracts.test.ts`
- **Edit** `src/renderer/gameplay/buildQueuePopupFormatting.ts`
- **Edit** `src/renderer/map/terrainTooltipRes1State.ts`
- **Edit** `src/renderer/map/terrainView.ts`

**Steps:**

1. Create `src/shared/htmlTextFormatting.ts` with two exports, bodies copied verbatim from `src/renderer/gameplay/buildQueuePopupFormatting.ts` (lines 26 to 58):

   - `escapeHtmlText(text: string): string` — the five-`replaceAll` chain for `&`, `<`, `>`, `"`, `'`.
   - `formatGroupedSemicolonNamingLineHtml(namingLine: string): string` — the semicolon-split, colon-heading `<strong>` formatter, calling `escapeHtmlText`.

   This module must be a **leaf with zero imports**, so it can never participate in a cycle and so the renderer bundle stays small. It lives in `src/shared` because renderer files cannot host tests; note in the module's header comment that it is renderer-facing formatting. No logging (see the logging rules).

   **Do not touch `escapeHtmlForOrderPreviewTooltip` in `src/shared/orderPreviewSlowTerrainTooltip.ts`.** It escapes only four characters (no `'`), so folding it in would change its output. Leave it exactly as it is; its `Expected outcome:` line already documents the four-character contract.

2. `src/renderer/gameplay/buildQueuePopupFormatting.ts`: replace both function bodies with one-line delegates that keep the existing exported names and orienting comments, so no importer needs renaming:

   ```ts
   export function escapeBuildPopupHtml(text: string): string {
     return escapeHtmlText(text);
   }
   ```

   Grep first to see who imports them: `rg -n "escapeBuildPopupHtml|formatGroupedBuildNamingLineHtml" src`. Keep `sanitizeBuildCountInputText` untouched. This file gains its first import; that is fine, because the new module is a leaf, but re-run `npm run check:circular` to confirm.

3. `src/renderer/map/terrainTooltipRes1State.ts`: delete the private `escapeHtml` (line 615) and the private `formatGroupedNamingLineHtml` (line 639). Import `escapeHtmlText` and `formatGroupedSemicolonNamingLineHtml` and update the in-file call sites, including `formatLlmLocationBoldPrefixHtml`. Change nothing else in this 765-line file. Note that `rendererConsolidation.test.ts` already asserts on other functions in this file (`featureLabelsForRes4Child`, `terrainStateForPointer`, `formatTerrainTooltipHtml`, `getUrbanProductionCapacityForHex`); leave all of those alone so those assertions keep passing.

4. `src/renderer/map/terrainView.ts`: delete its copy of `projectedPolygonOverlapsViewport` (lines 164 to 181) and import the identical function from `../rendering/renderGeometry`. Confirm the two bodies match before deleting; they do. Keep `shouldConsiderRes4ChildrenForViewport` and `shouldDrawRes4ChildHexInViewport` in `terrainView.ts` — they are named wrappers with their own orienting comments and call sites, and they now delegate to the imported function. If any other module imported `projectedPolygonOverlapsViewport` from `terrainView.ts`, keep a one-line re-export.

5. Tests in `src/shared/htmlTextFormatting.test.ts`:

   - `escapeHtmlText`: all five metacharacters are encoded in one string; ordinary text is unchanged. Assert explicitly that `'` becomes `&#39;`, since that is exactly what distinguishes this helper from the order-preview escaper.
   - `formatGroupedSemicolonNamingLineHtml`: a two-group line yields both headings wrapped in `<strong>` joined by `'; '`; a group with no colon is escaped and passed through; a heading with no remainder yields `<strong>Heading:</strong>`.

   Do **not** test `projectedPolygonOverlapsViewport`. It lives in `src/renderer` and is never compiled to `dist`; its guards are the type-check gate and the source assertion below.

6. Create `src/main/rendererPureHelperContracts.test.ts`, importing `getFunctionSource` / `readRendererSource` from `./testSupport/rendererSourceAssertions`, following the style of `rendererConsolidation.test.ts` (named `test*` functions plus a `run()` at the bottom, or `node:test` — either is fine). Assert:

   - `src/renderer/map/terrainTooltipRes1State.ts` does **not** contain `function escapeHtml(` and does contain an import of `escapeHtmlText`.
   - `src/renderer/map/terrainView.ts` does **not** contain `export function projectedPolygonOverlapsViewport(` and does contain an import from `'../rendering/renderGeometry'`.
   - `src/renderer/gameplay/buildQueuePopupFormatting.ts` imports `escapeHtmlText` and no longer contains the `replaceAll('&', '&amp;')` chain.

   Do not add these to `rendererConsolidation.test.ts`.

**Verification:**

- Full bar green, including `npm run check:renderer-types` (a wrong import path or arity surfaces here — this is exactly why Phase 1 comes first) and `npm run check:circular`.
- `rg -n "function escapeHtml\b" src/renderer` returns nothing.
- `rg -c "export function projectedPolygonOverlapsViewport" src/renderer` returns 1, in `renderGeometry.ts`.
- Renderer type-check baseline **unchanged**. If an entry was added, fix the cause; do not regenerate the baseline in this phase.

**Stop gate:** Report; wait for go-ahead.

---

### Phase 9 — `readyHandler` repetition

**Intent:** Remove six copies of a tool-count rollback and two copies of an eleven-line async loop from the largest renderer gameplay file, and make the loop's collection logic testable.

**Opportunities covered:** #8.

**Files:**

- **Add** `src/shared/unknownBattleContinentNames.ts`
- **Add** `src/shared/unknownBattleContinentNames.test.ts`
- **Add** `src/main/readyHandlerSourceContracts.test.ts`
- **Edit** `src/renderer/gameplay/readyHandler.ts`

**Steps:**

1. Create `src/shared/unknownBattleContinentNames.ts` with one function whose IPC dependency is injected so it can be tested:

   ```ts
   export async function collectUnknownBattleContinentNames(
     unknownCombatHexes: readonly string[],
     unknownCasualtyHexes: readonly string[],
     fetchContinentNames: ((h3Index: string) => Promise<readonly string[]>) | undefined
   ): Promise<string[]>
   ```

   Preserve today's behavior exactly, in this order:

   - Start with an empty result array.
   - If `fetchContinentNames` is `undefined`, return the empty array.
   - Concatenate combat then casualty hexes and de-duplicate with the existing first-occurrence filter, preserving order.
   - Await each hex **sequentially** in a `for` loop. Do not use `Promise.all`; the current code awaits one at a time and changing that changes IPC ordering and concurrency.
   - Push each returned name only if not already present.

   Leaf module, renderer-facing, no imports, no logging (see the logging rules). Orienting comment on the function.

2. In `src/renderer/gameplay/readyHandler.ts`, replace both duplicated blocks (lines 918 to 928 in the tactical branch and 1168 to 1178 in the strategic branch) with a call to the new function. Hoist the method into a `const` first, so the narrowing survives inside the closure without a non-null assertion:

   ```ts
   const getContinentNames = window.gameApi?.getHexContinentNames;
   const unknownContinentNames = await collectUnknownBattleContinentNames(
     unknownCombatHexes,
     unknownCasualtyHexes,
     getContinentNames ? (h3Index) => getContinentNames({ h3Index }) : undefined
   );
   ```

   The original calls it as a method (`window.gameApi.getHexContinentNames({ h3Index })`). Preload APIs exposed through `contextBridge` are plain functions that do not use `this`, so an unbound reference behaves identically. If you are not confident of that for this API, keep the method-call form instead by writing `const api = window.gameApi;` and calling `api.getHexContinentNames({ h3Index })` inside the closure. Either way, **do not add a non-null assertion** to silence the type-check gate — if it complains, restructure the narrowing.

   Keep the surrounding `hasUnknownBattle` guard and the following `deps.showMapToast(deps.formatUnknownBattleAnnouncement(unknownContinentNames), { isError: false });` byte-identical in both branches.

3. Add a private helper in `readyHandler.ts` for the tool-count rollback and use it at all six sites (lines 718, 728, 755, 998, 1007, 1039):

   ```ts
   function rollbackReadyToolCounts(
     deps: ReadyHandlerDeps,
     snapshot: Readonly<typeof S.toolInvocationCounts>
   ): void
   ```

   It assigns `S.toolInvocationCounts = snapshot;` then calls `deps.updateOpenRouterToolCountLabels();`.

   All six sites were verified to be exactly that two-statement pair, so all six can be replaced. Match the real declared type of `S.toolInvocationCounts` rather than inventing `Record<string, number>`. Do **not** try to also extract the neighbouring `showSidebarError` / `updateReadyButtonState` / `return` sequence: five of the six sites share it, but `return` cannot be moved into a helper without changing control flow. If any site turns out not to be the plain two-statement pair, leave that site alone and say which in your report.

4. Tests in `src/shared/unknownBattleContinentNames.test.ts`:

   - Happy path: overlapping combat and casualty hexes are queried once each in first-occurrence order, and duplicate continent names appear once in the result. Assert the recorded call order from a fake fetcher.
   - Essential failure: an `undefined` fetcher returns an empty array without throwing.

5. Create `src/main/readyHandlerSourceContracts.test.ts` using the helpers from `./testSupport/rendererSourceAssertions`. Assert:

   - `readyHandler.ts` imports `collectUnknownBattleContinentNames` and its source no longer contains `if (!unknownContinentNames.includes(n))`.
   - `readyHandler.ts` contains `function rollbackReadyToolCounts(` exactly once, and contains `S.toolInvocationCounts = toolCountsBeforeReadyClick;` exactly the number of times you deliberately left alone — state that number in the assertion message. If you replaced all six, that count is zero.

   Do not add these to `rendererConsolidation.test.ts`.

**Verification:**

- Full bar green, including `npm run check:renderer-types` and `npm run check:circular`.
- `rg -c "S.toolInvocationCounts = toolCountsBeforeReadyClick" src/renderer/gameplay/readyHandler.ts` matches the number you reported.
- `rg -n "getHexContinentNames" src/renderer/gameplay/readyHandler.ts` shows only the two injected-callback sites.
- Renderer type-check baseline unchanged.
- Report before and after line count for `readyHandler.ts`.

**Stop gate:** Report; wait for go-ahead.

---

### Phase 10 — Twin tactical movement-outcome functions

**Intent:** One movement-projection implementation for human and opponent tactical march orders. This is the largest single duplication in the codebase (~130 near-identical lines) and it is last because it carries the most behavior risk.

**Opportunities covered:** #9.

**Files:**

- **Edit** `src/main/tacticalBattle/tacticalSnapshotGuards.ts`
- **Edit** `src/main/tacticalBattle/tacticalMovementApply.test.ts`

**Steps:**

1. Read `tacticalComputeMovementOrderOutcome` (lines 330 to 486) and `tacticalComputeHumanMovementOrderOutcome` (lines 496 to 658) side by side. They differ in exactly **three** places:

   - **Player guard.** Opponent: `if (u.player !== 'opponent') return { ok: false, reason: 'non_opponent', ... }`. Human: `if (u.player !== 'human') return { ok: false, reason: 'non_human', ... }`.
   - **Embarked land units.** The human version early-returns `'embarked_cargo'` when an infantry or armor sub-unit is embarked and ordered to a different hex. The opponent version instead computes `opponentDebarkingIndependently` and pathfinds with a clone that has `embarkedOnSubUnitId: undefined`, using that clone for both `tacticalMovementUnitTypeForPathfinding` and `effectiveTacticalMovementPointBudgetForMarchLeg`.
   - **The `player` value** passed to three `tacticalLogMutate` payloads, to `rejectIfAppliedDestFriendlyOccupied`, and to `logTacticalMarchPlanOk` — five occurrences in each function.

   Everything else — footprint check, air rejection, budget, `planTacticalRes4MarchWithSessionCache`, best-effort neighbor recovery, friendly-occupancy rejection, no-progress check, and all log payload shapes — is identical. If you find a **fourth** difference, stop and report before writing any code.

2. **Write the two new tests described in step 5 first, confirm they pass against today's unmodified code, and only then refactor.** They cover the exact behavior this refactor puts at risk; writing them afterwards would prove nothing, because a test written against refactored code cannot detect that the refactor changed the contract.

3. Add one private implementation immediately above the two public functions:

   ```ts
   function tacticalComputeMovementOrderOutcomeForPlayer(
     player: 'human' | 'opponent',
     args: TacticalMovementOrderOutcomeArgs
   ): TacticalMovementOrderOutcome
   ```

   Extract the shared `args` object type and the shared return union into two named types (`TacticalMovementOrderOutcomeArgs`, `TacticalMovementOrderOutcome`) so all three signatures reference them instead of repeating the long `Pick<TacticalBattleSnapshot, ...>` literal. Copy the `Pick` field list verbatim; do not add or remove a field.

   In the body:

   - Player guard: `if (u.player !== player) return { ok: false, reason: player === 'opponent' ? 'non_opponent' : 'non_human', context: { unitId: args.order.unitId } };`
   - Embarked handling: keep both paths behind one `if (player === 'human') { ... } else { ... }` at the **same position in the sequence** as today. The human branch early-returns `'embarked_cargo'`; the opponent branch computes `pathfindUnit`. In the human branch `pathfindUnit` is simply `u`.
   - Everywhere the old bodies wrote `player: 'opponent'` or `player: 'human'`, write the shorthand `player,`.

   Preserve **statement order exactly**. When a guard runs determines which reason a caller sees, so reordering is a behavior change even when every guard is still present.

4. Turn both public functions into one-line delegates, keeping their exported names and parameter shapes. Update the orienting comments to describe the delegation while keeping the same `Contract:`, `Expected outcome:`, and `Exceptions:` content:

   ```ts
   export function tacticalComputeMovementOrderOutcome(
     args: TacticalMovementOrderOutcomeArgs
   ): TacticalMovementOrderOutcome {
     return tacticalComputeMovementOrderOutcomeForPlayer('opponent', args);
   }
   ```

5. Add exactly two tests to `src/main/tacticalBattle/tacticalMovementApply.test.ts`. **Nothing in the repo currently asserts `non_human` or `embarked_cargo`**, which means two of the three divergence points are unguarded today. The other two divergences are already covered there and need no new test: the opponent auto-debark case at line 69 (`projectTacticalSnapshot auto-debarks embarked opponent land on independent march`) and the wrong-player case at line 167 (a human sub-unit handed to the opponent projection).

   Use the existing fixture pattern in that file — `tacticalRes1Cell`, `tacticalRes4UnderRes1Corner`, and `firstRingCellDistinctFrom` from `./testSupport/tacticalRes4HexFixtures`, plus the local `coastalFootprintTerrain` helper — and copy the shape of the test at line 69:

   - **Human embarked cargo is not moved independently.** A human naval sub-unit and a human infantry sub-unit with `embarkedOnSubUnitId` set to it, both on the same cell. Order the infantry to a different ring cell via `projectTacticalSnapshotAfterHumanMovementOrders`. Assert the infantry's `h3Index` is unchanged and its `embarkedOnSubUnitId` is still set. This is the human/opponent asymmetry: the opponent test at line 69 asserts the opposite outcome for the same input shape.
   - **Wrong player is rejected by the human projection.** An opponent infantry sub-unit ordered through `projectTacticalSnapshotAfterHumanMovementOrders`. Assert its `h3Index` is unchanged.

   Do not add tests for the delegation wrappers themselves.

**Verification:**

- Full bar green. Confirm `tacticalMovementApply.test.ts`, `tacticalOpponentMarchConsultationParity.test.ts`, and `tacticalRes4MovementPlanner.test.ts` all appear in the `npm test` output and pass.
- The two new tests passed **before** the refactor as well as after. Report both runs.
- `rg -n "player: 'opponent'," src/main/tacticalBattle/tacticalSnapshotGuards.ts` returns nothing, and the same for `player: 'human',`. Today there are five of each (opponent at lines 402, 416, 446, 453, 474; human at 574, 588, 618, 625, 646); all ten become the bare `player,` shorthand. The two type-declaration lines that read `player: 'opponent' | 'human';` (lines 117 and 234) stay.
- `rg -n "tacticalComputeMovementOrderOutcomeForPlayer" src/main` shows one definition and two delegate calls.
- Report before and after line count for `tacticalSnapshotGuards.ts` (expect roughly 695 down to under 600, bringing the file under the desirable size limit).
- If any existing test fails, that is a real behavior change: revert this phase and report the failing assertion rather than editing the test.

**Stop gate:** Report. Plan is complete after this phase's report.

---

## Reliability checklist (run every phase)

1. Diff is limited to the files the phase lists.
2. Every moved error string, log message, SQL string, and fallback value is byte-identical to the original.
3. Statement order and short-circuit conditions are unchanged.
4. Orienting comments on every new and changed function, field, and interface member; exactly one block per declaration.
5. Main-process logging rules satisfied for new functions; no logging added under `src/renderer` or `src/shared`.
6. No phase, opportunity, or plan identifiers anywhere in source, comments, configuration, or `doc/`.
7. No symbol named in the `doc/README.md` tracking table was renamed or moved.
8. Every new module is well under 600 lines; no new or changed parameter list exceeds 6 named parameters.
9. New renderer source assertions went into new topic-scoped test files, not into `rendererConsolidation.test.ts`.
10. `npm test`, `npm run build:renderer`, and `npm run check:circular` all green; renderer type-check baseline unchanged except where a phase explicitly regenerates it.
11. Grep gates for the phase recorded in the handoff report.
12. On any failure: revert the phase whole; do not start the next phase.

---

## Success definition

1. Both enablers and all nine consolidations are implemented as specified.
2. `npm test` type-checks the renderer on every run, in CI as well as locally, and the renderer type-error baseline is **smaller** than the Phase 1 baseline (Phase 2 removed entries; Phases 8 and 9 added none).
3. The following have exactly one implementation each: sealift slot assignment and normalization, the five-character HTML escaper, the semicolon-group naming formatter, `projectedPolygonOverlapsViewport`, the `turn_state` read, the grouped unit-ids-plus-H3 parse, the ready tool-count rollback, the unknown-battle continent-name collection, and the tactical movement-outcome projection.
4. `src/main/game-db/dbOps.ts` declares each type once.
5. `getFunctionSource` and `assertMatches` are shared test support, and `rendererConsolidation.test.ts` did not grow.
6. Previously untested behavior gained coverage: sealift slot rules, the `turn_state` read, the grouped payload parsers, the HTML formatters, the continent-name collection, and the `non_human` / `embarked_cargo` tactical divergences.
7. No intended behavior change anywhere; every emitted string is unchanged.
8. Every phase was verified by automated commands alone.

---

## Locked decisions

1. **Scope mix:** verification and test-infrastructure enablers first, then dedup and reuse, with narrow named slices of the oversized files. No mega-file decomposition campaign.
2. **Verification is fully automated.** No phase depends on a human smoke test. Opportunities that would have required one (stack callout and `renderSealiftSection` extraction, the `drawGameScene` resolution-playback pass, the `state.ts` split) are deliberately excluded.
3. **Renderer type errors are baselined, not fixed.** Only the four `TS2300` duplicate-identifier errors and the one `TS2307` broken import are fixed, because they are unambiguous defects.
4. **No baseline is ever refreshed to hide a new finding.** The type-check baseline is regenerated only in Phase 2, and only after confirming the diff contains removals exclusively. The circular-dependency baseline is never regenerated in this plan.
5. **Prompt and briefing text is frozen.** No markdown-table migration onto `buildPromptTableLines`, since the separator strings differ.
6. **`escapeHtmlForOrderPreviewTooltip` stays separate** from the new shared escaper. It escapes four characters, not five; unifying them would change tooltip output.
7. **`normalizeSealiftSlots` keeps its mutate-in-place contract.** Callers depend on it; do not convert it to a pure function.
8. **Placement rule.** Main-only domain logic goes under `src/main` (Phase 6). Renderer-facing pure logic goes under `src/shared` only because renderer files cannot host tests, and such modules must be leaves with no imports and no logging (Phases 8 and 9). Say so in the module header.
9. **`rendererConsolidation.test.ts` stays over the hard size limit.** This plan stops it growing and extracts its helpers. Splitting its existing contents into topic-scoped files is recorded for a future plan.
10. **Cadence:** one phase per change set, stop and report, wait for go-ahead. Revert rather than patch forward.
11. **Out of scope, recorded for a future plan:** coaching-bullet dedup in `src/main/openrouter/promptSpec/` (`tempoBullet`, `optionCopyOrRoutingBullet`), `parseHumanTacticalCommitPayload` decomposition, the grouped-validation preamble in `gameActionsCore.ts`, sealift slot-update IPC handler unification, `gameDb.ts` open-and-validate consolidation, and splitting `rendererConsolidation.test.ts`.

---

## Final verification (after Phase 10)

```bash
npm test
npm run build:renderer
npm run check:circular
npm run verify:modularization
```

Then report, in one table: before and after line counts for `renderer.ts`, `readyHandler.ts`, `rendererConsolidation.test.ts`, `tacticalSnapshotGuards.ts`, `sealift.ts`, `tacticalSealiftStackState.ts`, `dbOps.ts`, `ipcPayloadGuards.ts`, `terrainTooltipRes1State.ts`, and `terrainView.ts`; the renderer type-error baseline count at Phase 1 versus final; and the list of new modules and test files added.

---

## Phase 0 inventory (fill in during Phase 0)

Line counts (`Measure-Object -Line`, non-blank):

| File | Lines |
|------|------:|
| `src/renderer/renderer.ts` | 3023 |
| `src/renderer/gameplay/readyHandler.ts` | 1175 |
| `src/main/rendererConsolidation.test.ts` | 1097 |
| `src/main/tacticalBattle/tacticalSnapshotGuards.ts` | 680 |
| `src/main/game-actions/sealift.ts` | 923 |
| `src/main/tacticalBattle/tacticalSealiftStackState.ts` | 167 |
| `src/main/game-db/dbOps.ts` | 166 |
| `src/main/ipcPayloadGuards.ts` | 369 |
| `src/renderer/map/terrainTooltipRes1State.ts` | 765 |
| `src/renderer/gameplay/buildQueuePopupFormatting.ts` | 56 |
| `src/renderer/map/terrainView.ts` | 220 |
| `src/renderer/rendering/renderGeometry.ts` | 46 |

Grep counts:

| Pattern | Count |
|---------|------:|
| `SELECT phase, turn_number FROM turn_state` under `src` | 4 |
| `toolCountsBeforeReadyClick` in `readyHandler.ts` | 7 (1 snapshot + 6 assignments) |
| `projectedPolygonOverlapsViewport` under `src/renderer` | 2 definitions + wrappers |
| `normalizeTacticalSealiftSlots` under `src/main` | 4 (export, two calls, one import) |
| `player: 'opponent',` in `tacticalSnapshotGuards.ts` | 5 |

Renderer type-error count before Phase 1: **53**

Pre-existing verification notes:

- `npm test` initially failed lint (`no-regex-spaces` in `src/main/openrouter/promptContracts.test.ts`). Applied the two-character `{2}` autofix so the suite could run. After that, `npm test` exited 0.
- `npm run build:renderer` exited 0.
- `npm run check:circular` is **already red** (8 cycles not in `scripts/circular-deps-baseline.json`). This plan does not refresh that baseline. Later phases treat "no additional disallowed cycles" as the circular gate.

---

## Phase completion log (append one entry per phase)

### Phase 0

Inventory recorded. `npm test` green after the two-line lint autofix. `build:renderer` green. `check:circular` pre-red (baseline drift).

### Phase 1

`tsconfig.renderer.json` now uses `rootDir: src` and `noEmit`. Renderer type-check report/check/dump scripts and baseline JSON are in `scripts/`. `package.json` wires `check:renderer-types` into `npm test` after lint. `scripts/run-main-node-tests.cjs` runs `renderer-typecheck-report.test.cjs`. Gate green at 47 unique entries after Phase 2 dump (Phase 0 raw tsc line count was 53 before duplicate collapse).

### Phase 2

Removed the duplicate import in `openRouterUiHelpers.ts`. `renderer.ts` kill-label path now imports `../shared/unitDisplayNames` with a `readonly` parameter. Baseline regenerated with removals only; `check:renderer-types` stays at 47.

### Phase 3

Deleted the second duplicate interface block in `src/main/game-db/dbOps.ts`. Each `Db*` contract is declared once.

### Phase 4

`src/main/game-db/turnStateReads.ts` owns the singleton `SELECT phase, turn_number FROM turn_state WHERE id = 1`. Four call sites (`gameActionsReadyEntrypoints`, `computeTacticalBattleSnapshot`, `tacticalBattlePersistence`, `meleeInterceptStrategicResolve`) use `readTurnStateRow`. Tests cover found-row and missing-row.

### Phase 5

`parseUnitIdsWithH3` is the shared grouped parser. `parseGroupedTargetPayload` and `parseGroupedDestinationPayload` delegate to it. Tests cover happy path and missing-H3 / non-array `unitIds`.

### Phase 6

`src/main/game-actions/sealiftSlotAssignment.ts` owns `buildSealiftSlotsByNavalId` and in-place `normalizeSealiftSlots`. Consumers: `sealift.ts`, `tacticalSealiftStackState.ts`, `tacticalSealiftSlotUpdate.ts`. Tests cover armor-in-slot-1, two-infantry lexicographic order, unused naval ids, duplicate land ids, missing land types, and armor promotion from slot 2.

### Phase 7

`getFunctionSource`, `assertMatches`, and `readRendererSource` live in `src/main/testSupport/rendererSourceAssertions.ts`. `rendererConsolidation.test.ts` imports them and did not grow (1097 → 1065 non-blank lines).

### Phase 8

`src/shared/htmlTextFormatting.ts` is the renderer-facing leaf for `escapeHtmlText` and `formatGroupedSemicolonNamingLineHtml`. `buildQueuePopupFormatting.ts` and the terrain tooltip delegate to it. `terrainView.ts` imports `projectedPolygonOverlapsViewport` from `renderGeometry.ts`. `rendererPureHelperContracts.test.ts` plus shared unit tests cover the contracts. Type baseline unchanged at 47.

### Phase 9

`rollbackReadyToolCounts` is the single Ready tool-count restore helper (six call sites). `collectUnknownBattleContinentNames` in `src/shared/unknownBattleContinentNames.ts` is the continent-name loop. `readyHandlerSourceContracts.test.ts` plus shared unit tests cover both. Type baseline unchanged at 47.

### Phase 10

Private `tacticalComputeMovementOrderOutcomeForPlayer` is the single projection. Public `tacticalComputeMovementOrderOutcome` and `tacticalComputeHumanMovementOrderOutcome` are one-line delegates. Human `embarked_cargo` vs opponent auto-debark stays behind one `if (player === 'human')` at the original sequence position. Grep: no `player: 'opponent',` or `player: 'human',` remain in `tacticalSnapshotGuards.ts`; one definition and two delegate calls of the private helper. `tacticalSnapshotGuards.ts` 680 → 575 non-blank lines.

New tests in `tacticalMovementApply.test.ts` (embarked cargo unchanged for human; opponent ignored by human projection) passed before and after the merge (8/8). Full `npm test` green, including `tacticalMovementApply.test.ts`, `tacticalOpponentMarchConsultationParity.test.ts`, and `tacticalRes4MovementPlanner.test.ts`. `build:renderer` green. `check:renderer-types` 47. `check:circular` still pre-red (same 8 cycles vs baseline; none added). `verify:modularization` fails at `check:circular` for that pre-existing drift.

### Post-implementation audit

Hardened `isRendererTypecheckRunUsable` so check and dump fail when `tsc` exits non-zero with no parsed per-file errors (config diagnostics only) or when spawn fails. Rewrote orienting comments on the updated grouped parsers, movement-outcome argument/result types, and the Ready rollback helper. Left pre-existing generic comments on untouched declarations (including remaining `dbOps.ts` members and `handleReadyButtonClick`) unchanged.

