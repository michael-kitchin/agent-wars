# Execution Plan: Naming Conventions Capability

*Version 1.0 — August 2026*

> **For the executing agent:** Work one numbered section at a time. Complete that section's verification before starting the next. Do not invent new conventions; the locked decisions and the contract text in this document are authoritative. Never `git commit` or `git push`. After every apply gate, stop so a human can review and commit.

**Goal:** Make every in-scope file, directory, and high-visibility TypeScript symbol named correctly, consistently, and concisely, then keep it that way with lint and a mechanical checker.

**Architecture:** A written contract, a read-only checker, a signed rename ledger, and a TypeScript language-service rename engine. Product source is untouched until the ledger is signed. Applies happen one ledger entry (or one declared batch) at a time, each followed by a full verification gate that starts by deleting `dist/`.

**Tech stack:** TypeScript 5.7 (`typescript` language service), ESLint 9 flat config, existing `scripts/` CLI conventions, `git mv` for history-preserving path changes.

---

## Global constraints

Copy these into every later artifact that is not this plan. Do not re-decide them.

- Full one-pass normalization of current names, then ongoing enforcement.
- File and directory renames are in scope.
- Hybrid quality: mechanical rules in a tool; judgement calls against the rubric during the ledger audit.
- Directories under `src/` use **camelCase**. Known renames: `game-actions` → `gameActions`, `game-db` → `gameDb`, `openrouter` → `openRouter`.
- Closed role-suffix allowlist (see contract). `Utils` collapses to `Helpers`. `Impl` is eliminated without colliding with public wrappers.
- Reach: `src/**/*.ts` plus TypeScript under `scripts/` (today `scripts/orienting-comments/` and the new `scripts/naming/`). Python stays PEP 8 snake_case. `scripts/*.cjs` stays kebab-case.
- Boundary-mirroring snake_case properties are never renamed and are carved out of lint.
- Symbol renames use `ts.LanguageService.findRenameLocations` with `findInStrings: false` and `findInComments: false`.
- `src/main/tools/` milestone numbering is removed in its own apply batch. LLM-facing tool **string values** stay frozen.
- Workspace rule 11: the agent never commits or pushes. Each apply gate ends in a human commit.
- Workspace rule 12: identifiers used to name sections of this plan must **not** appear in tool code, comments, npm script names, ESLint rule messages, or Cursor rules. Name scripts after what they do (`naming:report`), not after a section number.

---

## Scope

**In scope (high-visibility):**

- Directory names under `src/` (and new TypeScript tooling directories under `scripts/`).
- TypeScript file names (`*.ts`, not `*.d.ts` except as listed in Frozen names).
- Exported functions, exported types, exported interfaces, exported consts, and exported classes.

**Out of scope:**

- Function-local variables, parameters, and non-exported module internals.
- Python under `scripts/terrain_pipeline/` and `scripts/naming_pipeline/`.
- CommonJS `scripts/*.cjs` file names (kebab-case is the convention).
- String literal **values** (see Frozen names).
- `.spec/completed/**` (archival). `.spec/deprecated/**` (archival).
- `static/renderer.js` (esbuild output; regenerate via `npm run build:renderer`).
- `node_modules/`, `dist/`, `release/`, `.venv/`.
- `index.ts` barrels keep that filename.
- `src/main/main.ts`, `src/main/preload.ts`, `src/renderer/renderer.ts` keep those filenames.

---

## Frozen names (never rewrite these values)

**Governing rule: identifiers may be renamed; string literal values are frozen.**

Example that must survive byte-identical: in `src/main/tools/tool2Assessment.ts`, the const identifier `TOOL2_NAMES` may become `ASSESSMENT_TOOL_NAMES`, but the value `['assess_unit', 'assess_hex']` must not change.

| Kind | Examples | Why frozen |
| --- | --- | --- |
| IPC channel strings | `'game:submitOrders'`, `'openRouter:listModels'` in `src/shared/ipc/channels.ts` | Cross-process contract; that file already requires a hard cutover for any change |
| LLM tool names | `'plan_route'`, `'check_distance'`, `'assess_unit'`, `'assess_hex'`, `'estimate_combat'`, `'memory_read'`, `'query_orders'`, `'query_production'`, `'set_build_queue'` | Prompt and model contract; tests assert on these strings |
| Standing-order type strings | `'defend'`, `'march'`, `'pursue'`, `'patrol'`, `'hold_fire'` | Persisted and parsed |
| Envelope action strings | `'assign_order'`, `'cancel_order'` | Parsed JSON from the model |
| Prompt section heading text | Strings asserted in `src/main/openrouter/promptSpec/` tests | Model-facing copy |
| SQLite tables and columns | `turn_number` and siblings | On-disk schema |
| DB row type properties that mirror SQL | `TurnStateRow = { turn_number }` in `src/main/game-db/turnStateReads.ts` | Boundary mirror |
| OpenRouter HTTP fields | `max_tokens`, `tool_calls` | Vendor API |
| Persisted JSON keys | Saved games; `data/generated/` terrain JSON | On-disk compatibility |
| Electron entry filenames | `src/main/main.ts`, `src/main/preload.ts` | `"main": "dist/main/main.js"` in `package.json` |
| Renderer bundle entry | `src/renderer/renderer.ts` | `build:renderer` esbuild `--outfile` |
| Module augmentation filename | `src/main/better-sqlite3.d.ts` | Must match the `better-sqlite3` module |

The rename engine must call `findRenameLocations` with **`findInStrings` false**. A textual or whole-word replace is forbidden for symbols.

---

## Rename hazards (invisible to `tsc`)

Update or regenerate these on every path-changing batch. Leaving them stale is a silent pass or a false fail.

### Stale `dist/` (highest severity)

`scripts/run-main-node-tests.cjs` recursively discovers `dist/main/**/*.test.js` and `dist/shared/**/*.test.js`. `tsc` never deletes stale emit. After a rename:

- Old compiled tests remain and still pass against the old layout.
- Tests can run twice (old path and new path).
- On Windows, `dist/main/openrouter` and `dist/main/openRouter` are the **same** directory, so a case-only rename produces a mixed overwrite.

**Required:** every verification gate starts with `npm run clean:dist` (new script; see section 4). There is today only `clean:release`.

### Hard-coded path lists

| Artifact | What it contains | Refresh |
| --- | --- | --- |
| `scripts/verify-modularization-tests.manifest` | `dist/` test paths including `dist/main/openrouter/...`, `dist/main/game-actions/...`, `dist/main/briefing/map/hex-coordinates.test.js` | Edit paths to match new files. Missing entries throw (loud canary). |
| `scripts/circular-deps-baseline.json` | ~46 source paths | `node scripts/dump-circular-deps.cjs scripts/circular-deps-baseline.json` |
| `scripts/renderer-typecheck-baseline.json` | ~47 source paths | `npm run dump:renderer-types-baseline` |

### Source-text contract tests

`readRendererSource` in `src/main/testSupport/rendererSourceAssertions.ts` does `path.resolve(process.cwd(), 'src', 'renderer', ...segments)`. Call sites (and local copies of the helper) also regex-match **function names**. Path and symbol renames both break them.

Known call files:

- `src/main/readyHandlerSourceContracts.test.ts` — `gameplay/readyHandler.ts`
- `src/main/rendererPureHelperContracts.test.ts` — `map/terrainTooltipRes1State.ts`, `map/terrainView.ts`, `gameplay/buildQueuePopupFormatting.ts`
- `src/main/tacticalExitSidebarRefreshContract.test.ts` — local helper; `tactical/tacticalExitFlow.ts`, `renderer.ts`, `tactical/tacticalStrategicOrderUiStash.ts`, `tactical/tacticalEntryFlow.ts`
- `src/main/tacticalEntrySelectionChromeContract.test.ts` — `tactical/tacticalIpcHandlers.ts`
- `src/main/tacticalPrefetchRestartContract.test.ts` — `openRouter/openRouterRuntime.ts`, `openRouter/aiPlanningState.ts`, `openRouter/precomputedAiState.ts`

### Windows case-only directory rename

NTFS is case-insensitive. `openrouter` → `openRouter` **must** be two `git mv` steps through a hold name:

```text
git mv src/main/openrouter src/main/openrouter.renamehold
git mv src/main/openrouter.renamehold src/main/openRouter
```

`forceConsistentCasingInFileNames` is already true in `tsconfig.base.json`. Stale-case imports fail the build; do not disable the flag.

### Orienting comments embed identifier names

Example: the block above `TOOL2_NAMES` says it documents `TOOL2_NAMES`. The engine does **not** rewrite comments. Each symbol apply prints a comment-occurrence list. Resolve those comments before closing the batch.

### Generated and archival

- `static/renderer.js` — regenerate only (`npm run build:renderer`). Never hand-edit.
- `docs/**` — living; update paths and symbol names when they change.
- `.spec/completed/**` and `.spec/deprecated/**` — do not rewrite.

### Working tree

Start apply work from a clean git tree with no unrelated changes. A repo-wide rename makes in-flight branches painful to merge.

---

## Shared verification gate

Run this sequence after **every** mutating apply (one directory, one file batch, or one symbol batch). All steps must pass.

```text
npm run clean:dist
npm run build:main
npm run build:renderer
npm run lint
npm run check:renderer-types
npm run check:circular
node scripts/run-main-node-tests.cjs
npm run naming:report
```

Then:

1. Confirm `naming:report` no longer lists the entries just applied (they are `applied` in the ledger).
2. Run `git status` and confirm only expected files changed (imports, ledger, baselines, tests, docs).
3. **Stop.** A human reviews and commits. Do not start the next apply until that commit exists.

`npm run rebuild:native:node` runs **once per working session**, not per gate. Native `better-sqlite3` is unaffected by renames.

Until enforcement is wired, `naming:report` always exits 0. `naming:check` (exit 1 on remaining violations) is added in the last section and then added to `npm test`.

Rollback: `git restore` / `git checkout` scoped to files changed since the last human commit. Use `git mv` so path history is preserved. Never `git commit`, `git push`, or `git reset --hard` unless the human asks.

---

## Known violations the checker must rediscover

The inventory tool is wrong if a first run against current `src/` misses any of these.

**Directories (kebab vs camel; brand split):**

- `src/main/game-actions/` → `src/main/gameActions/` (sibling façade `src/main/gameActions.ts` stays; `gameActions.ts` + `gameActions/` is valid on Windows)
- `src/main/game-db/` → `src/main/gameDb/` (sibling façade `src/main/gameDb.ts` stays)
- `src/main/openrouter/` → `src/main/openRouter/` (case-only; two-step `git mv`)

**Kebab-case TypeScript files** (all under `src/main/briefing/map/`):

- `briefing-map-section.ts` / `.test.ts` → `briefingMapSection.ts` / `.test.ts`
- `briefing-tables.ts` → `briefingTables.ts`
- `hex-bounding-box.ts` → `hexBoundingBox.ts`
- `hex-code-translator.ts` / `.test.ts` → `hexCodeTranslator.ts` / `.test.ts`
- `hex-coordinates.ts` / `.test.ts` → `hexCoordinates.ts` / `.test.ts`
- `hex-grid-projection.ts` → `hexGridProjection.ts`
- `hex-map-renderer.ts` → `hexMapRenderer.ts`

**`Utils` files (collapse to `Helpers`):**

- `src/renderer/map/mapUtils.ts` → `mapHelpers.ts`
- `src/main/promptTableUtils.ts` → `promptTableHelpers.ts`
- `src/shared/marchPathUtils.ts` → `marchPathHelpers.ts`

**`Impl` file:**

- `src/main/game-actions/humanMarchPreview/humanMarchPreviewImpl.ts` — drop `Impl`; name after the operation (for example `humanMarchPreviewResolve.ts`). Do not name it `humanMarchPreview.ts` if that collides with the directory.

**`Impl` functions** (public wrappers in `gameActionsCore.ts` already use the name without `Impl`; **do not** drop the suffix onto a colliding export). Pick a distinct verb (`read`, `execute`, `resolve`):

- `getSealiftStackStateImpl`, `updateSealiftSlotImpl` in `src/main/game-actions/sealift.ts`
- `previewHumanMarchOrderImpl`, `previewHumanMarchOrdersImpl` in `humanMarchPreviewImpl.ts`
- `getHexBuildQueueImpl`, `addHexBuildQueueEntryImpl`, `updateHexBuildQueueEntryImpl`, `removeHexBuildQueueEntryImpl`, `applyBuildQueueTemplateToHexesImpl`, `setHexesKeepBuildingImpl` in `src/main/game-actions/buildQueue.ts`
- `submitOrdersImpl` in `src/main/game-actions/submitOrders.ts`

**Milestone-numbered tools** (`src/main/tools/`). Proposed file names (adjust in the ledger if a collision appears; `src/main/productionOrders.ts` already exists so `tool6Production.ts` must **not** become `production.ts`):

| Current | Proposed file |
| --- | --- |
| `tool1Pathfinding.ts` | `pathfinding.ts` |
| `tool1Pathfinding.test.ts` | `pathfinding.test.ts` |
| `tool1PathfindingDistanceHelpers.ts` | `pathfindingDistanceHelpers.ts` |
| `tool1PathfindingPlanRouteHelpers.ts` | `pathfindingPlanRouteHelpers.ts` |
| `tool1PathfindingSessionCache.ts` | `pathfindingSessionCache.ts` |
| `tool1PathfindingRouteResolution.ts` | `pathfindingRouteResolution.ts` |
| `tool1PathfindingStateful.ts` | `pathfindingStateful.ts` |
| `tacticalTool1Pathfinding.ts` | `tacticalPathfinding.ts` |
| `tacticalTool1Pathfinding.test.ts` | `tacticalPathfinding.test.ts` |
| `tool2Assessment.ts` | `assessment.ts` |
| `tool2Assessment.test.ts` | `assessment.test.ts` |
| `tool3CombatEstimation.ts` | `combatEstimation.ts` |
| `tool3CombatEstimation.test.ts` | `combatEstimation.test.ts` |
| `tool4Memory.ts` | `memory.ts` |
| `tool4Memory.test.ts` | `memory.test.ts` |
| `tool5StandingOrders.ts` | `standingOrders.ts` |
| `tool5StandingOrders.test.ts` | `standingOrders.test.ts` |
| `tool5StandingOrdersCore.ts` | `standingOrdersCore.ts` |
| `tool5StandingOrdersShared.ts` | `standingOrdersShared.ts` |
| `tool5StandingOrdersGeneration.ts` | `standingOrdersGeneration.ts` |
| `tool6Production.ts` | `productionTools.ts` |
| `tool6Production.test.ts` | `productionTools.test.ts` |

Proposed const identifiers (values frozen):

| Current | Proposed |
| --- | --- |
| `TOOL1_NAMES` | `PATHFINDING_TOOL_NAMES` |
| `TOOL2_NAMES` | `ASSESSMENT_TOOL_NAMES` |
| `TOOL3_NAMES` | `COMBAT_ESTIMATION_TOOL_NAMES` |
| `TOOL4_NAMES` | `MEMORY_TOOL_NAMES` |
| `TOOL5_NAMES` | `STANDING_ORDER_TOOL_NAMES` |
| `TOOL6_NAMES` | `PRODUCTION_TOOL_NAMES` |

`docs/ai-tools.md` currently keys groups to `TOOL*_NAMES` and “Tool 1 — pathfinding”. After this batch, update that doc to the new identifiers and drop the numeric headings.

Files already matching the contract (for example `coordinateContext.ts`, `tacticalAsciiGridProjection.ts` in the same map folder) are not violations.

---

## Reliability and understandability

- Prefer the TypeScript compiler API and language service over regex for identifiers and import updates.
- Keep `scripts/naming/` decomposed (workspace rule 09: 600 lines desirable, 1000 hard).
- Every new function in the tool gets an orienting comment per `.spec/completed/orienting-comments-style-contract-v1.md` (workspace rule 04).
- Use `const` and `readonly` (workspace rule 13).
- Build-time CLIs log with `console` and `/* eslint-disable no-console */`, matching `scripts/check-circular-deps.cjs`. Do not add a backend logger (workspace rule 02 does not apply).
- Tests cover happy paths and essential failures of rule predicates and the rename engine only (workspace rule 03). Do not test CLI argv parsing as a substitute for those contracts.

---

## 1 — Naming contract

### Objective

Publish a machine-checkable and human-reviewable contract so later sections cannot drift.

### Scope

Author `.spec/naming-conventions-contract-v1.md` containing **exactly** the rules below (you may reformat, not weaken).

#### Casing

| Kind | Convention | Examples |
| --- | --- | --- |
| Directories under `src/` | camelCase | `gameActions`, `tacticalBattle`, `openRouter` |
| TypeScript files | camelCase + `.ts` | `combatResolution.ts`, `hexCoordinates.ts` |
| Test files | `{moduleName}.test.ts` | `hexCoordinates.test.ts` |
| Exported functions | camelCase | `submitOrders`, `buildSystemPromptForTools` |
| Exported types, interfaces, classes | PascalCase | `GameStateSnapshot`, `TurnStateRow` |
| Exported consts (module-level) | camelCase or UPPER_SNAKE when they are frozen tables / name lists | `IPC_GAME`, `PATHFINDING_TOOL_NAMES` |
| `scripts/*.cjs` | kebab-case (out of product rename scope) | `check-circular-deps.cjs` |
| Python | snake_case / PascalCase classes (out of product rename scope) | `metadata_pipeline.py` |

#### Role-suffix allowlist (filenames and exported types)

Each suffix has one meaning. Do not introduce new suffixes.

| Suffix | Meaning |
| --- | --- |
| `Handler` | IPC or UI event orchestration that binds an action to engine calls |
| `Helpers` | Reusable helpers that do not own a domain concept |
| `Guards` | Validation, narrowing, or gating that rejects invalid input |
| `Adapter` | Translation at a process or layer boundary |
| `Pipeline` | A sequenced multi-step flow with a defined start and end |
| `Core` | Coordinating module of a multi-file feature whose siblings are named after sub-responsibilities; not a miscellaneous dump |
| `Types` | Type-only modules (`ordersTypes.ts`) |

**Banned:** `Utils` (use `Helpers`), `Impl` (name the operation), `Manager`, `Service`, `Processor`, `Controller`.

When dropping `Impl` from a function, if `foo` already exists as a public wrapper, rename the inner function to a distinct verb (`readFoo`, `executeFoo`, `resolveFoo`), never to `foo`.

#### Approved abbreviations

`res1`, `res4`, `h3`, `db`, `ipc`, `ui`, `ai`, `llm`. Do not invent `cfg`, `ctx` as exported names (`context` is acceptable). Domain words `tactical` and `strategic` stay when they disambiguate.

#### Length and concision rubric (judgement)

- Prefer the shorter name when both names convey the same meaning.
- Do not strip a word that distinguishes tactical from strategic, or res1 from res4.
- File names: typically 2–4 camelCase words. Exported functions: typically 2–5.
- A name is wrong if a new developer searching for the concept would not find it.

#### Boundary-mirror exemption

Properties of types and object literals that copy an external schema (SQL, OpenRouter HTTP, persisted JSON) stay in that schema's case, usually snake_case. They are never ledger entries.

#### Unacceptable names

Placeholder names (`foo`, `temp`, `data2`), tautologies (`helperUtils`), and duplicate siblings that mean the same thing (`escapeBuildPopupHtml` vs `escapeHtmlText` is a reuse issue: keep one export name for the shared helper; do not rename both to different verbose forms).

#### Reviewer checklist

- [ ] Casing matches the table for the symbol kind.
- [ ] Any role suffix is on the allowlist and matches the meaning.
- [ ] No banned suffix.
- [ ] Not a frozen string value being “fixed”.
- [ ] Concise without losing a disambiguating word.
- [ ] Colocated `*.test.ts` uses the same module name.

### Verification

1. Apply the checklist to these 15 current names (expected result in parentheses):
   - `src/main/openrouter/` (fail: brand casing)
   - `src/main/game-actions/` (fail: kebab directory)
   - `src/main/tacticalBattle/` (pass)
   - `hex-coordinates.ts` (fail: kebab file)
   - `coordinateContext.ts` (pass)
   - `mapUtils.ts` (fail: `Utils`)
   - `ipcPayloadGuards.ts` (pass: `Guards`)
   - `getSealiftStackStateImpl` (fail: `Impl`)
   - `TOOL2_NAMES` (fail: milestone number in an identifier)
   - `'assess_unit'` (pass as frozen **value**, not an identifier to rename)
   - `TurnStateRow.turn_number` (pass: boundary mirror)
   - `gameDb.ts` (pass: camelCase file)
   - `loggedIpcHandler.ts` (pass: `Handler`)
   - `humanMarchPreviewImpl.ts` (fail: `Impl`)
   - `src/renderer/openRouter/` (pass: brand camelCase)
2. Human sign-off on `.spec/naming-conventions-contract-v1.md`.

### Deliverables

- `.spec/naming-conventions-contract-v1.md`

### Stop

Do not start section 2 until the contract is signed.

---

## 2 — Inventory checker (read-only)

### Objective

Build a deterministic reporter that lists contract violations without writing product source.

### Files to create

Mirror `scripts/orienting-comments/` (see `scripts/orienting-comments/program.ts` and `cli.ts`).

| Path | Responsibility |
| --- | --- |
| `tsconfig.tools-naming.json` | Compile `scripts/naming/**/*.ts` to `dist/scripts/naming/`, `module: commonjs`, `rootDir: scripts/naming`, `types: ["node"]` — copy structure from `tsconfig.tools-orienting-comments.json` |
| `scripts/naming/types.ts` | Shared types: `ViolationCategory`, `Violation`, `ScanReport` |
| `scripts/naming/discovery.ts` | Walk `src/**/*.ts` and `scripts/orienting-comments/**/*.ts` plus `scripts/naming/**/*.ts`; skip `*.d.ts`; collect directories, file names, exported symbols via the compiler API |
| `scripts/naming/rules.ts` | Pure predicates implementing the contract (casing, suffixes, `toolN` / `TOOLN_` identifier pattern, kebab path segments under `src/`) |
| `scripts/naming/report.ts` | Format JSON + human summary; never mutate |
| `scripts/naming/cli.ts` | `report` (exit 0) and later `check` / `apply` |
| `scripts/naming/namingRules.test.ts` | Happy path + essential failures for predicates |

Do not put section numbers in these filenames or in npm script names.

### Types (lock these names for later sections)

```ts
export type ViolationCategory =
  | 'directoryCasing'
  | 'fileCasing'
  | 'bannedSuffix'
  | 'numberedTool'
  | 'exportCasing';

export interface Violation {
  readonly category: ViolationCategory;
  readonly filePath: string;
  readonly currentName: string;
  readonly suggestedName?: string;
  readonly detail: string;
}

export interface ScanReport {
  readonly repoRoot: string;
  readonly scannedFileCount: number;
  readonly violations: readonly Violation[];
}
```

`rules.ts` must export (names locked):

- `isCamelCaseIdentifier(name: string): boolean` — first character lower, no hyphens, no underscores except that files are checked without `.ts` / `.test`.
- `isPascalCaseIdentifier(name: string): boolean`
- `isKebabCaseSegment(segment: string): boolean`
- `bannedSuffixIn(name: string): 'Utils' | 'Impl' | 'Manager' | 'Service' | 'Processor' | 'Controller' | null`
- `isNumberedToolName(name: string): boolean` — matches `/tool\d/i` or `/^TOOL\d_/` on file base names and exported identifiers
- `directoryViolations(dirPathFromSrc: string): Violation | null` — kebab segments under `src/` except none expected after apply; `openrouter` as all-lowercase brand is a violation

Approved abbreviations inside camelCase (`res1`, `h3`, `ipc`) are allowed.

### `discovery.ts`

- Create a program with `tsconfig.tools-src-ast.json` (already used by orienting-comments) for `src/`.
- For `scripts/orienting-comments` and `scripts/naming`, parse those tsconfigs or add their files to a second program.
- For each source file, use `sf.statements` and `ts.getCombinedModifierFlags` to find `export function`, `export const`, `export type`, `export interface`, `export class`.
- Do not flag type/interface property names (boundary mirror). Do not flag string literal types' values.

### CLI

```text
node dist/scripts/naming/cli.js report [repoRoot]
```

Print JSON to stdout. Write a copy to `.spec/naming-last-report.json` for humans (this path is a spec artifact, not product code).

### npm scripts to add in `package.json`

```json
"build:naming": "tsc -p tsconfig.tools-naming.json",
"naming:report": "npm run build:naming && node dist/scripts/naming/cli.js report",
"test:naming": "npm run build:naming && node dist/scripts/naming/namingRules.test.js"
```

### Tests (`namingRules.test.ts`)

Use `node:assert` like `scripts/orienting-comments/orientingComments.test.ts`. Essential cases:

- `isCamelCaseIdentifier('hexCoordinates')` true; `'hex-coordinates'` false; `'HexCoordinates'` false
- `bannedSuffixIn('mapUtils')` is `'Utils'`; `bannedSuffixIn('mapHelpers')` is null
- `bannedSuffixIn('submitOrdersImpl')` is `'Impl'`
- `isNumberedToolName('tool2Assessment')` true; `isNumberedToolName('TOOL2_NAMES')` true; `isNumberedToolName('assessment')` false
- `isKebabCaseSegment('game-actions')` true; `isKebabCaseSegment('gameActions')` false

Run: `npm run test:naming`  
Expected: process exit 0.

### Verification against the live tree

Run `npm run naming:report` from the repo root. The JSON **must** include:

- a `directoryCasing` violation for `src/main/openrouter`
- `directoryCasing` for `src/main/game-actions` and `src/main/game-db`
- `fileCasing` for each of the seven kebab implementation files under `src/main/briefing/map/` (tests may be reported as paired files)
- `bannedSuffix` for `mapUtils`, `promptTableUtils`, `marchPathUtils`, `humanMarchPreviewImpl`
- `numberedTool` for `tool1Pathfinding` (and typically the other `toolN*` files)

If any of those are missing, fix discovery/rules before continuing.

### Deliverables

- `scripts/naming/*` as listed
- `tsconfig.tools-naming.json`
- npm scripts
- `.spec/naming-last-report.json` from a successful report run

### Stop

Do not mutate `src/` yet.

---

## 3 — Rename ledger

### Objective

Turn every violation (plus judgement-only issues found in review) into a signed, ordered work list.

### Files

- `.spec/naming-rename-ledger-v1.md` — human-readable table grouped by apply batch
- `scripts/naming/renameLedger.json` — machine-readable; the apply CLI reads **only** this file

### JSON schema (lock field names)

```ts
export type LedgerEntryKind = 'directory' | 'file' | 'symbol';
export type LedgerStatus = 'pending' | 'applied' | 'waived';

export interface LedgerEntry {
  readonly id: string;
  readonly kind: LedgerEntryKind;
  readonly currentPath: string;
  readonly currentName: string;
  readonly proposedPath?: string;
  readonly proposedName: string;
  readonly category: ViolationCategory | 'judgement';
  readonly rationale: string;
  readonly referencingFileCount: number;
  readonly linkedEntryIds: readonly string[];
  readonly status: LedgerStatus;
  readonly waiverReason?: string;
}
```

`id` format: short stable tokens like `dir-game-actions`, `file-hex-coordinates`, `sym-TOOL2_NAMES`. Do not encode section numbers of this plan.

`linkedEntryIds`: a file rename lists the symbol entries that should apply in the same batch when the exported name equals the file stem; a file rename always lists its `*.test.ts` pair.

Every violation from `naming:report` has an entry **or** `status: "waived"` with `waiverReason`. Waive only true false positives (for example a third-party `.d.ts`).

### Ordering inside the ledger file

1. The three directories (`game-actions`, `game-db`, `openrouter` last because it is case-only).
2. File renames grouped by parent directory (`briefing/map`, then `Utils` files, then `humanMarchPreviewImpl`).
3. Symbol `Impl` / `Utils` export names (after files, so paths exist).
4. `src/main/tools/` file+symbol de-numbering as one declared batch in the JSON, still applied with the dedicated section 8 gate.

Blast radius: `referencingFileCount` is the number of TypeScript files whose text contains the current identifier or import path segment (count only, do not replace). A language-service dry-run in section 4 will refine this; an approximate grep count is acceptable for the ledger.

### Judgement pass

Walk exported names that the mechanical checker accepted. Flag synonyms and over-long names using the rubric. Each becomes a `category: "judgement"` ledger entry or is explicitly skipped with no entry (skipping is allowed only when the current name already matches the rubric). Do not churn names that are already clear (`computeTacticalBattleSnapshot`).

### Verification

- Count of `naming:report` violations equals count of ledger entries that are not `judgement`, except waived.
- Human sign-off on both ledger files. **Nothing in `src/` is renamed before this sign-off.**

### Deliverables

- `.spec/naming-rename-ledger-v1.md`
- `scripts/naming/renameLedger.json`

### Stop

Hard stop for human approval.

---

## 4 — Rename engine

### Objective

Apply **exactly one** ledger entry per invocation, with dry-run, using the language service for symbols and `getEditsForFileRename` for paths.

### New files

| Path | Responsibility |
| --- | --- |
| `scripts/naming/languageServiceHost.ts` | `createNamingLanguageService(repoRoot: string): ts.LanguageService` using `tsconfig.tools-src-ast.json` the same way `createSrcAstProgram` reads config |
| `scripts/naming/windowsGitMv.ts` | `gitMvPreserveHistory(oldAbs: string, newAbs: string): void` — if only case differs, two-step through `*.renamehold` |
| `scripts/naming/pathBaselines.ts` | Rewrite `scripts/verify-modularization-tests.manifest` path strings; do not invent circular/renderer baseline content (those use dump scripts) |
| `scripts/naming/ledger.ts` | Load/save `renameLedger.json`; `getEntry(id)`, `markApplied(id)` |
| `scripts/naming/applyRename.ts` | `applyLedgerEntry(repoRoot, entryId, dryRun: boolean): ApplyResult` |
| `scripts/naming/applyRename.test.ts` | Temp-dir fixtures for one file rename + one symbol rename |

### Language service host (required behavior)

```ts
export function createNamingLanguageService(repoRoot: string): ts.LanguageService {
  const configPath = path.join(repoRoot, 'tsconfig.tools-src-ast.json');
  const configFile = ts.readConfigFile(configPath, (p) => fs.readFileSync(p, 'utf8'));
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => parsed.options,
    getScriptFileNames: () => parsed.fileNames,
    getScriptVersion: () => '1',
    getScriptSnapshot: (fileName) => {
      if (!ts.sys.fileExists(fileName)) return undefined;
      return ts.ScriptSnapshot.fromString(ts.sys.readFile(fileName, 'utf8') ?? '');
    },
    getCurrentDirectory: () => repoRoot,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  return ts.createLanguageService(host);
}
```

### Symbol rename

1. Locate the exported declaration in `currentPath` (AST: matching `currentName`).
2. `languageService.findRenameLocations(fileName, position, false, false)` — **both booleans false** (`findInStrings`, `findInComments`).
3. Apply `FileTextChanges` from the end of each file backward so offsets stay valid.
4. Collect comment hits with a **separate** scan: for each `findRenameLocations(..., false, true)` location that was not in the `findInComments: false` set, print `commentOccurrences` for the human to edit. Do not auto-write comments.
5. After apply, if any remaining `findRenameLocations` for the old name at that declaration exists, fail.

### File and directory rename

Order matters. `getEditsForFileRename` must run **before** the path disappears from disk, while the language service host still reads the old location:

1. Resolve all `.ts` files to move (one file, or every `.ts` under a directory). For a directory, compute `newAbs` for each file by replacing the directory prefix.
2. For each pair `(oldAbs, newAbs)`, call `languageService.getEditsForFileRename(oldAbs, newAbs)` and collect `FileTextChanges`.
3. Apply those import/specifier edits to files that are **not** themselves being moved (and to moved files' contents if the API returns them), writing to disk at current paths.
4. `git mv` (two-step when case-only) for the directory or file.
5. Recreate the language service (script file names have changed).
6. Update `scripts/verify-modularization-tests.manifest` lines that contain the old `dist/` relative path (`src/foo.ts` → `dist/foo.js`).
7. One CLI invocation processes one ledger `id`. File batches in section 6 are multiple invocations then **one** gate. Directory section 5 is one id, one gate. Colocated `*.test.ts` is a separate linked `id` applied in the same batch before the gate.

### `clean:dist` script

Add to `package.json`, copying the `clean:release` pattern (Node 24 `fs.rmSync` uses `retryDelay`):

```json
"clean:dist": "node -e \"const fs=require('fs');const p=require('path').join(process.cwd(),'dist');if(fs.existsSync(p)){try{fs.rmSync(p,{recursive:true,maxRetries:3,retryDelay:200});}catch(e){console.error('dist/ in use. Close processes locking it, then retry.');process.exit(1);}}\""
```

### CLI

```text
node dist/scripts/naming/cli.js apply --id <ledgerId> [--dry-run]
```

Dry-run prints proposed edits and comment occurrences; writes nothing; does not `git mv`.

Idempotency: applying an `applied` id is a no-op exit 0. Applying twice on a pending id: first applies, second no-op.

### Tests

Essential:

- File fixture: `sample-name.ts` with `export function sampleName(): number { return 1; }`, imported from `importer.ts` as `from './sample-name'`. Apply ledger file rename to `sampleName.ts`. Assert the importer specifier is `./sampleName`.
- Symbol fixture: `export function oldName(): void {}` called from another file; a sibling string `'oldName'` in the definition file. Apply symbol rename to `newName`. Assert the caller identifier updated and the string `'oldName'` unchanged.

Run: extend `test:naming` to also run `applyRename.test.js`.

### Low-blast verification on the real repo (dry-run only)

Pick the lowest `referencingFileCount` pending **file** entry (likely `hex-bounding-box.ts`). Run apply `--dry-run`. Confirm the printed import list is non-empty if the module is imported, and that no string literal values in `channels.ts` appear in the edit list.

Do **not** apply to `src/` in this section except if the human already signed the ledger **and** you are executing section 5. Section 4 ends when tests pass and dry-run looks correct.

### Deliverables

- Engine modules, `clean:dist`, `naming:apply` script:
  `"naming:apply": "npm run build:naming && node dist/scripts/naming/cli.js apply"`

### Stop

Human may commit tooling-only changes. Still no product rename until section 5.

---

## 5 — Directory renames

Apply **one directory per gate**, in this order:

1. `id` for `game-actions` → `gameActions`
2. `id` for `game-db` → `gameDb`
3. `id` for `openrouter` → `openRouter` (two-step `git mv`)

After each:

1. `npm run naming:apply -- --id <id>` (exact argv parsing: implement `--id` as a named flag).
2. `node scripts/dump-circular-deps.cjs scripts/circular-deps-baseline.json`
3. `npm run dump:renderer-types-baseline` if any renderer path changed (skip for main-only dirs 1 and 2).
4. Shared verification gate.
5. Stop for human commit.

Also update imports in `src/main/gameActions.ts` (`./game-actions/...` → `./gameActions/...`) and `src/main/gameDb.ts` (`./game-db/...` → `./gameDb/...`) via `getEditsForFileRename`; if any remain, fail the gate (`tsc` will fail).

Update living `docs/**` path mentions for these directories in the same directory's batch (`docs/ai-commander-prompts/README.md` mentions `src/main/openrouter/`).

### Verification

- `src/main/game-actions/` does not exist (after step 1).
- `src/main/openrouter/` does not exist as a distinct casing from `openRouter` (after step 3; on Windows confirm `git ls-files` shows `src/main/openRouter/`).
- Full gate green.

---

## 6 — File renames

Group by parent directory. Suggested batches (each batch = several `naming:apply` invocations, then **one** gate):

1. All kebab files under `src/main/briefing/map/` including tests.
2. The three `Utils` → `Helpers` files and any exported symbols that still contain `Utils` (if a file export is named `mapUtils` something; usually the file stem is enough).
3. `humanMarchPreviewImpl.ts` → agreed proposed name.

Rules:

- Rename `foo.test.ts` in the same batch as `foo.ts` (linked ids).
- After each batch: refresh circular-deps baseline; dump renderer baseline if a renderer file moved; full gate; human commit.

### Verification

`naming:report` has no `fileCasing` and no file-level `bannedSuffix` for `Utils` filenames. `Impl` **functions** may still remain until section 7.

---

## 7 — Symbol renames (non-tool)

Apply `kind: "symbol"` entries that are not in `src/main/tools/`. Batch by file to keep review small (for example all `buildQueue.ts` Impl functions in one batch).

After each batch:

1. Print and resolve `commentOccurrences` (orienting comments that still say the old identifier).
2. Fix `readRendererSource` tests if they regex the old function name.
3. Full gate; human commit.

### Verification

- `tsc` green (catches missed identifier references).
- String values in `TOOL*_NAMES` arrays and `IPC_*` objects unchanged (`git diff` should not touch those quotes except whitespace). If a diff shows `'assess_unit'` becoming something else, **revert immediately**.

---

## 8 — Tools de-numbering

Apply all remaining `src/main/tools/` file and symbol entries. LLM string values stay frozen.

Also update:

- `docs/ai-tools.md` (drop “Tool 1” headings; replace `TOOL1_NAMES` with `PATHFINDING_TOOL_NAMES`, etc.)
- `docs/README.md` if it cites `TOOL_*_NAMES`
- Comment occurrences for `TOOL2_NAMES` and similar

Same gate and human commit. If the batch is large and the gate is red, restore to the last commit and split into pathfinding / assessment / remaining.

### Verification

- `isNumberedToolName` no longer matches any **file** under `src/main/tools/` except none.
- `rg "TOOL[0-9]_NAMES" src` returns no identifier hits (string `'TOOL1_NAMES'` in docs/archive may remain only in `.spec/completed/` which you must not edit).
- `rg "tool[0-9]" src/main/tools` returns no file names.
- Values `'plan_route'` etc. still present.

---

## 9 — Enforcement and documentation

### ESLint `naming-convention` (avoid a flood)

Modify `eslint.config.js`. Add `@typescript-eslint/naming-convention` as `error` on `src/**/*.ts` with **this selector set** (do not apply `format: camelCase` to type properties):

```js
'@typescript-eslint/naming-convention': [
  'error',
  { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
  { selector: 'typeLike', format: ['PascalCase'] },
  { selector: 'enumMember', format: ['PascalCase'] },
  {
    selector: 'variable',
    modifiers: ['const'],
    format: ['camelCase', 'UPPER_CASE'],
  },
  { selector: 'function', format: ['camelCase'] },
  { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
  { selector: 'import', format: ['camelCase', 'PascalCase'] },
  { selector: 'objectLiteralProperty', format: null },
  { selector: 'typeProperty', format: null },
],
```

`format: null` on `objectLiteralProperty` and `typeProperty` is the boundary-mirror carve-out. Without it, `turn_number` and `max_tokens` fail across the tree.

### Custom plugin for files and directories

Create:

- `eslint-rules/naming-conventions-plugin.cjs` — `meta.name = 'naming-conventions'`
- `eslint-rules/require-src-path-casing.cjs` — on each file under `src/`, split path relative to `src/`; every directory segment must match `/^[a-z][a-zA-Z0-9]*$/`; every file base (minus `.test` and `.d`) must be camelCase except `main.ts`, `preload.ts`, `renderer.ts`, `index.ts`, and `better-sqlite3.d.ts`

Register in `eslint.config.js` next to `orienting-comments`, rule `naming-conventions/require-src-path-casing: 'error'`.

### `naming:check`

CLI mode `check` exits 1 if `renameLedger.json` has any `pending` entries **or** if a fresh scan finds violations not waived. After one-pass completion, pending should be empty and the scan should be clean.

Add to `package.json` `"naming:check": "npm run build:naming && node dist/scripts/naming/cli.js check"`.

Insert `npm run naming:check` into the existing `"test"` script **after** `lint` (so path casing is also covered by ESLint, and leftover violations fail CI).

### Cursor rule

Create `.cursor/rules/14-naming-conventions.mdc` (`alwaysApply: true`) stating: follow `.spec/naming-conventions-contract-v1.md`; do not put plan-section identifiers in code; do not rename frozen string values. Do not mention section numbers from this plan.

### Docs

- Add a row to `docs/README.md` for the contract.
- Optionally a short `docs/naming-conventions.md` that points at the contract (living doc, not a second source of rules). If you add it, the contract remains authoritative.

### Verification

- `npm run lint` is green on the post-rename tree.
- `npm run naming:check` exits 0.
- `npm test` (full script) is green. Native rebuild still runs once at the start of `npm test` as today.

### Deliverables

- ESLint config + plugin
- `naming:check` on `npm test`
- `.cursor/rules/14-naming-conventions.mdc`
- docs index update

---

## Essential test strategy (tooling)

**Happy path**

- CamelCase file and directory accepted.
- `Helpers` suffix accepted; `Utils` rejected.
- Symbol rename updates the caller identifier and leaves a same-spelling string literal intact.
- File rename updates `from './oldName'` to `from './newName'`.
- Second apply of an `applied` id is a no-op.

**Essential failures**

- `findInStrings` must not be true (assert the engine function hardcodes `false`, or assert the string-literal fixture).
- Case-only directory rename uses two `git mv` steps on a fixture when `oldPath.toLowerCase() === newPath.toLowerCase()`.
- Apply refuses unknown ledger id (exit non-zero).
- Checker reports `openrouter` while that directory still exists (until section 5 completes).

---

## Execution order

1. Contract (signed)  
2. Checker (tests + live rediscovery)  
3. Ledger (signed)  
4. Engine (tests + dry-run)  
5. Directories (three human-gated applies)  
6. Files (per-directory batches)  
7. Symbols except tools  
8. Tools de-numbering  
9. Enforcement  

1–4 do not mutate product source except adding `scripts/naming/` and tsconfig/npm scripts. 4 may add `clean:dist`.

---

## Definition of done

- Contract and ledger exist and were signed before product renames.
- `src/` directories are camelCase; no kebab TypeScript files under `src/`.
- No exported `Utils` / `Impl` names; no `toolN` / `TOOLN_` identifiers under `src/`.
- Frozen string values unchanged.
- `npm test` includes `naming:check` and is green.
- ESLint naming rules are green without disabling `typeProperty` globally beyond the specified `format: null`.
- Developers can read `.spec/naming-conventions-contract-v1.md` without reading this plan.

---

## Suggested first command after sign-off of this plan

Create `.spec/naming-conventions-contract-v1.md` from section 1 of this document, then implement `scripts/naming/rules.ts` tests first (`npm run test:naming`) before discovery.
