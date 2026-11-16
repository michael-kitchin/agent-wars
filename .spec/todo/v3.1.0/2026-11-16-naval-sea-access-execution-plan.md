# Naval Sea Access Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** A ship can be built, raised as a mercenary, or boarded only at a seaport it can sail out of: the hex itself, or a hex next to it, must be water or coast. Today a land seaport with only land around it builds ships that can never move.

**Shape:** Phase 0 records a baseline and the facts the plan depends on. Phases 1 and 2 add the rule and the way to read it, with nothing calling them yet. Phase 3 changes the build functions' signatures without changing behavior. Phases 4 through 7 each switch on one part of the rule. Phase 8 runs the final verification and the doc check, and hands the user a manual checklist. Each phase can be verified with the phases before it.

**Tech:** TypeScript, `h3-js`, `better-sqlite3`, `node:test`, ESLint with the local `orienting-comments` rule, `scripts/ui-smoke/`.

**Order:** This plan does not depend on the charts and replay plans, and they do not depend on it. It can run before, between, or after them. `2026-11-15-history-0-meta-plan.md` lists it.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Stop only when a verification fails** and the phase's "If verification fails" steps do not fix it. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, merge, rebase, or open a pull request, and never run `git checkout`, `git restore`, `git reset`, or `git clean`. Read-only commands such as `git status`, `git diff`, and `git log` are fine. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, except to remove an import that lint reports unused in a listed file, or to fix a test that fails only because of a change the phase names (record that file in the Completion Log).
- Find code by the quoted text, not by a line number. Line numbers in this plan are approximate.
- **Code blocks are sketches.** Write the real code from the file you just read. When a sketch and the file disagree, the file wins. Record the difference in the Completion Log. **User-facing strings and prompt text in this plan are not sketches.** Copy them exactly.
- **Tests come first.** Write each phase's tests, run them and watch the new ones fail, then make the change and watch them pass. A new test that passes before the change is a finding about the test. Fix the test before you go on.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Run this from the repo root. Set `$step` to the phase number and `$files` to that phase's **Edit** list.

```powershell
$step = '1'
$files = @('src/main/productionRules.ts')
$backup = Join-Path $env:TEMP "aw-naval-sea-access\step-$step"
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

- `npm test` runs the native rebuild, `build:main`, `lint`, `naming:check`, `check:renderer-types`, every compiled `dist/main/**/*.test.js` and `dist/shared/**/*.test.js`, and `notices:check`. It takes about 20 minutes. New `*.test.ts` files under `src/main` or `src/shared` are discovered automatically. Tests under `src/renderer` are **not** run.
- `npm run check:circular` passes when it prints **exactly** the cycles recorded in Phase 0 and no others. Type-only imports are erased and cannot cause a cycle.
- `npm run check:renderer-types` compares renderer type errors with a baseline. A **new** error fails. Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a gate pass.
- **Quick loop while you work:** `npm run build:main`, then `node dist/main/<path>.test.js` (or `dist/shared/...`). This is a shortcut only. The full bar decides pass or fail.
- **Native module lock.** If `npm test` fails in `rebuild:native:node` with `EBUSY` on `better_sqlite3.node`, close any running Electron app, rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`, rerun `npm test`, then delete the `.locked` file.
- **No test may call a real model.** Do not set an OpenRouter key.
- **Renderer phases also run `npm run ui:smoke`** when the phase says so. If `ui:smoke` cannot run on this machine, say so in the Completion Log. The user's manual checklist covers it.
- **Source contracts.** Renderer code is checked by tests under `src/main` that read renderer source with `readRendererSource`, `getFunctionSource`, and `assertMatches` from `src/main/testSupport/rendererSourceAssertions.ts`. Read `src/main/buildQueuePopupSourceContracts.test.ts` for the style before adding to one.

---

## Conventions

These come from `.cursor/rules/` (which `CLAUDE.md` imports for Claude Code) and `AGENTS.md`. Read every rule file once before Phase 1. Lint enforces some of them.

### Code

- **Orienting comments.** Every new or changed field, property, function, method, and enum member gets a JSDoc block directly above it, private and non-exported ones included. So do new types, interfaces, and constants. The block is a one-line summary, then `Purpose:` (or `Contract:` for interface members), `When to use:`, `Expected outcome:`, and `Exceptions:`. Write what the code does, when to call it, what it returns, and what it throws.
- **No filler.** Do not copy generic text such as "Supports maintainability by documenting why…" or "Use per team conventions…". When you change a declaration whose existing comment is filler (`buildProductionEligibilityView` in `buildQueue.ts` is one), replace that comment with specific text in the same edit.
- **Logging in `src/main`.** Use `logTrace`, `logDebug`, `logInfo`, and `logError` from `src/main/logger.ts`, and add no `console` calls. Each new or changed exported function logs `logDebug` when it is called. One that only reads state logs `logTrace` instead. Pass values as the extra argument (`logTrace('…', { h3Index, seaAccess })`), not inside the message string. New private helpers add no log lines.
- **No logging in `src/shared` or `src/renderer`.** Shared modules are bundled into the renderer, so they must never import `src/main/logger.ts`.
- **Names.** camelCase files, directories, and functions, PascalCase types, UPPER_SNAKE constants. Follow `doc/naming-conventions-contract-v1.md`. Use the names this plan gives.
- **Arguments.** At most six named parameters (rule 10). A parameter object counts as one.
- **File size.** No file may pass 1000 lines (rule 09). `src/main/gameActions/sealift.ts` is about 910 lines: add only the lines Phase 6 names.
- **Reuse.** Use `isNativeNavalTransitTerrain` and `isLandSeaportHex` from `src/shared/navalStrategicEdges.ts`. Do not write another test for "is this water".
- **Tests.** Test the contract (inputs, outputs, and observable effects) on happy paths and essential failures only. Do not test private helpers. A new test file goes beside the code it covers and copies the imports and structure of the nearest sibling test file.
- **Secrets.** No test or log contains a key, a prompt body, or message text.

### Documents

- **Keep `doc/` current.** `AGENTS.md` requires `doc/` to change in the same change as the code. Each phase names the documents it updates. Mechanics documents follow the engine. The UX suite is normative.
- **Prompt documents.** The builders under `src/main/openRouter/` win when `doc/ai-commander-prompts/` drifts from them. When Phase 7 changes prompt text, update the example prompt to match.
- **Take numbers and names from the code,** and name the symbol they come from.
- **No plan vocabulary** (phase numbers, this file's name, "execution plan", "locked decision") in `src/`, `static/`, `scripts/`, or `doc/`.
- **Markdown structure.** Every markdown file you create or change, this plan's logs included, has one `#` title, heading levels in order with none skipped, headings that name their content, and a paragraph break wherever the topic changes.
- **Final message.** It names every document you updated, or says that you checked and none needed changes.

---

## Non-Goals

- **No check that the water leads anywhere.** A seaport next to a small enclosed body of water still has sea access. Reaching open sea is a reachability question this plan does not answer.
- **No change to seaports themselves.** Seaport counts, air strikes and missiles on seaports, combat dice, the briefing's map features, and naval movement are unchanged.
- **No change to unloading.** Ground units may still unload at any land seaport, so a ship already stuck at one can put its cargo ashore.
- **Ships already stuck stay stuck.** Nothing moves or removes them.
- **No change to the map data or the terrain pipeline.**
- **No change to tactical naval movement.**
- No change to `README.md`. Do not edit anything under `.spec/completed/`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Locked Decisions

The user made these. Do not revisit them.

1. **A ship needs sea access.** A naval unit can be queued at a hex only when that hex, or a hex next to it, is water or coast. Every other naval build requirement stays as it is (urban cells, one seaport, the deployment cap).
2. **Builds already queued finish.** A naval item already in a queue when this build is installed keeps its place and is built as before. Only new naval items are refused.
3. **Boarding needs the same sea access.** Ground units may board a ship at a land seaport only when that seaport has sea access.
4. **Naval mercenaries need the same sea access.** A naval mercenary can be raised at a hex only when a naval unit could be built there.
5. **The build popup hides naval there,** the way it hides any type whose requirements are not met. The hex tooltip says the port has no sea access.

### Decisions this plan makes

Tell the user about these in your final message.

- **What sea access means.** The hex, or one of its neighbors in `gridDisk(h3Index, 1)`, has native terrain that `isNativeNavalTransitTerrain` calls transit (water, coast, or a coastal terrain kind). A neighbor that is not on the active map counts as land. The terrain never changes during a match, so neither does sea access.
- **Keep building stops at such a port.** When a hex's queue runs out and its Keep building type is naval, the production pass already clears an ineligible Keep building (`cleared ineligible Keep building` in `controlAndProduction.ts`). After this change that includes naval at a port with no sea access. A refill is a new build, so it is refused like one.
- **An air strike does not remove a queued ship for lack of sea access.** `pruneBuildQueueForInfrastructureState` removes queue items a hex can no longer build. It keeps naval items while the hex still has a seaport, as before, so a queued ship still finishes (Locked Decision 2).
- **A queued ship's row stays readable.** In the build popup, a row whose type is no longer offered still shows that type. Its type can be changed to an offered one, and it can be removed. Changing its count is refused with the sea-access reason, because more ships there would be new builds.
- **A refusal names the reason.** Queuing or changing a naval item at such a port is refused with `Ships cannot be built here: this seaport has no water or coast next to it.`, in the build queue functions and in the commanders' `set_build_queue` tool, so a commander that tries it learns why.
- **A naval mercenary raise ordered before this build is checked again when it resolves.** The mercenary turn step already re-evaluates each raise order with `evaluateHexHire` (`src/main/gameActions/mercenaryTurnStep.ts`). A naval raise at a port with no sea access is dropped there the way any raise that no longer qualifies is dropped. Locked Decision 2 covers build queues. A raise order lasts one turn.
- **Sea access uses the true terrain, not what a side has explored.** The answer is the same for every viewer.

---

## Design

### The rule

```ts
// src/shared/seaAccess.ts
export interface SeaAccessTerrain {
  readonly terrain: string;        // native `hexes.terrain`, never seaport-promoted
  readonly terrainKind?: string;
}
export type SeaAccessTerrainLookup = (h3Index: string) => SeaAccessTerrain | undefined;
export type SeaAccessCheck = (h3Index: string) => boolean;

export function hasSeaAccess(h3Index: string, terrainOf: SeaAccessTerrainLookup): boolean
// True when h3Index or a cell of gridDisk(h3Index, 1) is transit by isNativeNavalTransitTerrain.
// A cell terrainOf does not know is not transit. A gridDisk failure returns false.

export function seaAccessCheckForHexes(
  hexes: readonly { readonly h3Index: string; readonly terrain: string; readonly terrainKind?: string }[]
): SeaAccessCheck
// Builds one Map over the list and returns (h3Index) => hasSeaAccess(h3Index, map lookup).
// For the renderer and for tests. Never for a commander's snapshot (see below).

export const NAVAL_NO_SEA_ACCESS_REASON =
  'Ships cannot be built here: this seaport has no water or coast next to it.';
export const SEAPORT_NO_SEA_ACCESS_LABEL = 'Seaports (no sea access)';
export const NAVAL_SEA_ACCESS_RULE_PART = 'water or coast in or next to the hex';
```

### Where sea access comes from

| Caller | Use |
| --- | --- |
| Any main-process code | `hexHasSeaAccess(h3Index)` in `src/main/gameDb/seaAccessReads.ts` (Phase 2). It reads the true terrain of the disk's `hexes` rows and calls `hasSeaAccess`. |
| A main-process function that takes a `GameStateSnapshot` | A parameter `seaAccessOf: SeaAccessCheck = hexHasSeaAccess`. Production code passes nothing, so it reads the database. A test with a hand-built snapshot and no database passes `seaAccessCheckForHexes(state.hexes)` or a fake. |
| The renderer | `hasSeaAccess(h3Index, (h) => S.gameState?.hexes.find((hex) => hex.h3Index === h))`, as other renderer files look up a hex. |

**Why a commander's snapshot is never read for this.** With fog of war on, `getGameStateForPlayer` (`src/main/gameDb/fogState.ts`) masks an unexplored hex's terrain to `unknown` unless it is called with `maskUnexploredTerrain: false`. Read from such a snapshot, a port whose water neighbor is unexplored would wrongly have no sea access, and naval would vanish from that commander's options while the engine still allows it. The terrain is fixed and the rule is the engine's, so main-process code always asks the database. The renderer's snapshots are built with `maskUnexploredTerrain: false` (`readMatchSnapshot` in `src/main/ipc/matchViewSnapshot.ts`, and the resolution mapping in `src/main/ipc/readyIpcResolutionMapping.ts`), so their terrain is true. Phase 0 confirms that.

**Why a leaf file.** `src/main/gameDb.ts` imports `src/main/gameDb/mercenaryEconomyRead.ts`, which imports `src/main/mercenaryHireRules.ts`. If the mercenary rules imported anything that imports the `gameDb.ts` barrel, that would be a new runtime cycle. `seaAccessReads.ts` imports only `./dbConnection` and `./dbOps`, as `src/main/gameDb/turnStateReads.ts` does, so every caller may import it.

A caller that only needs sea access for naval writes `seaportCount > 0 && <check>`, so a hex without a seaport never runs the query.

### What changes, by caller

| File | Function | `seaAccess` passed | Phase |
| --- | --- | --- | --- |
| `src/main/productionRules.ts` | `getAvailableBuildQueueItemTypes` | passes its input through | 3 |
| `src/main/gameActions/buildQueue.ts` | `buildProductionEligibilityView` | `hexHasSeaAccess` | 4 |
| `src/main/gameActions/controlAndProduction.ts` | the production pass (Keep building) | `hexHasSeaAccess` | 4 |
| `src/main/gameActions/airStrikeResolution.ts` | `pruneBuildQueueForInfrastructureState` | `true`, on purpose | 4 |
| `src/main/openRouter/seatBuildCapabilities.ts` | `seatBuildCapabilities` | an injected `seaAccessOf` | 4 |
| `src/main/mercenaryHireRules.ts` | `evaluateHexHire` | an injected `seaAccessOf`, held on `HireContext` | 4 |
| `src/main/tools/productionTools.ts` | `setBuildQueue` (the `set_build_queue` tool) | names the sea-access reason | 4 |
| `src/shared/sealiftEmbarkEligibility.ts` | `canEmbarkAtHex` | a new required field on its own attribute type | 6 |

The build popup, the multi-hex popup, the AI's `query_production` tool, the production priorities, and the production briefing all read `availableUnitTypes` from the queue view `buildProductionEligibilityView` builds. They follow Phase 4 with no edit of their own. The `set_build_queue` tool also reads that view, but it rejects an unavailable type with its own message before the queue functions run, so Phase 4 gives it the sea-access reason itself.

### Module map

| File | Holds |
| --- | --- |
| `src/shared/seaAccess.ts` | The rule, `seaAccessCheckForHexes`, the `SeaAccessCheck` type, and the three strings |
| `src/shared/seaAccess.test.ts` | Its tests |
| `src/main/gameDb/seaAccessReads.ts` | `hexHasSeaAccess` and `navalBlockedBySeaAccess`, read from the open match |
| `src/main/gameDb/seaAccessReads.test.ts` | Their test on the seeded world map |

---

## Phase 0 — Baseline and Prerequisites

**Add:** nothing. **Edit:** nothing.

1. Run `git status --short` and record the output in the Phase 0 Inventory.
2. Run the Verification Bar. Record pass or fail for each command, and the exact cycle list `check:circular` prints.
3. **Prerequisites.** Confirm each of these exists. **If any is missing, stop** and tell the user.
   - `src/shared/navalStrategicEdges.ts`: `isNativeNavalTransitTerrain`, `isLandSeaportHex`.
   - `src/main/productionRules.ts`: `getAvailableBuildUnitTypes(urbanHexCount, seaportCount, airportCount = 0)` and `getAvailableBuildQueueItemTypes(urbanHexCount, seaportCount, airportCount, intactCityCells)`.
   - `src/main/movementTerrain.ts`: `hexHasSeaport`.
   - `src/main/gameDb/dbConnection.ts`: `gameDbOps`, and `src/main/gameDb/dbOps.ts`: `DbReadOps`.
   - `src/main/gameDb/fogState.ts`: `getGameStateForPlayer` with the `maskUnexploredTerrain` option.
   - `src/main/tools/productionTools.ts`: the `set_build_queue` branch that rejects a type not in `availableUnitTypes`.
   - `src/shared/sealiftEmbarkEligibility.ts`: `SealiftHexEligibilityAttrs`, `canEmbarkAtHex`, `canManualDebarkAtHex`.
   - `src/main/gameActions/airStrikeResolution.ts`: `pruneBuildQueueForInfrastructureState`.
   - `src/main/mercenaryHireRules.ts`: `HireContext`, `buildHireContext`, `evaluateHexHire`.
4. **Callers.** Search `src` for `getAvailableBuildUnitTypes(` and `getAvailableBuildQueueItemTypes(`, and separately for `canEmbarkAtHex(` and `canManualDebarkAtHex(`. Record every file and function in the Phase 0 Inventory. When this plan was written:
   - The build functions were called in `productionRules.ts` (one calls the other), `buildQueue.ts`, `controlAndProduction.ts`, `airStrikeResolution.ts`, `mercenaryHireRules.ts`, and `openRouter/seatBuildCapabilities.ts`, plus `productionRules.test.ts` and `missileProduction.test.ts`.
   - The sealift functions were called in `gameActions/sealift.ts`, `openRouter/briefingSectionsSealift.ts`, `openRouter/promptText.ts`, `operations/liftTerrain.ts`, and `tacticalBattle/tacticalOpponentOrderValidation.ts`, plus their tests.
   A caller not on these lists gets the same treatment as its nearest match, in the phase that changes that function. Record which.
5. **Queued rows keep finishing.** Read the production pass in `controlAndProduction.ts`, from `const queueWorking = queueRows` to the end of the `while` loop. Confirm that `availableTypes` is read only for the Keep building refill, and that a queued row is built without checking `availableTypes`. If a queued row is checked against `availableTypes`, stop and tell the user: Locked Decision 2 would need a different design.
6. **Fog and the snapshots.** Confirm two facts and record them. If either is false, stop and tell the user.
   - `getGameStateForPlayer` replaces an unexplored hex's `terrain` with `unknown` unless `maskUnexploredTerrain` is `false`. This is why main-process code never reads sea access from a snapshot.
   - Every `getGameStateForPlayer` call under `src/main/ipc/` (when this plan was written: `readMatchSnapshot` in `matchViewSnapshot.ts` and two in `readyIpcResolutionMapping.ts`) passes `maskUnexploredTerrain: false`, so the renderer's hexes carry true terrain.
7. **Tests without a database.** For each of `src/main/openRouter/seatBuildCapabilities.test.ts`, `src/main/mercenaryHireRules.test.ts`, `src/main/openRouter/briefingSectionsSealift.test.ts`, and `src/main/operations/liftTerrain.test.ts`, record whether it opens `withTempGameDb`. When this plan was written none did. Those tests build snapshots by hand, so with no database `hexHasSeaAccess` returns false (`getAll` returns no rows when no handle is open). Phases 4 and 6 pass those tests a check instead.
8. **The seeded map has the case.** The tests need one land seaport with no sea access and one with sea access on the map `withTempGameDb` seeds. Write a temporary test beside `src/main/gameActions/navalSeaportBerth.test.ts` that opens `withTempGameDb`, walks `getGameState().hexes`, and prints each hex where `hexHasSeaport` is true, `isNativeNavalTransitTerrain(hex.terrain, hex.terrainKind)` is false, and no cell of `gridDisk(hex.h3Index, 1)` is transit. Run it, record the ids in the Phase 0 Inventory, and delete the file. On the user's 917-turn match there were six, among them `8153bffffffffff` on the Red Sea coast of Sudan. **If there are none, stop** and tell the user: the tests below have no case to run.
9. Record the line counts of the files this plan edits that are past 600 lines: `buildQueue.ts`, `sealift.ts`, `airStrikeResolution.ts`, `gameRuleText.ts`, `terrainTooltipStrategicState.ts`, and `buildQueuePopup.ts`.
10. Read, and do not edit: `doc/combat-rules-v3.md` (the unit table and the sealift section), `doc/how-to-play.md` (the unit table and the sealift section), `doc/ux/build-popup.md`, `doc/ux/hex-tooltips.md`, and `doc/ai-commander-prompts/example-strategic-prompt.md` (the `Rules:` line and the `Embark:` line).

**Stop if** the bar fails before any edit.

---

## Phase 1 — The Sea Access Rule

The rule as a pure function. Nothing calls it yet.

**Add:** `src/shared/seaAccess.ts`, `src/shared/seaAccess.test.ts`
**Edit:** nothing.

### Steps

1. `seaAccess.ts`: the types, the two functions, and the three constants from the Design section, each with a full orienting comment.
   - `hasSeaAccess` checks the hex itself first, then each other cell of `gridDisk(h3Index, 1)`. A cell is transit when `terrainOf` returns a value and `isNativeNavalTransitTerrain(value.terrain, value.terrainKind)` is true. Wrap `gridDisk` in `try`/`catch` and return false when it throws, as `h3GridRangePure.ts` does.
   - `seaAccessCheckForHexes` builds one `Map` from the list, once, and returns `(h3Index) => hasSeaAccess(h3Index, (h) => map.get(h))`. Its comment says it is for the renderer and for tests, and that main-process code uses `hexHasSeaAccess` because a commander's snapshot can mask terrain.
2. Import `gridDisk` from `h3-js`, as `src/shared/h3GridRangePure.ts` does. Import nothing from `src/main`.

### Tests

`seaAccess.test.ts`, with hand-built lookups around one real cell (take any res-1 cell and its `gridDisk` neighbors):

- The hex itself is water: true. The hex is coastal by `terrain`, and again by `terrainKind` only: true.
- The hex is land and one neighbor is water: true. One neighbor is coast: true.
- The hex is land, all neighbors are land: false.
- The hex is land and the only water neighbor is missing from the lookup: false.
- An invalid id (`'not-a-cell'`): false, with no throw.
- `seaAccessCheckForHexes` over a list with a land port and a water neighbor returns true for the port, and false for a port whose neighbors are all land.
- The three constants have the exact text in the Design section.

### Verification

Run the Verification Bar.

---

## Phase 2 — Reading Sea Access in a Match

The main-process way to ask the question of the open match. Nothing calls it yet.

**Add:** `src/main/gameDb/seaAccessReads.ts`, `src/main/gameDb/seaAccessReads.test.ts`
**Edit:** nothing.

### Steps

1. `seaAccessReads.ts`, in the style of `src/main/gameDb/turnStateReads.ts`. It imports only `../logger`, `./dbConnection` (`gameDbOps`), the `DbReadOps` type from `./dbOps`, `h3-js`, and `../../shared/seaAccess`. **It must not import `src/main/gameDb.ts`** (see "Why a leaf file").

   ```ts
   export function hexHasSeaAccess(
     h3Index: string,
     ops: Pick<DbReadOps, 'getAll'> = gameDbOps
   ): boolean
   // Reads the hexes rows of gridDisk(h3Index, 1) with one query and returns hasSeaAccess over them.
   // Logs logTrace with h3Index and the result.

   export function navalBlockedBySeaAccess(
     h3Index: string,
     ops: Pick<DbReadOps, 'getOne' | 'getAll'> = gameDbOps
   ): boolean
   // True when the hex has at least one seaport (res_s_infrastructure.seaport_count > 0)
   // and hexHasSeaAccess is false: the one case in which naval is refused for sea access alone.
   // Logs logTrace with h3Index and the result.
   ```

   - Read the rows with one query: `SELECT h3_index AS h3Index, terrain, terrain_kind AS terrainKind FROM hexes WHERE h3_index IN (?, …)`, with one placeholder per disk cell. Map a null `terrainKind` to `undefined`. Pass the rows to `hasSeaAccess` through a `Map` lookup.
   - When `gridDisk` throws, return false.
   - With no open database, `getAll` returns no rows, so the answer is false. Say so in the comment, and say that a test without a database must pass its own check to the functions that accept one.
   - Both comments say the answer never changes during a match, and that it reads the true terrain, never a viewer's masked terrain and never seaport-promoted terrain.

### Tests

`seaAccessReads.test.ts`, inside `withTempGameDb`, in the style of `src/main/gameActions/navalSeaportBerth.test.ts`:

- A land seaport with no sea access from the Phase 0 Inventory: `hexHasSeaport` (from `src/main/movementTerrain.ts`) is true, `hexHasSeaAccess` is false, and `navalBlockedBySeaAccess` is true. Assert the preconditions first, with a message naming the id, so a change in the seeded map fails clearly.
- A land seaport with sea access (find one the way `findLandSeaportWithAdjacentWater` does): `hexHasSeaAccess` true, `navalBlockedBySeaAccess` false.
- A water hex: `hexHasSeaAccess` true. A land hex with no seaport: `navalBlockedBySeaAccess` false.
- **Agreement:** for every hex with a seaport, `hexHasSeaAccess(h)` equals `seaAccessCheckForHexes(getGameState().hexes)(h)`. `getGameState()` is the engine's unmasked snapshot, so this ties the database path to the snapshot path.

### Verification

Run the Verification Bar. `check:circular` must show no new cycle: the new file is a leaf.

---

## Phase 3 — Build Rules Take Sea Access

A signature change with no change in behavior. Every caller passes `seaAccess: true` in this phase, so the game builds exactly what it built before.

**Add:** nothing.
**Edit:** `src/main/productionRules.ts`, `src/main/productionRules.test.ts`, `src/main/missileProduction.test.ts`, `src/main/gameActions/buildQueue.ts`, `src/main/gameActions/controlAndProduction.ts`, `src/main/gameActions/airStrikeResolution.ts`, `src/main/mercenaryHireRules.ts`, `src/main/openRouter/seatBuildCapabilities.ts`, and every other caller Phase 0 recorded

### Steps

1. `productionRules.ts`: replace the positional parameters with one input object.

   ```ts
   export interface BuildAvailabilityInput {
     readonly urbanHexCount: number;
     readonly seaportCount: number;
     readonly airportCount: number;
     readonly seaAccess: boolean;   // the hex or a neighbor is water or coast; see hasSeaAccess
   }
   export function getAvailableBuildUnitTypes(input: BuildAvailabilityInput): BuildUnitType[]
   export function getAvailableBuildQueueItemTypes(
     input: BuildAvailabilityInput & { readonly intactCityCells: number }
   ): BuildQueueItemType[]
   ```

   - In `getAvailableBuildUnitTypes`, after the urban and seaport test, add `if (unitType === 'naval' && !input.seaAccess) return false;`. Every field is required: no default for `airportCount` any more. A caller that relied on the default passes `airportCount: 0` explicitly.
   - Give `BuildAvailabilityInput` and each of its members a full orienting comment. The `seaAccess` comment names `hasSeaAccess` and `hexHasSeaAccess`, and says naval is the only type that reads it.
   - Keep the `logTrace` lines, logging the input object.
   - Update the comment on both functions: naval also needs sea access.
2. Update every caller from the Phase 0 list to the object form, with `seaAccess: true`. Change nothing else on those lines. TypeScript lists any caller you miss.
3. `productionRules.test.ts` and `missileProduction.test.ts`: rewrite each call in the object form with `seaAccess: true`. The expected results do not change.

### Tests

`productionRules.test.ts`, new cases: with enough urban cells and one seaport, naval is offered with `seaAccess: true` and not with `seaAccess: false`; `seaAccess: false` changes nothing for infantry, armor, air, missile, fortification, or credits.

### Verification

Run the Verification Bar. Then search `src` for `seaAccess: true`. Record the count in the Completion Log: it is every caller from Phase 0. Phase 4 replaces all but one.

### If verification fails

- An existing test's expected result changed: a caller was given a value other than `true`, or a field moved. Fix that caller. This phase must not change behavior.

---

## Phase 4 — Ships Need Sea Access

The rule is switched on for building, Keep building, the commanders' build options and `set_build_queue` tool, and naval mercenaries.

**Add:** nothing.
**Edit:** `src/main/gameActions/buildQueue.ts`, `src/main/gameActions/controlAndProduction.ts`, `src/main/gameActions/airStrikeResolution.ts`, `src/main/mercenaryHireRules.ts`, `src/main/openRouter/seatBuildCapabilities.ts`, `src/main/openRouter/promptSpec/coachingGates.ts` (one comment), `src/main/tools/productionTools.ts`, `src/main/gameActionsProduction.test.ts`, `src/main/tools/productionTools.test.ts`, `src/main/mercenaryHireRules.test.ts`, `src/main/openRouter/seatBuildCapabilities.test.ts`, `doc/combat-rules-v3.md`, `doc/how-to-play.md`, `doc/ux/build-popup.md`, `doc/region-summary-1.md`

### Steps

1. `buildQueue.ts`, `buildProductionEligibilityView`: pass `seaAccess: productionContext.seaportCount > 0 && hexHasSeaAccess(h3Index)`, with `hexHasSeaAccess` from `../gameDb/seaAccessReads`. Replace the function's filler comment with one that says what the view is and that naval needs sea access.
2. `buildQueue.ts`, `unavailableQueueItemReason`: give it the hex, `unavailableQueueItemReason(unitType, h3Index)`. When `unitType` is `'naval'` and `navalBlockedBySeaAccess(h3Index)` is true, return `NAVAL_NO_SEA_ACCESS_REASON`. Otherwise return what it returns today. Update both callers (`executeUpdateHexBuildQueueEntry` and `executeApplyBuildQueueTemplateToHexes`) and the function's comment.
3. `controlAndProduction.ts`, the production pass in `processProductionAfterControlResolution`: pass `seaAccess: seaportCount > 0 && hexHasSeaAccess(control.h3Index)` to `getAvailableBuildQueueItemTypes`. The existing Keep building check then clears a naval Keep building at such a port. Change nothing else in the pass.
4. `airStrikeResolution.ts`, `pruneBuildQueueForInfrastructureState`: keep `seaAccess: true`, and put this comment directly above the line: `// A naval row already queued finishes even when the port has no water or coast next to it. Only losing the seaport removes naval here.`
5. `seatBuildCapabilities.ts`: add a third parameter `seaAccessOf: SeaAccessCheck = hexHasSeaAccess`, and pass `seaAccess: (infra?.seaportCount ?? 0) > 0 && seaAccessOf(row.h3Index)`. Update the function's comment and the `canBuildNaval` member's: false for a seat with no seaport city that has sea access. Do not read `state.hexes` for this (see "Why a commander's snapshot is never read for this"). Its caller in `consultPromptParts.ts` passes nothing.
6. `coachingGates.ts`: the comment that says the gate is false `when the seat has no seaport city or is at the naval cap` becomes `when the seat has no seaport city with sea access or is at the naval cap`. Comment only.
7. `mercenaryHireRules.ts`:
   - `HireContext` gains `readonly seaAccessOf: SeaAccessCheck`, with a full orienting comment.
   - `buildHireContext(state, seatId, seaAccessOf: SeaAccessCheck = hexHasSeaAccess)` stores it. Its callers pass nothing.
   - `evaluateHexHire` passes `seaAccess: (infra?.seaportCount ?? 0) > 0 && context.seaAccessOf(h3Index)`.
   - `mercenaryHireRules.ts` imports `hexHasSeaAccess` from `./gameDb/seaAccessReads`, never from `./gameDb` or `./movementTerrain`. The barrel already imports this file through `mercenaryEconomyRead.ts`.
8. `productionTools.ts`, `setBuildQueue`: in the branch that rejects a type not in `queueableTypes`, when `args.unitType` is `'naval'` and `navalBlockedBySeaAccess(resolved.h3Index)` is true, reject with `NAVAL_NO_SEA_ACCESS_REASON` instead of the generic message. Every other rejection is unchanged.
9. **Tests without a database.** Run `seatBuildCapabilities.test.ts` and `mercenaryHireRules.test.ts` now, before editing them. A case that now fails is one whose hand-built snapshot puts a naval-capable seaport on land: with no database the default check answers false. Give each such case a check: `seaAccessCheckForHexes(state.hexes)` when the snapshot includes the port's water neighbor, otherwise `() => true` with the comment `// This snapshot omits the port's neighbors; the case is not about sea access.` Any other test file that now fails for the same reason (a hand-built snapshot, no database, a naval build or raise at a land seaport) gets the same treatment. Record each changed case in the Completion Log. No other expected result may change.
10. Search `src` for `seaAccess: true` outside tests. The only match must be in `pruneBuildQueueForInfrastructureState`. Record the result in the Completion Log.
11. Docs:
    - `doc/combat-rules-v3.md`: in the unit table, the naval build requirement becomes `min 10 urban hexes and 1 seaport, with water or coast in or next to the hex`. Add one sentence after the production examples: a seaport hex with only land around it cannot build naval units or raise naval mercenaries, an item already queued there is still built, and Keep building does not refill naval there (`hasSeaAccess` in `src/shared/seaAccess.ts`).
    - `doc/how-to-play.md`: in the unit table's naval row, `10+ city cells and a seaport` becomes `10+ city cells and a seaport on the water`. Add a bullet near the build-popup text: a port with only land around it cannot build ships or raise naval mercenaries.
    - `doc/ux/build-popup.md`: naval is offered only at a hex with sea access. Name `hasSeaAccess`.
    - `doc/region-summary-1.md`, under "Rules these tables assume": `Naval still needs a seaport and air an airport, as now.` becomes `Naval still needs a seaport with water or coast in or next to its hex, and air an airport.`

### Tests

- `gameActionsProduction.test.ts`, on the seeded map, using the two seaports from Phase 0. For each, give the human control of the hex and enough urban cells for naval with `dbRun` on `res_s_control` and `res_s_infrastructure` (read the file's existing tests for how they set up a producing hex):
  - With sea access, `readHexBuildQueue(h).availableUnitTypes` includes `'naval'`. Without it, it does not, and still includes `'infantry'`.
  - Without sea access, add an entry with `executeAddHexBuildQueueEntry(h)`, then `executeUpdateHexBuildQueueEntry` on that entry with `'naval'` fails with `NAVAL_NO_SEA_ACCESS_REASON`.
  - **Queued rows finish:** insert a naval row directly into `res_s_build_queue` on the port without sea access, give the hex enough stored points with `setBuildProgressPointsForHex`, run `processProductionAfterControlResolution()` as the file's spawn tests do, and expect one new naval unit there.
  - **Air strikes keep the row:** with a naval row queued there, `pruneBuildQueueForInfrastructureState(h)` leaves it in place.
  - **Keep building stops:** with an empty queue and `setKeepBuildingForHex(h, true, 'naval')`, `processProductionAfterControlResolution()` clears Keep building.
- `productionTools.test.ts`, with the file's temp database: `set_build_queue` with `unitType: 'naval'` at the port without sea access is rejected with `NAVAL_NO_SEA_ACCESS_REASON`.
- `seatBuildCapabilities.test.ts`: with `seaAccessOf: () => false`, a seat whose only naval-capable hex is a land seaport gives `canBuildNaval: false`. With `() => true`, `true`.
- `mercenaryHireRules.test.ts`: with a context built with `() => false`, `evaluateHexHire(...).raiseOptions` at a naval-capable land seaport has no naval option. With `() => true`, it has one, as before.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Run the app on a new global match. Open the build popup on a coastal seaport city your side holds: naval is offered as before. If your side holds a port from the Phase 0 Inventory, open its popup: naval is not offered. Otherwise record in the Completion Log that the refusal was checked by its tests.

### If verification fails

- `check:circular` reports a new cycle: a caller imported `hexHasSeaAccess` from somewhere other than `src/main/gameDb/seaAccessReads.ts`, or `seaAccessReads.ts` imports more than its leaf imports. Fix the import. Do not change the baseline.

---

## Phase 5 — A Queued Ship's Row Stays Readable

A row whose type is no longer offered (a ship queued before this build, at a port without sea access) still reads correctly in the build popup.

**Add:** nothing.
**Edit:** `src/renderer/gameplay/buildQueuePopup.ts`, `src/main/buildQueuePopupSourceContracts.test.ts`, `doc/ux/build-popup.md`

### Steps

1. `buildQueuePopup.ts`, the loop `for (const entry of snapshot.entries)` that fills each row's `typeSelect` from `const options = snapshot.availableUnitTypes;`: today a row whose `entry.unitType` is not in `options` shows a blank select, because its value matches no option. Add a module-level private function with a full orienting comment:

   ```ts
   function rowTypeOptions(
     available: readonly BuildQueueItemType[],
     current: BuildQueueItemType
   ): BuildQueueItemType[]
   // available when it includes current; otherwise [current, ...available].
   ```

   The row's option loop becomes `for (const unitType of rowTypeOptions(options, entry.unitType))`. The option text stays `formatBuildQueueItemLabel(unitType)`. Nothing else in the loop changes.
2. Nothing else in the popup changes. Changing the type to an offered one works as today. Changing the count of such a row is refused by the main process (Phase 4, step 2), and the popup shows the refusal the way it shows any failed edit today. Confirm that by reading `runBuildQueueMutation`, and record what the user sees in the Completion Log.
3. `doc/ux/build-popup.md`: a queued row whose type the hex can no longer build keeps that type in its list. It can be removed, or changed to a type the hex can build, and its count cannot be changed.

### Tests

`buildQueuePopupSourceContracts.test.ts`, in the file's existing style: the popup source contains `rowTypeOptions(options, entry.unitType)`, and `getFunctionSource(source, 'rowTypeOptions')` includes `available.includes(current)`. Renderer code has no runtime test in `npm test`, so keep `rowTypeOptions` small enough to check by reading.

### Verification

Run the Verification Bar and `npm run ui:smoke`. A save that has a naval item queued at a port without sea access is rare. If the user has one, use it: the row shows Naval. Otherwise record in the Completion Log that the case was checked by its test only.

---

## Phase 6 — Boarding Needs Sea Access

**Add:** nothing.
**Edit:** `src/shared/sealiftEmbarkEligibility.ts`, `src/shared/sealiftEmbarkEligibility.test.ts`, `src/main/gameActions/sealift.ts`, `src/main/gameActions/sealift.test.ts`, `src/main/openRouter/briefingSectionsSealift.ts`, `src/main/openRouter/briefingSectionsSealift.test.ts`, `src/main/operations/liftTerrain.ts`, `src/main/operations/liftTerrain.test.ts`, `src/main/tacticalBattle/tacticalOpponentOrderValidation.ts`, and every other `canEmbarkAtHex` caller Phase 0 recorded, `doc/combat-rules-v3.md`, `doc/how-to-play.md`

### Steps

1. `sealiftEmbarkEligibility.ts`:
   - Add `export interface SealiftEmbarkAttrs extends SealiftHexEligibilityAttrs { readonly seaAccess: boolean; }`, with a full orienting comment on the interface and the member: the hex or a neighbor is water or coast (`hasSeaAccess`), and only boarding at a land seaport reads it. `SealiftHexEligibilityAttrs` itself does not change.
   - `canEmbarkAtHex(attrs: SealiftEmbarkAttrs)`: the land-seaport branch returns `attrs.seaAccess` instead of `true`. The other branches do not change. A coastal hex and a water seaport have sea access by definition.
   - `canManualDebarkAtHex(attrs: SealiftHexEligibilityAttrs)` keeps its type, so its callers (`promptText.ts`, the debark half of `liftTerrain.ts` and `sealift.ts`) do not change. Its own land-seaport branch returns true before the last line, so unloading at any land seaport still works (Non-Goals). Its last line becomes `return canEmbarkAtHex({ ...attrs, seaAccess: true });` with this comment directly above it: `// Land seaports returned above, so seaAccess is never read on this path.`
   - Update the file's top comment and both functions' comments.
2. Every `canEmbarkAtHex` caller passes the field. TypeScript lists each one:
   - `sealift.ts` (the embark helper only) and `tacticalOpponentOrderValidation.ts`: `seaAccess: hexHasSeaAccess(h3Index)` from `src/main/gameDb/seaAccessReads.ts`, with the hex each already uses. Add only that line and the import to `sealift.ts`.
   - `briefingSectionsSealift.ts`, `buildSealiftBriefingBlock`: add a last parameter `seaAccessOf: SeaAccessCheck = hexHasSeaAccess` and pass it down to `findNearestOpponentEmbarkHex`, which passes `seaAccess: seaAccessOf(h3Index)`. Callers pass nothing. Do not read sea access from `state.hexes`: this is a commander's snapshot (see "Why a commander's snapshot is never read for this").
   - `liftTerrain.ts`, `buildLiftTerrain`: add an optional `readonly seaAccessOf?: SeaAccessCheck` to its argument object, defaulting to `hexHasSeaAccess`. The embark check passes `{ ...attrs, seaAccess: seaAccessOf(h3Index) }`. The shared `eligibility` helper and the debark check do not change.
3. **Tests without a database.** Run `briefingSectionsSealift.test.ts` and `liftTerrain.test.ts` before editing them. A case that now fails boards at a hand-built land seaport, and with no database the default check answers false. Pass `() => true` to that case with the comment `// This snapshot omits the port's neighbors; the case is not about sea access.` Any other test file that now fails for the same reason (for example a prompt test whose sealift briefing names a land seaport) gets the same treatment. Record each changed case in the Completion Log. No other expected result may change.
4. Docs:
   - `doc/combat-rules-v3.md`, the sealift section: boarding at a land seaport needs water or coast in or next to its hex. Unloading is unchanged.
   - `doc/how-to-play.md`, the sealift section: `a coastal hex or a land seaport, or a water seaport you control` becomes `a coastal hex, a land seaport with water or coast next to it, or a water seaport you control`.
   - `doc/ai-commander-prompts/information-decision-model.md` (the `EMBARK_LEGALITY` row) and `doc/ai-commander-prompts/source-inventory.md` (the `Embark:` row) wait for Phase 7, which changes the prompt text they describe.

### Tests

- `sealiftEmbarkEligibility.test.ts`: add `seaAccess: true` to the existing `canEmbarkAtHex` cases, which keep their results. New: a land seaport with `seaAccess: false` gives `canEmbarkAtHex` false, and `canManualDebarkAtHex` on the same hex (without the field) gives true.
- `sealift.test.ts`, on the seeded map with the Phase 0 ports: a ground unit cannot board at the port without sea access, and can board at the port with sea access, as before. Read the file's existing embark tests for the setup.
- `briefingSectionsSealift.test.ts`: with `seaAccessOf: () => false`, an uncontrolled land seaport is not offered as the nearest embark hex. With `() => true`, it is, as the existing test expects.

### Verification

Run the Verification Bar. In the app, at a land seaport with sea access, load a ground unit onto a ship: it works as before.

---

## Phase 7 — What Players and Commanders Are Told

The hex tooltip and the commanders' rule text.

**Add:** nothing.
**Edit:** `src/renderer/map/terrainTooltipStrategicState.ts`, `src/main/rendererProductionAirConsolidation.test.ts`, `src/main/openRouter/promptSpec/gameRuleText.ts`, `src/main/openRouter/promptSpec/gameRuleText.test.ts`, `src/main/openRouter/promptSpec/briefingGuideText.ts`, `src/main/openRouter/briefingSectionsSealift.test.ts`, `src/main/openRouter/promptSpec/coachingTextStrategic.ts`, `doc/ux/hex-tooltips.md`, `doc/ai-commander-prompts/example-strategic-prompt.md`, `doc/ai-commander-prompts/information-decision-model.md`, `doc/ai-commander-prompts/source-inventory.md`

### Steps

1. **Tooltip.** `terrainTooltipStrategicState.ts`, `featureLabelsForStrategicHex(h3)`: the line `if (counts.seaportCount > 0) labels.push('Seaports');` pushes `SEAPORT_NO_SEA_ACCESS_LABEL` instead of `'Seaports'` when `hasSeaAccess(h3, (h) => S.gameState?.hexes.find((hex) => hex.h3Index === h))` is false. Import both from `src/shared/seaAccess.ts` with the relative path the file's other shared imports use. Update the function's comment. The lookup runs only for a hovered hex with a seaport. The renderer's snapshot carries true terrain (Phase 0, step 6), so a port next to unexplored water is labeled correctly.
2. **Build rule line.** `gameRuleText.ts`, `buildProductionCostRulesLine`: after `min seaports ${req.minSeaports}`, push `NAVAL_SEA_ACCESS_RULE_PART`. The naval part then reads `naval cost 100 (min urban 10 + min seaports 1 + water or coast in or next to the hex)`, with the numbers from the engine. Update the function's comment.
3. **Embark rule.** `briefingGuideText.ts`, `NAVAL_EMBARK_RULE` becomes exactly:
   `Embark: coastal, a land seaport with water or coast next to it (control not required), or a water seaport you control. Capacity: 1 armor or 2 infantry per naval unit.`
   Update its comment.
4. **Coaching line.** `coachingTextStrategic.ts`: in the line that begins `- When land force must cross water`, `a land seaport` becomes `a land seaport with water or coast next to it`. Change nothing else in that line.
5. These three texts are static, so the cached system prompt changes once and stays cached.
6. Docs:
   - `doc/ux/hex-tooltips.md`, the Features line: a seaport with no water or coast in or next to its hex reads `Seaports (no sea access)` (`SEAPORT_NO_SEA_ACCESS_LABEL`).
   - `doc/ai-commander-prompts/example-strategic-prompt.md`: update the `Rules:` line's naval part, the `Embark:` line, and the `- When land force must cross water` line to the new text.
   - `doc/ai-commander-prompts/information-decision-model.md`, the `EMBARK_LEGALITY` row: `Coastal cells and land seaports allow embark outright` becomes `Coastal cells, and land seaports with water or coast next to them, allow embark outright`.
   - `doc/ai-commander-prompts/source-inventory.md`, the row that begins `Embark: coastal or land seaport`: quote the new sentence's opening, `Embark: coastal, a land seaport with water or coast next to it, or a controlled water seaport`.

### Tests

- `gameRuleText.test.ts`, `buildProductionCostRulesLine`: the text includes `NAVAL_SEA_ACCESS_RULE_PART`.
- `briefingSectionsSealift.test.ts`: update the `NAVAL_EMBARK_RULE` assertion to the new sentence.
- `rendererProductionAirConsolidation.test.ts`, beside the existing assertion that reads `getFunctionSource(terrainTooltipStateSource, 'featureLabelsForStrategicHex')`: that function's source includes `hasSeaAccess(` and `SEAPORT_NO_SEA_ACCESS_LABEL`.
- `openRouterMatrix.test.ts` checks that the system prompt includes `Embark: coastal`. The new sentence still starts that way. Do not change that test.

### Verification

Run the Verification Bar and `npm run ui:smoke`. In the app, hover a seaport from the Phase 0 Inventory: the Features line reads `Seaports (no sea access)`. Hover a coastal seaport: it reads `Seaports`.

---

## Phase 8 — Docs, Final Verification, and Hand-Off

**Add:** nothing.
**Edit:** any document the search in step 1 finds

### Steps

1. Search `doc/` for `seaport`, `embark`, and `naval` sentences that state where a ship can be built or boarded. Leave the historical documents `AGENTS.md` lists alone. Fix any sentence these phases made wrong.
2. Run `node scripts/check-doc-links.cjs` and fix what it reports in the documents you changed.
3. Search the whole diff for plan vocabulary and remove it: `git diff | Select-String -Pattern 'Phase \d|sea-access-execution|execution plan|locked decision' -CaseSensitive:$false`. Nothing under `src/`, `static/`, `scripts/`, or `doc/` may match.
4. Run the Verification Bar and `npm run ui:smoke` one last time.
5. Fill in the Completion Log.
6. In your final message, name every document you updated, every decision under "Decisions this plan makes", and the seaports from the Phase 0 Inventory.

### Manual checklist for the user

1. Start a new global match. Hover the Red Sea coast of Sudan (`8153bffffffffff`) or another port from the Phase 0 Inventory. Expect `Seaports (no sea access)`.
2. Open the build popup on a port like that which your side holds, with ten or more city cells. Expect no Naval choice. A coastal seaport city still offers Naval.
3. Load a save with a naval item already queued at such a port, if you have one. Expect the row to show Naval, the ship to be built when its points are in, and a count change to be refused with `Ships cannot be built here: this seaport has no water or coast next to it.`
4. Try to load a ground unit onto a ship at such a port. Expect it to be refused. Unloading there still works.
5. Play an AI-only match for a few turns and read `debug.log`. Expect no naval queued at such a port, and no `assign_order` rejections for it beyond a first try.

---

## Reliability Checklist

- [ ] The phase's files were backed up before the first edit.
- [ ] The rule lives in one pure function, `hasSeaAccess`, with a test, and every caller reaches it through `hasSeaAccess` or `hexHasSeaAccess`.
- [ ] Phase 3 changed no behavior: every existing test kept its expected result.
- [ ] After Phase 4, `seaAccess: true` appears outside tests only in `pruneBuildQueueForInfrastructureState`, with its comment. The only other literal is `seaAccess: true` inside `canManualDebarkAtHex`, with its comment.
- [ ] No main-process code reads sea access from a snapshot's `hexes`. Each snapshot function takes `seaAccessOf` with the default `hexHasSeaAccess`, and only tests pass another.
- [ ] `src/main/gameDb/seaAccessReads.ts` imports no barrel, and `check:circular` shows no new cycle.
- [ ] A test changed to pass `() => true` carries the comment saying why, and is listed in the Completion Log.
- [ ] A naval item queued before this build still finishes.
- [ ] Unloading at a land seaport is unchanged.
- [ ] Every new function, type, interface, field, and constant has a full orienting comment, and every changed declaration whose comment was filler now has a specific one.
- [ ] `src/shared` imports nothing from `src/main`.
- [ ] `npm run check:renderer-types` shows no new error, `check:circular` shows only the baseline cycles, and no baseline file was edited.
- [ ] No file passed 1000 lines.
- [ ] No commit, push, stash, merge, rebase, pull request, checkout, restore, reset, or clean was run.
- [ ] Every markdown file created or changed has one title, heading levels in order, and paragraph breaks where the topic changes.
- [ ] No plan vocabulary appears in `src/`, `static/`, `scripts/`, or `doc/`.

## Success Definition

- A naval unit cannot be queued, refilled by Keep building, or raised as a mercenary at a seaport with only land around it.
- Ground units cannot board a ship there. They can still unload there.
- A naval item queued before this build still finishes.
- The build popup does not offer naval there, and the hex tooltip says `Seaports (no sea access)`.
- Commanders are told the rule, and a commander that queues naval there is told why it was refused.
- The Verification Bar and `ui:smoke` pass.

---

## Phase 0 Inventory

| Item | Value |
|------|-------|
| `git status --short` | |
| `npm test` | |
| `npm run build:renderer` | |
| `check:circular` cycle list | |
| Prerequisites | |
| Build-function callers | |
| Sealift-function callers | |
| Queued rows skip `availableTypes` | |
| Land seaports with no sea access (seeded map) | |
| Land seaport with sea access (seeded map) | |
| Line counts | |
| Fog masking and renderer terrain facts | |
| Tests without a database | |

## Defect Inventory

| Phase | Command | First error | Action taken |
|-------|---------|-------------|--------------|

## Completion Log

| Phase | Result | Sketch differences | Files changed outside the Add/Edit lists | Docs updated | What you saw in the running app |
|-------|--------|--------------------|-------------------------------------------|--------------|---------------------------------|
