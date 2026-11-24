# Mercenary Upkeep Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Keep mercenary armies and treasuries to a size the commanders and the prompt can carry. The version stays **3.6.0**, which is not released yet: these changes ship in 3.6.0, and its release notes gain a bullet. Two changes:

1. **The deep-treasury line sits above the raise reserve.** A treasury counts as "more than you need" only at 40 turns of upkeep, twice the 20 turns the mercenary raise flag keeps in reserve. Today both lines are 20 turns, so a treasury the raise flag has spent down sits on the deep line and keeps crossing it.
2. **Mercenary upkeep doubles.** `MERCENARY_UPKEEP_DIVISOR` goes from 8 to 4. Raise and rehire fees are set in turns of upkeep, so they double with it.

**Shape:**
- Phase 0 records a baseline.
- Phase 1 raises the deep-treasury line.
- Phase 2 doubles the upkeep.
- Phase 3 updates the docs and release notes, runs the final checks, and hands off.

Phases 1 and 2 are independent of each other. Each one is verified by its own tests.

**Tech:** TypeScript (Electron main, renderer, and shared modules), `better-sqlite3`, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`.

**Shell:** Windows PowerShell. Working directory `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`. Search with `Get-ChildItem -Recurse src -Include *.ts | Select-String -Pattern '<text>' -SimpleMatch`.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Targeted testing only.** Every phase ends with the Phase Check: static checks plus the tests that phase names. Never run `npm test`, `npm run ui:smoke`, or `npm run doc:shots`, and never run test files the phase does not name. The user runs the full test, review, and fix pass afterwards.
- **Stop only when a check fails** and you cannot fix it within the phase's rules. Then:
  1. revert that phase (see Backup and Revert);
  2. record the failure in the Defect Inventory;
  3. stop, and tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, `git mv`, `git rm`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Edits**. No phase adds a source file.
  - Do not edit other files, with two exceptions: removing an import that lint reports unused in a listed file, and fixing a test that fails only because of a change the phase names (Phase 2 says how).
  - Record every such file in the Completion Log.
- Find code by the quoted text or the symbol name, not by a line number.
- **Code blocks are sketches** unless marked **Exact**.
  - Write the real code from the file you just read. When a sketch and the file disagree, the file wins; record the difference in the Completion Log.
  - Text marked **Exact** is copied character for character, including punctuation and spacing.
  - In Exact text, `${name}` means the value of that variable or constant, interpolated in a template literal.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Set `$step` to the phase number and `$files` to that phase's **Edits** list.

```powershell
$step = '1'
$files = @('src/main/openRouter/treasuryForecast.ts', 'src/main/openRouter/treasuryForecast.test.ts', 'src/main/openRouter/mercenaryRaiseAttention.test.ts')
$backup = Join-Path $env:TEMP "aw-360-upkeep\step-$step"
foreach ($f in $files) {
  $dest = Join-Path $backup $f
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item $f $dest -Force
}
```

When a phase fixes a test file outside its list (Phase 2 allows this), copy that file into the same backup folder before you edit it, and add it to `$files`.

To revert a phase, copy the backups back:

```powershell
foreach ($f in $files) { Copy-Item (Join-Path $backup $f) $f -Force }
```

Phase 2 also rebuilds `static/renderer.js`. To revert Phase 2, restore its files, then run `npm run build:renderer` once more.

---

## Verification

### Native module

Tests that open a database load `better-sqlite3` under Node, and `npm install` builds it for Electron. Phase 0 runs `npm run rebuild:native:node`. Phase 3 runs `npm run rebuild:native:electron` last, so the app starts again.

- **Native module lock.** If a rebuild fails with `EBUSY` on `better_sqlite3.node`:
  1. close any running Electron app;
  2. rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`;
  3. run the rebuild again;
  4. delete the `.locked` file.

### Phase Check

Every phase from 1 to 3 ends with the Phase Check, run from the repo root:

```powershell
npm run build:main
npm run lint
npm run check:circular
```

- **Shared or renderer files.** When the phase edits a file under `src/shared` or `src/renderer`, also run `npm run check:renderer-types` and then `npm run build:renderer`. Phase 2 needs both.
- **Tests.** Then run every existing test file the phase lists under **Tests to run**, and no others. All must pass.
  - Run a test under `src/main` with `node dist/main/<path>.test.js`.
  - Run a test under `src/shared` with `node dist/shared/<path>.test.js`.
- `check:circular` must print **no** cycle.
- A static check or a named test that already failed in Phase 0 is not yours to fix. A **new** failure is.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a check pass.
- **No test may call a real model.** Do not start the app.
- Record each Phase Check result in the Completion Log.

---

## Evidence From the 3.6.0 Match (turns 70–87)

The match ran its first 70 turns under the old credits rules, then continued under the 3.6.0 credits changes.

| Side | Mercenaries, turn 70 → 87 | Built units | Treasury, turn 87 | Upkeep a turn | Credits income a turn |
| --- | --- | --- | --- | --- | --- |
| Eastern Asia | 36 → 151 | 51 | about 23,800 | about 700 | about 410 |
| North America | 26 → 88 | 47 | about 19,200 | about 420 | about 380 |

- **The prompt grows with the armies.** Eastern Asia's situation message is about 96 KB. About 45% of it is tables with a row per unit.
- **The overshoot comes from the old hoard.** A simulation of the current rules, played from a new match with steady income, settles at income divided by upkeep (about 80 mercenaries per side at 400 credits a turn). It shows no desertion, with the treasury near 20 turns of upkeep. The 24k treasuries in this match were built over 70 turns under the old rules.
- **Doubling upkeep halves the army.** The same simulation with doubled upkeep settles at about 40 mercenaries per side. The treasury still settles near 20 turns of upkeep, which is again about 8,000 credits.
- **A check that waits for 40 turns of forecast cover before raising does not help.** It reaches the same final count more slowly and holds about 50% more credits. This plan does not add it.
- **The deep line sits on the raise reserve.** At steady state the treasury sits just above 20 turns of upkeep, which is also today's deep line.
  - When it is above the line, the hoard bullet says to raise mercenaries while the raise flag is silent.
  - In the same turn, the forecast says the credits are more than needed and tells the commander to stop queuing credits. A commander that follows that advice cuts its income below its upkeep.

---

## Non-Goals

- **No change to the raise budget.** `planMercenaryRaises`, `MERCENARY_UPKEEP_RESERVE_TURNS` (20), and `MERCENARY_RAISE_ATTENTION_MAX_CELLS` (6) stay as they are.
- **No cap on mercenaries.** Mercenaries still do not count toward unit caps.
- **No change to fee rules.** A raise still costs one turn of upkeep and a rehire two (`MERCENARY_REHIRE_FEE_MULTIPLIER`). Only the upkeep they are counted in changes.
- **No change to raise capacity** (`MERCENARY_RAISE_CAPACITY_MULTIPLIER`), the Advanced multiplier (`MERCENARY_ADVANCED_TECH_MULTIPLIER`), desertion, credits pricing, or unit caps.
- **No change to the run-out bullet** (`TREASURY_RUN_OUT_WARNING_TURNS`), the hoard bullet's wording, or the size floor (`TREASURY_HOARD_FLOOR_PER_SIZE`).
- **No save migration.** Upkeep is computed each turn from a mercenary's type and birth-hex tech (`mercenaryUpkeepForUnit` in `src/main/gameDb/mercenaryEconomyRead.ts`). A match saved before this change pays the new upkeep as soon as it loads. 3.6.0 is not released, so no player save is affected. The user starts a new match to test.
- **Files not to edit:**

  | File | Lines | Why |
  | --- | --- | --- |
  | `src/main/openRouter/consultPromptParts.ts` | 602 | Over 600; prompt assembly does not change |
  | `src/main/openRouter/promptSpec/sectionHeadings.ts` | 615 | Over 600; nothing in it changes |
  | `src/main/openRouter/mercenaryRaiseAttention.ts` | 282 | The raise budget does not change; its test file gains one test |

- Do not edit anything under `.spec/completed/`, release notes of versions before 3.6.0, or the historical documents named in `AGENTS.md`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`.

- **Orienting comments.** Every changed declaration keeps its JSDoc block:
  - a one-line summary;
  - `Purpose:` (or `Contract:` for types and fields);
  - `When to use:`, `Expected outcome:`, and `Exceptions:`.

  Update every comment whose behavior this plan changes. Afterwards, no comment may still say:
  - that a deep treasury is 20 turns of upkeep;
  - that upkeep is the price divided by 8;
  - that infantry upkeep is 3, or list the old upkeep table.

  No generic filler.
- **Logging (rule 02).** No logging changes. The functions this plan touches already log.
- **No plan vocabulary** in code, comments, test names, or `doc/`.
- **Size limits (rule 09).**
  - Each edited source or test file must stay under 600 lines. Record every final line count in the Completion Log.
  - **A file already over 600 lines only shrinks.** No phase edits a source file over 600 lines.
  - **Tests over 600 lines.** Two test files Phase 2 runs are over 600 lines: `envelopeJsonSchema.test.ts` (669) and `gameRuleText.test.ts` (626). If a test in either fails because of this plan, do not edit it in place. Delete that one test from the big file, add its corrected version to a new sibling test file with the same test name and the imports it needs, and record the move in the Completion Log.
  - **Long docs.** Phase 3 edits three docs over 600 lines: `doc/combat-rules-v3.md` (776), `doc/how-to-play.md` (683), and `doc/ai-commander-prompts/example-strategic-prompt.md` (669). Each edit replaces text on the same line and adds no line.
- **Reuse (rule 06).**
  - `isTreasuryDeep` stays the only "more than you need" test.
  - `mercenaryUpkeepFor` stays the only upkeep formula. Never write an upkeep number into production code.
- **Tests (rule 03).** Test contracts, not private helpers. Copy the structure of the test next to the one you change.
- **Prompt structure.**
  - The system prompt changes in one place: the mercenary upkeep list, which `upkeepList` in `gameRuleMercenaryText.ts` builds from `mercenaryUpkeepFor`. It changes once with the constant and then stays static. No code in that function changes.
  - The situation message changes only in when the hoard bullet and the forecast's deep sentence appear, and in the upkeep and fee numbers it prints.
  - No heading, table, column, or attention bullet is added or removed.
- **Docs.** Phase 3 updates `doc/`, `README.md`, and the release notes. Do not edit them earlier.

---

## Locked Decisions

1. **Deep line.** `TREASURY_HOARD_UPKEEP_TURNS` becomes `40` (from 20), twice `MERCENARY_UPKEEP_RESERVE_TURNS` (20).
   - `isTreasuryDeep` is true when `credits >= max(TREASURY_HOARD_UPKEEP_TURNS × upkeepPerTurn, TREASURY_HOARD_FLOOR_PER_SIZE × GAME_SIZE_MULTIPLIER[size])`, as today. Only the constant changes.
   - Both the hoard bullet and the forecast's "more than you need" sentence follow it, because both already call `isTreasuryDeep`.
   - A test keeps the deep line at least twice the raise reserve.
2. **Upkeep.** `MERCENARY_UPKEEP_DIVISOR` becomes `4` (from 8). With the global prices (infantry 20, armor 40, naval 100, air 60) the upkeep table becomes:

   | Type | Basic, now → new | Advanced, now → new |
   | --- | --- | --- |
   | infantry | 3 → 5 | 5 → 10 |
   | armor | 5 → 10 | 10 → 20 |
   | naval | 13 → 25 | 25 → 50 |
   | air | 8 → 15 | 15 → 30 |

   A raise fee is one turn of that upkeep, and a rehire fee two, as today.
3. **Release.** The version stays 3.6.0. `doc/release-notes/v3.6.0.md` gains one bullet, and the 3.6.0 summaries in `README.md` and `doc/README.md` gain a clause. Nothing is committed.

---

## Phase 0 — Baseline

### Steps

1. `npm run rebuild:native:node`
2. Run `npm run build:main`, `npm run lint`, `npm run check:circular`, and `npm run check:renderer-types`. Record each result.
3. Run each test file named under **Tests to run** in Phases 1 and 2. Record any that fail now.
4. Confirm each anchor below appears exactly once:
   - `export const TREASURY_HOARD_UPKEEP_TURNS = 20;` — `src/main/openRouter/treasuryForecast.ts`
   - `export const MERCENARY_UPKEEP_RESERVE_TURNS = 20;` — `src/main/openRouter/mercenaryRaiseAttention.ts`
   - `export const MERCENARY_UPKEEP_DIVISOR = 8;` — `src/shared/mercenaryRules.ts`
   - `test('a deep treasury covers twenty turns of upkeep and the size floor'` — `src/main/openRouter/treasuryForecast.test.ts`
   - `infantry 3 (Advanced 5), armor 5 (10), naval 13 (25), air 8 (15)` — once in each of `src/main/openRouter/promptSpec/gameRuleMercenaryText.ts`, `gameRuleMercenaryText.test.ts`, `README.md`, `doc/combat-rules-v3.md`, `doc/ai-commander-prompts/strategic-prompt.md`, and `doc/ai-commander-prompts/example-strategic-prompt.md`
   - `Upkeep: ¤3 infantry, ¤5 armor, ¤8 air, ¤13 naval` and `infantry ¤5, armor ¤10, air ¤15, naval ¤25` — `doc/how-to-play.md`
   - `The divisor is 8.` — `doc/combat-rules-v3.md`
   - `` `TREASURY_HOARD_UPKEEP_TURNS` (20) `` — `doc/ai-commander-prompts/strategic-prompt.md` and `doc/ai-commander-prompts/information-decision-model.md`
   - `, and makes commanders spend banked credits on mercenaries.` — `README.md` and `doc/README.md`
5. Confirm that `MERCENARY_UPKEEP_DIVISOR` is used in exactly one place outside its declaration: `mercenaryUpkeepFor` in `src/shared/mercenaryRules.ts`.
6. Record the line count of every file this plan edits.

### Verification

Every result, anchor, and count is recorded in the Phase 0 Inventory. If an anchor is missing or appears more than once, stop and record it.

---

## Phase 1 — The Deep-Treasury Line Sits Above the Raise Reserve

**Edits:**
- `src/main/openRouter/treasuryForecast.ts`
- `src/main/openRouter/treasuryForecast.test.ts`
- `src/main/openRouter/mercenaryRaiseAttention.test.ts`

### Steps

1. Set `TREASURY_HOARD_UPKEEP_TURNS = 40`. Rewrite its comment:
   - Purpose: a treasury the raise flag has spent down to its 20-turn reserve is never called more than needed. The gap keeps the hoard bullet and the forecast's deep sentence from switching on and off at steady state.
   - Expected outcome: forty, twice `MERCENARY_UPKEEP_RESERVE_TURNS` in `mercenaryRaiseAttention.ts`. Read by `isTreasuryDeep`.
   - Do not import from `mercenaryRaiseAttention.ts`. That module already depends on this one through `briefingSectionsMercenaries.ts`, so an import would make a cycle. Name the other constant in the comment only.
2. In the `isTreasuryDeep` comment, change "20 turns of upkeep" to "`TREASURY_HOARD_UPKEEP_TURNS` (40) turns of upkeep".
3. In the `treasuryAttention` comment, change "a deep treasury covers at least 20 turns of upkeep" to "a deep treasury covers at least 40 turns of upkeep".
4. Change nothing else in `treasuryForecast.ts`.

### Tests

**`treasuryForecast.test.ts`:**
- Rename `a deep treasury covers twenty turns of upkeep and the size floor` to **Exact** `a deep treasury covers forty turns of upkeep and the size floor`.
  - Upkeep-bound: `deep(1600, 40)` is true and `deep(1599, 40)` is false. Update the comment to `40 x 40 = 1600`.
  - Size-bound: keep `deep(500, 10)` true and `deep(499, 10)` false. Update the comment to `40 x 10 = 400 is below the floor of 500`.
  - Keep the upkeep-0 and medium-size assertions as they are.
- In `the hoard bullet needs a deep treasury, and its wording follows the caps`:
  - every `600` credits with upkeep `30` becomes `1200`;
  - `599` becomes `1199`;
  - `20 turns of mercenary upkeep` in both expected texts becomes `40 turns of mercenary upkeep`;
  - keep the upkeep-0 and medium assertions as they are.
- `treasuryAttention never returns both bullets` does not change, and must still pass.

**`mercenaryRaiseAttention.test.ts`:** add one test, **Exact** name `the deep-treasury line sits above the raise reserve`. Import `TREASURY_HOARD_UPKEEP_TURNS` and `isTreasuryDeep` from `./treasuryForecast`. It asserts:
- `TREASURY_HOARD_UPKEEP_TURNS >= 2 * MERCENARY_UPKEEP_RESERVE_TURNS`;
- with upkeep 100 on a small game, credits of `MERCENARY_UPKEEP_RESERVE_TURNS * 100` are not deep;
- credits of `TREASURY_HOARD_UPKEEP_TURNS * 100` are deep.

Build the forecast as a plain object: `{ credits, upkeepPerTurn: 100, queuedCredits: 0, coverTurns: null }`. Give the test an orienting comment that says why the gap matters.

### Tests to run

`treasuryForecast.test`, `mercenaryRaiseAttention.test`, `briefingSectionsMercenaries.test`, `promptOutline.test`.

### Verification

The Phase Check. `check:circular` prints no cycle.

---

## Phase 2 — Mercenary Upkeep Doubles

**Edits:**
- `src/shared/mercenaryRules.ts`, `src/shared/mercenaryRules.test.ts`
- `src/main/openRouter/promptSpec/gameRuleMercenaryText.ts` (one comment), `src/main/openRouter/promptSpec/gameRuleMercenaryText.test.ts`
- `static/renderer.js`, rebuilt by `npm run build:renderer`, never edited by hand

### Steps

1. In `src/shared/mercenaryRules.ts`:
   - Set `MERCENARY_UPKEEP_DIVISOR = 4`. Replace its one-line comment with **Exact**: `/** Divisor that turns a global unit price into one turn of upkeep, before rounding up. Four makes upkeep a quarter of the price. */`
   - In the `mercenaryUpkeepFor` comment, change "divided by 8, rounded up" to "divided by `MERCENARY_UPKEEP_DIVISOR` (4), rounded up".
   - In the comment that reads `` `Infantry (⚒20 + ¤3/turn)` when the fee equals upkeep``, change `¤3` to `¤5`.
   - Change no code other than the constant.
2. In `src/main/openRouter/promptSpec/gameRuleMercenaryText.ts`, change the `upkeepList` comment's Expected outcome to **Exact** `` `infantry 5 (Advanced 10), armor 10 (20), naval 25 (50), air 15 (30)` on every map.`` Change no code.
3. Run the Phase Check with `check:renderer-types` and `build:renderer`.

### Tests

**`mercenaryRules.test.ts`,** in `mercenary upkeep uses the global prices on every map` (the name stays). `expectUpkeep` asserts every type at both tech levels:
- infantry 5 and 10;
- armor 10 and 20;
- naval 25 and 50;
- air 15 and 30.

The regional-map half of the test stays. It still proves a regional price does not change upkeep.

**`gameRuleMercenaryText.test.ts`:** in `the mercenary rule lists basic and Advanced upkeep`, the expected list becomes **Exact** `infantry 5 (Advanced 10), armor 10 (20), naval 25 (50), air 15 (30)`.

**Other tests that fail.** A test that fails only because it writes an old upkeep or fee number (3, 5, 8, 13, 15, 25, or a fee built from them) where the code now computes the new one:
- if the test computes the number with `mercenaryUpkeepFor`, `mercenaryHireFee`, or a hire option, it should not fail; if it does, stop and record it;
- otherwise change the expected number to the new one from Locked Decision 2, and record the file in the Completion Log;
- a test that passes plain fixture numbers into a formatter (for example `formatHireOptionLabel({ unitType: 'infantry', unitCost: 20, fee: 3, upkeep: 3 })`) is about formatting, not the rule: leave it alone;
- never change production code to match an old number.

### Tests to run

Shared:
- `mercenaryRules.test`, `economySymbols.test`, `hireEntryHexes.test`, `matchChartSeries.test`, `mercenaryDismiss.test`, `selectionPanelSummary.test`, `topBarStats.test`, `unitOriginTooltipText.test`

Main:
- `creditsProductionFlow.test`, `mercenaryPayroll.test`, `mercenarySchema.test`, `mercenaryTurnFlow.test`, `productionBuildabilityFlow.test`, `productionOrders.test`
- `gameActions/dismissMercenary.test`, `gameActions/unitOwnershipTransfer.test`, `gameDb/seatUnitOwnership.test`
- `matchStatistics/sideStatisticsRead.test`, `matchStatistics/statisticsHistory.test`, `tools/mercenaryTools.test`
- `openRouter/briefingSections.test`, `openRouter/briefingSectionsMercenaries.test`, `openRouter/briefingSectionsMercenaryFiring.test`, `openRouter/mercenaryRaiseAttention.test`, `openRouter/treasuryForecast.test`
- `openRouter/productionPriorities.test`, `openRouter/productionPrioritiesCredits.test`
- `openRouter/promptSpec/gameRuleMercenaryText.test`, `openRouter/promptSpec/gameRuleText.test`, `openRouter/promptSpec/envelopeJsonSchema.test`
- `openRouter/consultPromptParts.test`, `openRouter/systemPromptStability.test`

### Verification

The Phase Check, including `check:renderer-types` and `build:renderer`. Also confirm:
- `MERCENARY_UPKEEP_DIVISOR` is still used only in `mercenaryUpkeepFor`;
- no production file under `src` contains the text `infantry 3 (Advanced 5)`.

---

## Phase 3 — Docs, Release Notes, Final Checks, and Hand-Off

**Edits:**
- `doc/combat-rules-v3.md`, `doc/how-to-play.md`
- `doc/ai-commander-prompts/strategic-prompt.md`, `information-decision-model.md`, `example-strategic-prompt.md`
- `README.md`, `doc/README.md`
- `doc/release-notes/v3.6.0.md`

### Steps

Every edit below replaces text on the line where it already is. Add no line except the release-notes bullet.

1. **The upkeep list.** Replace `infantry 3 (Advanced 5), armor 5 (10), naval 13 (25), air 8 (15)` with **Exact** `infantry 5 (Advanced 10), armor 10 (20), naval 25 (50), air 15 (30)` in:
   - `doc/combat-rules-v3.md`;
   - `README.md`;
   - `doc/ai-commander-prompts/strategic-prompt.md`;
   - `doc/ai-commander-prompts/example-strategic-prompt.md`.
2. **`doc/combat-rules-v3.md`:** replace `The divisor is 8.` with **Exact** `The divisor is 4.`
3. **`doc/how-to-play.md`:**
   - replace `Upkeep: ¤3 infantry, ¤5 armor, ¤8 air, ¤13 naval` with **Exact** `Upkeep: ¤5 infantry, ¤10 armor, ¤15 air, ¤25 naval`. That table cell grows by 3 characters, so remove 3 spaces of the cell's trailing padding to keep the column's `|` aligned;
   - replace `infantry ¤5, armor ¤10, air ¤15, naval ¤25` with **Exact** `infantry ¤10, armor ¤20, air ¤30, naval ¤50`.
4. **The deep line.** In `doc/ai-commander-prompts/strategic-prompt.md` and `information-decision-model.md`, replace `` `TREASURY_HOARD_UPKEEP_TURNS` (20) `` with **Exact** `` `TREASURY_HOARD_UPKEEP_TURNS` (40, twice `MERCENARY_UPKEEP_RESERVE_TURNS`) ``.
5. **`doc/release-notes/v3.6.0.md`:** under `## What's in 3.6.0`, after the bullet that begins `- **Treasury advice that knows when to stop.**`, add **Exact**:

   `- **Dearer mercenaries.** Mercenary upkeep is doubled: infantry 5 (Advanced 10), armor 10 (20), naval 25 (50), air 15 (30) credits a turn, and raise and rehire fees double with it, so the same income keeps about half as many mercenaries. A treasury now counts as more than needed only at 40 turns of upkeep, twice what the mercenary flag keeps in reserve.`
6. **`README.md` and `doc/README.md`:** in the 3.6.0 summary, replace `, and makes commanders spend banked credits on mercenaries.` with **Exact** `, and makes commanders spend banked credits on mercenaries, whose upkeep doubles.` Do not change the version anywhere.
7. Search `doc/` (outside `release-notes/` before 3.6.0 and the historical documents named in `AGENTS.md`), `README.md`, and `src/` for `Advanced 5)`, `¤13 naval`, and `divisor is 8`. Each must now return nothing. Record the result.
8. Run `node scripts/check-doc-links.cjs`.
9. Run the Phase Check plus `npm run check:renderer-types`, then `npm run rebuild:native:electron` last.
10. Fill in the Completion Log, and give the user the checklist below.

### Manual checklist for the user

Part of your final pass:

1. **Start a new match.** A 3.6.0 match saved before this change pays the new upkeep as soon as it loads, so the current test match would run short of credits and lose mercenaries to desertion.
2. **Numbers.** The hire panel shows `¤5/turn` for basic infantry. The system prompt's mercenary rule lists `infantry 5 (Advanced 10), armor 10 (20), naval 25 (50), air 15 (30)`.
3. **Steady state.** After about 30 turns, each side's mercenary count is near its credits income divided by its average upkeep. The Treasury line's turns of upkeep stay in the 20s and 30s.
4. **No flicker.** While a side's treasury sits between 20 and 40 turns of upkeep, neither the hoard bullet nor the "more than you need" sentence appears.
5. Run `npm run ui:smoke`, and `npm run doc:shots` if a screenshot shows mercenary costs.

### Verification

The Phase Check passes, `check-doc-links` passes, the searches in step 7 return nothing, and the Completion Log is complete.

---

## Reliability Checklist

- [ ] `TREASURY_HOARD_UPKEEP_TURNS` is 40, and a test holds it at least twice `MERCENARY_UPKEEP_RESERVE_TURNS`.
- [ ] `treasuryForecast.ts` does not import from `mercenaryRaiseAttention.ts`, and `check:circular` prints no cycle.
- [ ] `MERCENARY_UPKEEP_DIVISOR` is 4 and is read only by `mercenaryUpkeepFor`. No upkeep number is written into production code.
- [ ] `mercenaryRules.test` checks all four types at both tech levels.
- [ ] The raise planner, its reserve, the run-out bullet, and the hoard bullet's wording are unchanged.
- [ ] The system prompt's only change is the upkeep list, built from constants (`systemPromptStability.test` passes).
- [ ] No test file over 600 lines was edited in place, and no source file over 600 lines was edited.
- [ ] Every Exact text matches character for character. No plan vocabulary in code, tests, or `doc/`. The version is still 3.6.0.

## Success Definition

- A treasury the raise flag has spent down to its reserve is never called more than needed.
- Every mercenary costs twice the upkeep, and fees follow.
- Code, tests, the system prompt, and the docs show the same upkeep table.
- The named tests and static checks pass, and the 3.6.0 notes describe the change.

## Phase 0 Inventory

| Item | Value |
| --- | --- |
| Static check results | |
| Pre-existing failures in named tests | |
| Anchors confirmed | |
| Line counts | |

## Defect Inventory

| Phase | Defect | Fix or reason for stopping |
| --- | --- | --- |

## Completion Log

| Phase | Result | Files changed beyond the lists | Sketch differences | Notes |
| --- | --- | --- | --- | --- |
