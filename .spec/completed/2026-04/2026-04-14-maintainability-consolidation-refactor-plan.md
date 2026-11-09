# Execution plan: maintainability consolidation and reuse

## Audience and intent

This document is for an **implementing agent with limited context** (lower than the authoring assistant). Execute **phases in order**. Each phase must finish with its **verification gate** before starting the next. Prefer **small diffs**, **no behavior changes** unless the phase explicitly allows them, and **preserve existing tests** unless a phase adds targeted coverage.

### Before you begin (reconcile with the current repo)

The product owner may have landed **partial** work after this plan was written. **Do not redo** a phase whose deliverables already exist.

| Phase | Quick “already done?” check |
|-------|-----------------------------|
| 1 | `rg isWithinAirFerryGridRange src` and `rg isWithinAirStrikeGridRange src` — if both symbols exist **and** `rg 'isWithinGridRangeSafe\\([^)]*AIR_' src/main` is **empty** outside `gridRange.ts` (and any dedicated `airGridRange.ts`), treat Phase 1 as complete. |
| 2 | `rg unitHasTacticalRangedBaseline src` — if defined in `shared` and `initCore` / `tacticalOrders` call it, and the **contract test** + `package.json` hook exist, treat Phase 2 as complete. |
| 3 | Read `combatConstants.ts` / `tacticalRanges.ts` for the “strategic vs tactical range” commentary — if both pointers exist, skip Phase 3. |
| 4 | `rg validateTacticalGroupRangedTarget src` (or the name you chose) — if extracted from `gameActions.ts` **and** the **mandatory** dedicated test file + `package.json` entry exist, skip Phase 4. |
| 5 | If `src/main/game-actions/humanMarchPreview/` (or barrel) exists and smoke test + `package.json` hook exist, skip Phase 5. |

## Goals (what “done” looks like)

1. **Fewer near-duplicate range/grid checks** so ferry, air strike, and briefing code share one implementation path.
2. **Fewer copy-pasted tactical UI predicates** in the renderer.
3. **Clear documentation** of **strategic** vs **tactical** range sources so future edits do not mix `getRange` (res1 combat) with `RANGED_RANGE_BY_UNIT_TYPE` (res4 tactical).
4. **Smaller, navigable modules** where files already exceed or approach the project’s size limits (notably `gameActions.ts`, `humanMarchPreview.ts`).

## Non-goals

- Changing combat outcomes, dice, or turn order.
- Renaming IPC fields, database columns, or user-visible strings unless a phase explicitly says so.
- “Cleanup” refactors with no concrete caller benefit (avoid churn).

## Preconditions (read once)

- **Strategic ranged hex distance** for many paths uses `getRange` from `src/main/combatConstants.ts` (small res1-scale values).
- **Tactical** baselines use `RANGED_RANGE_BY_UNIT_TYPE` / `MOVEMENT_RANGE_BY_UNIT_TYPE` in `src/shared/tacticalRanges.ts`, reduced by `src/shared/tacticalTerrainCombatModifiers.ts`.
- **Grid range / distance** logic: `src/shared/h3GridRangePure.ts` (pure), `src/main/game-actions/gridRange.ts` (logging on disk fallback). **Doc hygiene:** if Phase 1 edits `gridRange.ts`, align the **`isWithinGridRangeSafe` orienting comment** with the actual implementation (today it references `isWithinGridRangePure` while the body uses `computeGridDistancePure` + `gridDisk` fallback)—accurate comments are part of maintainability.
- **Layering:** `src/shared/**` must **not** import `src/main/logger.ts` (avoids renderer/main cycles and keeps shared usable everywhere). **House-rule logging** (`logDebug` / `logTrace` / `logError`) therefore applies at **main-process** (and logger-aware) boundaries—not inside thin shared lookups unless the repo already establishes a shared-safe logger (it does not today).

## Opportunities (prioritized backlog)

| # | Opportunity | Primary files / symbols today | Risk if mishandled |
|---|-------------|------------------------------|-------------------|
| 1 | Centralize **air ferry** and **air strike** `isWithinGridRangeSafe(..., AIR_*_RANGE_HEXES, ...)` call sites behind **named wrappers** | `airValidation.ts`, `humanMarchPreview.ts`, `possibleUnitActions.ts`, `tacticalOpponentOrderValidation.ts`, `readyStrategicResolutionPipeline.ts` | Wrong constant or context string; missed call site |
| 2 | Deduplicate renderer **“unit has tactical ranged baseline”** predicate | `initCore.ts`, `tacticalOrders.ts` (`RANGED_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 0) >= 1`) | Import cycle; include `air` semantics incorrectly |
| 3 | **Documentation only**: single “Range sources” note linking `getRange` ↔ tactical constants | `combatConstants.ts`, `tacticalRanges.ts`, optionally `.spec/tactical-terrain-movement-ranged-execution-plan.md` code map | None if text-only |
| 4 | Extract **tactical branch** of `validateGroupRangedTarget` into a dedicated module to shrink `gameActions.ts` | `gameActions.ts` (~1500+ lines) | Regression in validation or error messages |
| 5 | Split **`humanMarchPreview.ts`** (over **1000** lines) into **topic-focused modules** under `src/main/game-actions/humanMarchPreview/` (or similar) with a thin barrel re-export | `humanMarchPreview.ts` | Broken imports; subtle preview drift |
| 6 | **Optional / lower priority:** align `orderLabelFormatting.ts` `computeGridDistanceForLabel` with `computeGridDistancePure` semantics **or** document why UI labels intentionally differ | `orderLabelFormatting.ts`, `h3GridRangePure.ts` | Visible label changes if logic changes |
| 7 | **Optional:** extract `collectRangedTargetHexes` (+ tightly related helpers) from `possibleUnitActions.ts` into `possibleUnitActionsStrategicRanged.ts` if that file grows past ~600 lines | `possibleUnitActions.ts` | Merge conflicts only |
| 8 | **Follow-on backlog (not a numbered phase here):** further shrink `gameActions.ts` after Phase 4 by extracting other cohesive blocks (e.g. large `validateOrder` / strategic-only paths) **only** when each extraction has the same test + grep discipline | `gameActions.ts` | Phase 4 alone will **not** bring this file under the 600-line desirable limit; avoid scope creep in one pass |

**Note on opportunity count:** Items **1–5** are the **core** 5–10 deliverables (five concrete phases); **6–8** extend the backlog without requiring a single mega-refactor.

---

## Phase 1 — Air ferry and air strike grid-range wrappers

**Deliverables**

- In `src/main/game-actions/gridRange.ts` (preferred) **or** a new small `src/main/game-actions/airGridRange.ts` adjacent to air validation, add:
  - `isWithinAirFerryGridRange(originH3: string, destH3: string, context: string): boolean` — delegates to `isWithinGridRangeSafe(..., AIR_FERRY_RANGE_HEXES, context)`.
  - `isWithinAirStrikeGridRange(originH3: string, destH3: string, context: string): boolean` — same for `AIR_STRIKE_RANGE_HEXES`.
- Add orienting comments per project rules (contract: same behavior as today; `context` forwarded into `isWithinGridRangeSafe` for error/disk-fallback logs).
- **Logging (house rules):** each wrapper calls **`logDebug` once at entry** with `{ originH3, destH3, context }` (import `logDebug` into `gridRange.ts` if missing). No additional logging on the boolean return path unless new branches appear.
- Replace **every** direct `isWithinGridRangeSafe(..., AIR_FERRY_RANGE_HEXES, ...)` and `... AIR_STRIKE_RANGE_HEXES ...` in **main-process** code listed in opportunity **#1** with the wrappers.
- **Explicitly out of scope for Phase 1:** `src/main/openrouter/rangeSupport.ts` uses **`rangeHexes`** (generic radius) with `isWithinGridRangeSafe`; do **not** force it through the air-specific wrappers unless you add a **third** clearly named generic helper in a later micro-phase.

**Verification**

- `npm run build:main` and `npm run lint` pass.
- `rg "isWithinGridRangeSafe\\([^,]+,[^,]+,\\s*AIR_(FERRY|STRIKE)_RANGE_HEXES"` across `src/main` returns **no matches** outside `gridRange.ts` (or the new helper file if you placed wrappers there and kept raw calls only inside wrappers).
- Run tests that touch air orders: at minimum `node dist/main/game-actions/invalidAirBase.test.js` and any test file that imports `airValidation` / `humanMarchPreview` if present in `package.json` test chain (full `npm test` preferred).

**Stop gate:** No edits to renderer in this phase unless a main-only grep shows a duplicate **main-process** call site you missed.

---

## Phase 2 — Renderer tactical ranged eligibility helper

**Deliverables**

- Add a **tiny** exported function, e.g. `unitHasTacticalRangedBaseline(unitType: string): boolean`, in `src/shared/tacticalRanges.ts` (preferred, next to `RANGED_RANGE_BY_UNIT_TYPE`) **or** `src/shared/tacticalUiEligibility.ts` if you want zero growth in `tacticalRanges.ts`.
- Implementation: `return (RANGED_RANGE_BY_UNIT_TYPE[unitType] ?? 0) >= 1` (match existing `initCore` / `tacticalOrders` behavior exactly—**before** editing, open both files and confirm identical semantics for `air` and unknown types).
- **Logging (house rules):** **No `logTrace` inside this helper**—**implementation detail:** shared modules must not import the main-process logger (see **Preconditions**). Satisfy trace expectations by an **orienting comment** on the export: states it is a pure shared lookup; main-only callers that **wrap** this result in new behavior should log at their boundary. Renderer has no standard `logTrace` pipeline for this path.
- Replace duplicate expressions in:
  - `src/renderer/map/initCore.ts`
  - `src/renderer/gameplay/tacticalOrders.ts`

**Verification**

- **`npm run build:main`** and **`npm run build:renderer`** pass (see `package.json`: renderer is bundled with **esbuild**, not `tsc -p tsconfig.renderer.json` in the default pipeline—use **`npm run build:renderer`** as the authoritative renderer compile check unless CI adds a separate `tsc --noEmit` step).
- Grep: `RANGED_RANGE_BY_UNIT_TYPE\\[unit\\.unitType\\]` should not remain in those two files for this predicate (imports may remain for other uses).
- **Reliability:** add a **small main-process unit test** (new `src/main/.../*.test.ts`) that imports `unitHasTacticalRangedBaseline` and asserts a **short table** of types (`infantry`, `armor`, `naval`, `air`, unknown string) matches what `initCore` / `tacticalOrders` implemented **before** the refactor (copy expected booleans from current code). This locks the contract for future renderer edits. **Append** `node dist/main/.../<new-test>.js` to the **`npm test`** script in `package.json` in the same style as neighboring tests—otherwise CI will never run it.

**Stop gate:** No new imports from `main/` into `shared/`; keep dependency direction **renderer → shared** only.

---

## Phase 3 — Documentation: strategic vs tactical range sources

**Deliverables**

- Add a short **“Range constants: strategic vs tactical”** subsection:
  - Top of `src/main/combatConstants.ts` near `getRange` / `RANGE`, **or** a 15–25 line block comment on `getRange` documenting that it is **res1 strategic combat** range, not tactical res4.
  - Mirror a one-paragraph pointer in `src/shared/tacticalRanges.ts` above `RANGED_RANGE_BY_UNIT_TYPE`: tactical baselines; strategic combat range remains `getRange`.
- Optionally update the **code map** line in `.spec/tactical-terrain-movement-ranged-execution-plan.md` that still references only `isWithinGridRangeSafe` for the tactical branch if the codebase uses `isWithinGridRangePure` — **text only**, no logic change.

**Verification**

- No runtime behavior change; `npm run build:main` passes.
- A new reader can answer: “Which function do I use for strategic ranged legality vs tactical?” from comments alone.

**Stop gate:** Do not change numeric range values in this phase.

---

## Phase 4 — Extract tactical ranged validation from `gameActions.ts`

**Deliverables**

- Move the **tactical-specific** body of `validateGroupRangedTarget` (footprint, anchor, `effectiveTacticalRangedMaxRangeForAttacker`, `isWithinGridRangePure`, mountain LOS / trace-failed handling, user-facing reason strings) into e.g. `src/main/game-actions/tacticalGroupRangedTargetValidation.ts` **or** `src/main/tacticalBattle/validateTacticalGroupRangedTarget.ts`.
- Export one well-named function, e.g. `validateTacticalGroupRangedTarget(...)`, returning the same shape / reasons the tactical branch uses today.
- **Mandatory deliverable (not optional):** a **new** dedicated test module whose **runtime imports** for the scenarios under test are **only** the extracted validator module (plus Node/`h3-js`/fixtures as needed). **`import type` from `gameActions`, `gameDb`, or IPC types is allowed** for result shapes. Do **not** call `validateGroupRangedTarget` or other `gameActions` entry points to obtain the accept/reject outcomes under test—assert on the **extracted** API directly. Existing integration tests are **not** sufficient on their own for Phase 4 sign-off.
- **Logging (house rules):** **`logDebug` at public entry** with unit ids / target hex / battle id fields already logged today (mirror or delegate—do not drop diagnostics). **`logError`** in any new `catch` paths; preserve existing `logError` messages for LOS trace failures verbatim unless a test locks the string.
- `gameActions.ts` calls the extracted function and stays a **thin coordinator** for session lookup and strategic vs tactical branching.
- **Expectation:** `gameActions.ts` will likely **remain above the 600-line desirable limit** after this phase; the goal is a **measurable net reduction** and clearer ownership, not hitting the limit in one step (see opportunity **#8**).

**Verification**

- `npm test` (or the project’s full test script) passes — especially anything touching `submitOrders`, `gameActions`, tactical commit.
- No change in log event names / error messages that tests assert on (grep tests for string literals if unsure).
- `gameActions.ts` line count drops measurably (target: **at least** 80 lines removed net, documented in PR description).
- **Reliability (hard gate):** the **new** test file from deliverables exists, **`node dist/main/.../<that-test>.js` passes in isolation**, and its path is **appended** to `package.json`’s `test` script. Reuse fixture patterns from `tacticalTerrainCombatModifiers.test.ts` / `tacticalRes4HexFixtures` where possible; do not skip this step because `gameActions` tests already pass.

**Stop gate:** If any ambiguity around embarked anchors vs `h3Index`, **stop** and read `tacticalMovementTerrainAnchorH3` usage in existing code; do not invent new anchor rules.

---

## Phase 5 — Split `humanMarchPreview.ts` by concern

**Deliverables**

- Physical split of `src/main/game-actions/humanMarchPreview.ts` into multiple files under a **single directory** (example: `src/main/game-actions/humanMarchPreview/` with `index.ts` re-exporting the public API used by other modules).
- Suggested cut lines (adjust after reading file):
  - **Ferry / air-range preview** helpers (ties naturally to Phase 1 wrappers once introduced).
  - **March path / group assembly** (anything already delegating to `humanMarchPreviewGroupAssembly` stays there).
  - **Core entry** `humanMarchPreview` (or equivalent) stays minimal.
- Update imports across the repo; **no** behavior change.
- **Mandatory deliverable:** a **new** smoke test (or extension of an existing test file only if it already imports the **barrel** path) that performs a **direct static import** of the **public** preview entry re-exported after the split (same symbols consumers use). One minimal assertion is enough (e.g. “module loads and a tiny pure helper returns expected value”)—purpose is to catch broken barrels and wrong `index.ts` wiring.

**Verification**

- No file in the new layout exceeds **600 lines** where avoidable; hard cap **1000** must not be violated.
- `npm test` passes; pay attention to `humanMarchPreview`-related tests and pathfinding preview tests.
- `rg "humanMarchPreview"` across `src/` to ensure every import resolves (do not rely on a single fragile quoted `from` pattern—Windows and barrel paths vary).
- **Reliability (hard gate):** the smoke test from deliverables is present, **`node dist/main/...` on that file passes**, and **`package.json`’s `test` script** includes that `node` invocation (new file **or** newly added case in an already-listed test file that now imports the barrel—either way, CI must exercise the barrel path **directly**).
- **Modularization (hard gate):** **`npm run verify:modularization`** must pass after Phase 5 (see **Resolved decisions**). Run it only when **`npm test` is already green** for the phase, since `verify:modularization` includes `build:main`, `build:renderer`, `lint`, and additional checks.

**Stop gate:** If a circular import appears between new files, **merge the two smallest files** rather than adding `any` or lazy requires.

---

## Phase 6 (optional) — `possibleUnitActions` strategic ranged extraction

**Trigger:** Proceed only if `possibleUnitActions.ts` is **>600 lines** or this phase is explicitly prioritized.

**Deliverables**

- Move `collectRangedTargetHexes` and helpers used **only** by strategic ranged discovery into `possibleUnitActionsStrategicRanged.ts` (name illustrative).
- `buildPossibleUnitActionsMarkdown` import wiring only.

**Verification**

- `node dist/main/openrouter/possibleUnitActions.test.js` passes.
- Tactical path (`tacticalBattle` argument) unchanged.

---

## Phase 7 (optional) — Label distance helper vs pure distance

**Default in this plan:** **Document only** in `orderLabelFormatting.ts` why `gridDistance` + `gridDisk` fallback is used for **UI labels** (performance / no main logger), and that **order legality** uses main-process helpers.

**Only** if product owner wants parity: spike in a branch using `computeGridDistancePure` for labels; run UI smoke tests; accept or reject with screenshots.

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Junior agent “simplifies” range math | Never replace `isWithinGridRangeSafe` with raw `gridDistance <= n` in validation paths. |
| Splitting files breaks Electron `rootDir` | Keep new files under `src/main/...` patterns existing imports use. |
| Strategic vs tactical range mix-up | Phase 3 comments + Phase 2 naming (`Tactical` in symbol names). |

## Testing strategy (reliability-first; aligns with “happy path + essential failures”)

| Phase | Minimum | Stronger reliability (always / extra) |
|-------|-----------|----------------------------------------|
| 1 | `npm test` + grep gate | Run `invalidAirBase` + any air-order path tests already in `package.json` |
| 2 | `npm test` + `build:renderer` | **Required:** contract table test for `unitHasTacticalRangedBaseline` + `package.json` registration (see Phase 2) |
| 3 | `npm run build:main` + lint | N/A (comments only) |
| 4 | `npm test` | **Required:** new dedicated test module on extracted validator API only + `package.json` registration (see Phase 4—**not** conditional on “thin” coverage) |
| 5 | `npm test` + import grep + **`npm run verify:modularization`** | **Required:** barrel direct-import smoke + `package.json` registration (see Phase 5—**not** conditional); **`verify:modularization` is mandatory** after Phase 5 |
| 6–7 | Same as triggered phase | Same as triggered phase |

## Checklist (order matters)

1. Phase 1 wrappers + grep gate  
2. Phase 2 renderer helper  
3. Phase 3 docs  
4. Phase 4 `gameActions` extraction  
5. Phase 5 `humanMarchPreview` split  
6. Phase 6–7 only if triggers / explicit approval  

---

## Resolved decisions (product owner)

1. **Logging:** Follow house rules **where layering allows**. **Exception:** shared pure helpers **must not** import `main/logger`—document on the symbol (Phase 2). Phase **1** wrappers in `gridRange.ts` use **`logDebug` at entry** as already written.
2. **Tests:** Run **full `npm test` each phase**. Phases **2, 4, and 5** **must** add the targeted tests described in those phases (and `package.json` hooks)—**no opt-out** because integration tests already pass.
3. **`verify:modularization`:** **Mandatory** once **Phase 5** is complete and **`npm test`** for that phase passes. Do not skip: it runs `build:main`, `build:renderer`, `lint`, `check:circular`, and a focused subset of tests that catch bundling / import regressions.
4. **Partial landing:** No phases from this plan are assumed complete out-of-band unless the **Before you begin** table says otherwise (product owner confirmed none).

## Open questions (optional — implementer may choose)

1. **File layout preference:** For Phase 5, prefer a **`humanMarchPreview/` directory** with `index.ts` barrel **or** sibling `humanMarchPreview*.ts` files—pick whichever matches nearby `game-actions` style after a quick `rg` survey.

---

## Agent execution notes

- After each phase, run **`npm run build:main`** and **`npm run lint`** at minimum; run **`npm test`** before declaring Phase 4–5 complete.
- After **Phase 5** completes with **`npm test` green**, run **`npm run verify:modularization`** — **mandatory** (see **Resolved decisions** item 3). Earlier phases do **not** require it unless you extend this plan.
- **Never** commit or push unless the repository owner explicitly asks (house rule).
- If a verification gate fails, **revert the phase** to last green state before trying a different decomposition.
