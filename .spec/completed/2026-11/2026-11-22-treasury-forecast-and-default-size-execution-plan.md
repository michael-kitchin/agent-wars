# Treasury Forecast, Credits Advice, and Default Game Size Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** AI commanders see how long their treasury lasts, get warned before mercenaries desert and when credits sit idle, and stop being told to queue credits in cities that can still build units. The new-game dialog's Medium size becomes Default and is selected first. These changes ship as release 3.4.2:

1. **Treasury forecast.** A new paragraph after the Mercenaries section's treasury line says how many turns the treasury and the credits queues cover mercenary upkeep. The shortfall warning gets its own paragraph and clearer wording.
2. **Run-out flag.** Attention Flags warn when upkeep will run out within 5 turns.
3. **Hoard flag.** Attention Flags say to raise mercenaries or build units when the treasury holds many turns of upkeep while the side's units are far below their caps.
4. **Credits priority only in capped cities.** Production Priorities names a credits city only when every unit type that city can build is at its cap. The prompt rule "Keep one city queued on credits at all times." is softened.
5. **Default game size.** In the new-game dialog, the Medium entry is labeled Default, keeps its place between Small and Large, and is selected when the app starts.

**Shape:**
- Phase 0 records a baseline.
- Phase 1 adds one pure module, `treasuryForecast.ts`, with its tests.
- Phase 2 puts the forecast in the Mercenaries section.
- Phase 3 adds the two attention flags.
- Phase 4 changes the credits priority and the prompt rule.
- Phase 5 changes the new-game dialog.
- Phase 6 updates the docs, sets version 3.4.2, runs the final checks, and hands off.

**Tech:** TypeScript (Electron main, renderer, shared modules), `better-sqlite3`, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`.

**Shell:** Windows PowerShell. Working directory `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Targeted testing only.** Every phase ends with the Phase Check: static checks plus the tests that phase names. Never run `npm test`, `npm run ui:smoke`, or `npm run doc:shots`, and never run test files the phase does not name. The user runs the full test, review, and fix pass afterwards.
- **Stop only when a check fails** and you cannot fix it within the phase's file lists. Then:
  1. revert that phase (see Backup and Revert);
  2. record the failure in the Defect Inventory;
  3. stop, and tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**.
  - Do not edit other files, with two exceptions: removing an import that lint reports unused in a listed file, and fixing a test that fails only because of a change the phase names.
  - Record every such file in the Completion Log.
- Find code by the quoted text, not by a line number.
- **Code blocks are sketches** unless marked **Exact**.
  - Write the real code from the file you just read. When a sketch and the file disagree, the file wins; record the difference in the Completion Log.
  - Text marked **Exact** is copied character for character, including punctuation and spacing.
  - In Exact text, `${name}` means the value of that variable or constant, interpolated in a template literal.
- **Tests come first.** Write a new function's test with the function, and run it before any existing code calls it.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Set `$step` to the phase number and `$files` to that phase's **Edits** list.

```powershell
$step = '2'
$files = @('src/main/openRouter/briefingSectionsMercenaries.ts', 'src/main/openRouter/briefingSectionsMercenaries.test.ts')
$backup = Join-Path $env:TEMP "aw-treasury\step-$step"
foreach ($f in $files) {
  $dest = Join-Path $backup $f
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item $f $dest -Force
}
```

To revert a phase, copy the backups back, then delete every file the phase **adds**:

```powershell
foreach ($f in $files) { Copy-Item (Join-Path $backup $f) $f -Force }
```

---

## Verification

### Native module

Tests that open a database load `better-sqlite3` under Node, and `npm install` builds it for Electron. Phase 0 runs `npm run rebuild:native:node`. Phase 6 runs `npm run rebuild:native:electron` last, so the app starts again.

- **Native module lock.** If a rebuild fails with `EBUSY` on `better_sqlite3.node`:
  1. close any running Electron app;
  2. rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`;
  3. run the rebuild again;
  4. delete the `.locked` file.

### Phase Check

Every phase from 1 to 6 ends with the Phase Check, run from the repo root:

```powershell
npm run build:main
npm run lint
npm run check:circular
```

- Add `npm run check:renderer-types` and `npm run build:renderer` in Phase 5, which edits renderer and static files. Run both again in Phase 6.
- Then run every test file the phase adds and every existing test file it lists under **Tests to run**, with `node dist/main/<path>.test.js`, and no others. All must pass.
- `check:circular` must print **no** cycle.
- A static check or a named test that already failed in Phase 0 is not yours to fix. A **new** failure is.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a check pass.
- **No test may call a real model.** Do not start the app.
- Record each Phase Check result in the Completion Log.

---

## Non-Goals

- **Economy rules stay as they are.** No change to:
  - credits pricing (`creditsItemCost`, `CREDITS_PER_ITEM`);
  - mercenary upkeep or hire fees;
  - payroll and desertion (`settleMercenaryPayroll`);
  - unit caps or `GAME_SIZE_MULTIPLIER`.
- No mercenary dismiss tool for the AI.
- No change to `formatMercenaryRaiseAttention` itself. Phase 3 only decides whether its bullet is shown.
- **The forecast is an estimate.** It ignores:
  - the upkeep of hire orders that have not filled yet;
  - Keep building on a queue with no entries;
  - a credits entry running out of count.
  The text says "about", and the docs say what it counts.
- **No change to `parseGameSize`.** Its fallback for a missing or unknown size stays `'small'`, so old saves, tests, and IPC payloads behave as before. The stored value of the renamed size stays `medium`. Only the dialog's label and its initial selection change.
- **No game size reset.** Reopening the new-game dialog does not reset Game size. It keeps the last choice while the app is open, as today.
- **Files not to edit:**
  - `src/main/openRouter/consultPromptParts.ts` (602 lines; this plan needs no change there);
  - `src/main/openRouter/requestOrdersFlow.ts`;
  - `src/shared/gameSize.ts`.
- Do not edit anything under `.spec/completed/`, release notes of earlier versions, or the historical documents named in `AGENTS.md`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`.

- **Orienting comments.** Every new or changed declaration, and every field of an interface or parameter-object type, has a JSDoc block:
  - a one-line summary;
  - `Purpose:` (or `Contract:` for types and fields);
  - `When to use:`, `Expected outcome:`, and `Exceptions:`.

  Update every comment whose behavior this plan changes. Afterwards, no comment may still say:
  - that the funds warning compares credits with upkeep alone;
  - that the credits priority takes any city above the size floor;
  - that Small is the dialog's starting size.

  No generic filler.
- **Logging (rule 02).** Only `src/main` logs.
  - `treasuryAttention` logs `logDebug` on entry.
  - The pure helpers log `logTrace`.
  - Log seat ids, credits, upkeep, income, turn counts, and which bullets were produced. Nothing else.
- **Names.** Use the file and symbol names this plan gives. camelCase functions, PascalCase types, UPPER_SNAKE constants.
- **No plan vocabulary** in code, comments, test names, or `doc/`.
- **Seat ids:** no literals in production code.
- **Size limits (rule 09).** Files should stay under 600 lines and must stay under 1000.
  - `treasuryForecast.ts` must stay under 300 lines.
  - `briefingSectionsMercenaries.ts` (410), `requestOrdersInjection.ts` (400), and `productionPriorities.ts` (313) may each grow by at most 40 lines.
  - `productionPriorities.test.ts` (552) may grow to at most 640. If it would pass 600, put the new credits cases in a new `productionPrioritiesCredits.test.ts` and record that.
- **Mutability (rule 13)**, **arguments (rule 10):** at most 2 parameters, or one parameter object with a commented type.
- **Tests (rule 03).** Test contracts, not private helpers or call order. Copy the structure of the sibling test file named in each phase.
- **Reuse (rule 06).**
  - One function, `buildTreasuryForecast`, computes the forecast. The Mercenaries section and the attention flags both call it.
  - The credits priority decides "at cap" with the existing `getMaxedUnitTypesForPlayer`.
- **Import direction.** `treasuryForecast.ts` imports only from `src/shared`, `../logger`, and `../productionCaps`. It must not import `briefingSectionsMercenaries.ts`, `requestOrdersInjection.ts`, or `productionPriorities.ts`.
- **Docs.** Phase 6 updates `doc/`, `README.md`, and the release notes. Do not edit them earlier.

---

## Evidence From the 3.4.1 Matches

- **Medium match, turn 116** (`res_s_treasury`, `res_s_build_queue`, and `units` in the saved match database):
  - **The hoarding seat** holds 27,350 credits. It pays upkeep on 17 infantry mercenaries, about 51 credits a turn, so the treasury covers about 500 turns.
    - It fields 18 infantry, armor, naval, and air units against a combined Medium cap of 68.
    - 54 of its cities have credits next, 502 urban cells in all, so it earns about 502 credits a turn.
  - **The other seat** holds 3,142 credits, with 21 mercenaries and 43 built units. 125 of its cities have credits next, 1,513 urban cells in all.
  - Under this plan:
    - the first seat gets the hoard flag: 27,350 ≥ max(20 × 51, 500 × 2), and 18 < 34;
    - the second seat does not: 43 ≥ 34.
- **Desertion, turn 80 of the earlier 3.4.1 match.** A seat lost a large group of mercenaries in Northern Africa to payroll desertion.
  - Its briefing showed the treasury and the upkeep, but no runway.
  - `MERCENARY_FUNDS_WARNING` appears only once credits are already below one turn of upkeep. That is the turn the desertion happens.
- **The prompt pushes credits everywhere.** `PRODUCTION_BULLET` says "Keep one city queued on credits at all times." Production Priorities names a credits city above the size floor even when that city could still build units the side is short of.

---

## Locked Decisions

1. **Credits income estimate.** A seat's income is the sum of `urbanHexCount` over its cities that pass all of these:
   - `state.strategicControl` names the seat as controller;
   - in `state.strategicBuildQueueTotals`, the row's `nextUnitType === CREDITS_QUEUE_ITEM`;
   - the row is not `buildPaused === true`;
   - the city is not in `listOccupationPausedHexes(state, seatId)`;
   - the city is not a neutral border (`isNeutralBorderHex`).

   Income per turn = `Math.floor(points * CREDITS_PER_ITEM / creditsItemCost())`. On the global map that is 1 credit per urban cell.
2. **Cover turns.** With `drain = upkeepPerTurn - incomePerTurn`:
   - `coverTurns` is `null` when `drain <= 0`, meaning upkeep is covered;
   - otherwise it is `Math.floor(Math.max(0, credits) / drain)`, the number of payrolls covered, starting with this turn's. Credits produced in a turn arrive before that turn's upkeep is paid.
3. **Forecast placement and the warning.**
   - The forecast is its own paragraph: the funds line, a blank line, then the forecast sentence. There is no forecast paragraph when `upkeepPerTurn` is 0.
   - `MERCENARY_FUNDS_WARNING` shows exactly when `coverTurns === 0`, i.e. `credits + income < upkeep`. With no income this is the old condition.
   - The warning is its own paragraph after the forecast, and its text becomes the Exact text W1 below. The old text said that income might still pay, but the condition now counts income already.
   - The funds line itself (`formatMercenaryFundsLine`) and the rest of the section are unchanged.
4. **Run-out flag.** It is shown when production is on, `coverTurns !== null`, and `coverTurns <= TREASURY_RUN_OUT_WARNING_TURNS` (5). While it is shown, the mercenary raise bullet is left out, so Attention Flags never say "raise more" and "raise no more" together.
5. **Hoard flag.** It is shown when production is on and both of these hold:
   - `credits >= Math.max(TREASURY_HOARD_UPKEEP_TURNS * upkeepPerTurn, TREASURY_HOARD_FLOOR_PER_SIZE * GAME_SIZE_MULTIPLIER[size])`, which is 20 turns, and 500, 1,000, or 1,500 credits;
   - `built < capTotal * TREASURY_HOARD_BUILT_CAP_SHARE` (0.5), where `built` and `capTotal` sum infantry, armor, naval, and air. `built` comes from `getPlayerUnitCountsByType`, which leaves mercenaries out.

   With upkeep above 0, a run-out flag needs credits below 6 turns of upkeep, so the two flags never appear together. The raise bullet is kept beside the hoard flag, because it names a hex.
6. **Credits priority.** Two things change. Everything else stays: the economy check, the "no city has credits next" check, the size floor with the posture's `creditsCityUrbanFactor`, the treasury ceiling, and the smallest-city choice.
   - A city qualifies only when every unit type in its `availableUnitTypes` (`isBuildUnitType`, missile included) is in `getMaxedUnitTypesForPlayer(state.units, ownSeat, size)`. A city that lists no unit type qualifies.
   - The line gains a reason (Exact text below).
7. **Prompt rule.** The sentence "Keep one city queued on credits at all times." is replaced by the Exact text P1 below. Nothing else in `PRODUCTION_BULLET` changes.
8. **Game size.** In `static/index.html`:
   - the size options read Small, Default, Large, in that order;
   - their values stay `small`, `medium`, `large`;
   - `selected` moves from `small` to `medium`.

   The tooltip names Default. `parseGameSize` and every stored value are unchanged.
9. **Release.** 3.4.2, with its own release notes. Nothing is committed.

---

## Design

### Module `src/main/openRouter/treasuryForecast.ts`

Constants (exported, each with an orienting comment):

```ts
export const TREASURY_RUN_OUT_WARNING_TURNS = 5;
export const TREASURY_HOARD_UPKEEP_TURNS = 20;
export const TREASURY_HOARD_FLOOR_PER_SIZE = 500;
export const TREASURY_HOARD_BUILT_CAP_SHARE = 0.5;
export const TREASURY_HOARD_UNIT_TYPES: readonly BuildUnitType[] = ['infantry', 'armor', 'naval', 'air'];
```

Type and functions (sketch):

```ts
export interface TreasuryForecast {
  readonly credits: number;        // economy.credits, after hire fees already taken
  readonly upkeepPerTurn: number;  // economy.upkeepPerTurn
  readonly incomePerTurn: number;  // estimateCreditsIncomePerTurn
  readonly coverTurns: number | null; // Locked Decision 2
}

export function treasuryCoverTurns(args: { readonly credits: number; readonly upkeepPerTurn: number; readonly incomePerTurn: number }): number | null;
export function estimateCreditsIncomePerTurn(state: GameStateSnapshot, seatId: string): number;
/** Null when `state.mercenaryEconomy` is missing. */
export function buildTreasuryForecast(state: GameStateSnapshot, seatId: string): TreasuryForecast | null;
/** '' when upkeep is 0. */
export function formatTreasuryForecastSentence(forecast: TreasuryForecast): string;
export function formatTreasuryRunOutAttention(forecast: TreasuryForecast | null): string | null;
export function formatTreasuryHoardAttention(args: { readonly state: GameStateSnapshot; readonly ownSeat: string; readonly forecast: TreasuryForecast | null }): string | null;
/** Builds the forecast once and returns both bullets. Logs logDebug. */
export function treasuryAttention(state: GameStateSnapshot, seatId: string): { readonly runOut: string | null; readonly hoard: string | null };
```

**Imports:**

| Symbol | From |
| --- | --- |
| `CREDITS_QUEUE_ITEM`, `CREDITS_PER_ITEM` | `../../shared/creditsRules` |
| `creditsItemCost` | `../../shared/gameRules` |
| `GAME_SIZE_MULTIPLIER`, `getMaxUnitsPerType`, `parseGameSize` | `../../shared/gameSize` |
| `isNeutralBorderHex` | `../../shared/h3Resolutions` |
| `listOccupationPausedHexes` | `../../shared/productionBuildability` |
| `GameStateSnapshot` | `../../shared/ipc/gameStateTypes` |
| `BuildUnitType` | `../../shared/ipc/productionTypes` |
| `getPlayerUnitCountsByType` | `../productionCaps` |
| `logDebug`, `logTrace` | `../logger` |

**Income sketch:**

```ts
const controlled = new Set((state.strategicControl ?? []).filter((row) => row.controllerPlayerId === seatId).map((row) => row.h3Index));
const paused = listOccupationPausedHexes(state, seatId);
const urbanByHex = new Map((state.strategicInfrastructure ?? []).map((row) => [row.h3Index, row.urbanHexCount]));
let points = 0;
for (const row of state.strategicBuildQueueTotals ?? []) {
  if (!controlled.has(row.h3Index) || row.nextUnitType !== CREDITS_QUEUE_ITEM) continue;
  if (row.buildPaused === true || paused.has(row.h3Index) || isNeutralBorderHex(row.h3Index)) continue;
  points += Math.max(0, Math.trunc(urbanByHex.get(row.h3Index) ?? 0));
}
return Math.floor((points * CREDITS_PER_ITEM) / creditsItemCost());
```

**Hoard sketch.**
- `size = parseGameSize(state.gameSize)`, `counts = getPlayerUnitCountsByType(state.units, ownSeat)`, `caps = getMaxUnitsPerType(size)`.
- `built` and `capTotal` are the sums of `counts[type]` and `caps[type]` over `TREASURY_HOARD_UNIT_TYPES`.
- Return null when the forecast is null or either condition of Locked Decision 5 fails.

### Forecast sentence — Exact

Let `turns` be `'1 more turn'` when `n === 1`, and otherwise `` `${n} more turns` ``, with `n = forecast.coverTurns`. Let `lead` be:
- `` `At about ${incomePerTurn} credits a turn from your credits queues, ` `` when `incomePerTurn > 0`;
- `'With no city producing credits, '` otherwise.

| Case | Sentence |
| --- | --- |
| `upkeepPerTurn === 0` | `''` (empty; no sentence) |
| `coverTurns === null` | `` `${lead}upkeep is covered.` `` |
| `coverTurns >= 1` | `` `${lead}the treasury covers upkeep for ${turns}.` `` |
| `coverTurns === 0` | `` `${lead}the treasury cannot cover this turn's upkeep.` `` |

`coverTurns === null` with `upkeepPerTurn > 0` implies `incomePerTurn > 0`, so the covered sentence always starts "At about".

### Shortfall warning W1 — Exact

In `src/main/openRouter/promptSpec/gameRuleMercenaryText.ts`:
- replace the value of `MERCENARY_FUNDS_WARNING` with `Warning: unless more credits come in this turn, random mercenaries desert to Neutral at the end of it.`;
- add `MERCENARY_FUNDS_WARNING_ACTION`, with an orienting comment, whose value is `Queue credits in more cities, and do not raise or rehire mercenaries this turn.`.

W1 is the warning paragraph:
- with production on: `` `${MERCENARY_FUNDS_WARNING} ${MERCENARY_FUNDS_WARNING_ACTION}` ``;
- with production off: `MERCENARY_FUNDS_WARNING` alone, because that seat cannot queue or hire.

The warning does not mention removing hire orders, for two reasons:
- a commander's reply has no envelope row that removes one;
- at briefing time `pendingHireFees` is almost always 0, because orders fill or are refunded at the end of the turn they were placed.

### Mercenaries section layout — Exact

The section's opening, before `### Your Mercenaries`, is these blocks joined by one blank line (`'\n\n'`), each block omitted when it does not apply:

1. the funds line, `formatMercenaryFundsLine(economy)`, unchanged;
2. the forecast sentence, when it is not `''`;
3. W1, when `coverTurns === 0`.

For example, with a shortfall:

```text
## Mercenaries

Treasury: 4 credits. Mercenary upkeep: 15 credits per turn for 5 mercenaries. Hire orders already taken from the treasury this turn: 0 credits.

At about 10 credits a turn from your credits queues, the treasury cannot cover this turn's upkeep.

Warning: unless more credits come in this turn, random mercenaries desert to Neutral at the end of it. Queue credits in more cities, and do not raise or rehire mercenaries this turn.

### Your Mercenaries
```

The heading level shown (`##`) is what the precomputed briefing prints after `formatBriefing` shifts headings. No heading is added or renamed.

### Run-out bullet — Exact

`turns` is as above.

- `coverTurns >= 1`: `` `Treasury: your ${credits} credits and about ${incomePerTurn} credits a turn from credits queues pay your ${upkeepPerTurn} credits of mercenary upkeep for only ${turns}. Queue credits in more cities or raise no more mercenaries, or random mercenaries desert to Neutral.` ``
- `coverTurns === 0`: `` `Treasury: your ${credits} credits and about ${incomePerTurn} credits a turn from credits queues cannot pay this turn's ${upkeepPerTurn} credits of mercenary upkeep. Queue credits in more cities or raise no more mercenaries, or random mercenaries desert to Neutral.` ``

### Hoard bullet — Exact

- `upkeepPerTurn > 0`, with `k = Math.floor(credits / upkeepPerTurn)`: `` `Treasury: ${credits} credits, ${k} turns of mercenary upkeep, while you field ${built} infantry, armor, naval, and air units against a combined cap of ${capTotal}. Raise mercenaries where Raise Options under Mercenaries lists a cell, and queue units instead of credits where a city can still build them.` ``
- `upkeepPerTurn === 0`: `` `Treasury: ${credits} credits and no mercenary upkeep, while you field ${built} infantry, armor, naval, and air units against a combined cap of ${capTotal}. Raise mercenaries where Raise Options under Mercenaries lists a cell, and queue units instead of credits where a city can still build them.` ``

`k` is at least 20 whenever the bullet appears, so "turns" is always plural. The text says "where Raise Options … lists a cell" because that table can be empty. It names the table and its section the way the existing pointer `Paused queues: see Paused Queues under Production Status.` does.

### Prompt structure rules

All new prompt text follows the briefing's existing structure:

- **Attention Flags.** Each new bullet is one list item on one line, with no line break inside it.
  - It starts with a one-word label and a colon (`Treasury:`), like `Missiles:`, `Mercenaries:`, and `Campaign:`.
  - It names any other section by its exact title, as in "Raise Options under Mercenaries".
- **Production Priorities.** The credits line stays one `- Credits:` list item.
- **Rules (P1).** The softened sentence stays its own paragraph inside `PRODUCTION_BULLET` (the existing `'\n\n  '` prefix is kept). It refers to "the Mercenaries section", the exact title of that section.
- **Headings.** No heading is added, removed, or renamed. `SECTION_TITLE_*` constants are not touched.

### Credits priority line — Exact

`` `- Credits: no city is producing credits. Queue credits in ${bestCredits.label}, where every unit type it can build is at its cap.` ``

### Prompt rule P1 — Exact

In `PRODUCTION_BULLET` (`src/main/openRouter/promptSpec/coachingTextStrategic.ts`), replace the string literal

`'\n\n  Keep one city queued on credits at all times. Credits are the only way to raise mercenaries, and mercenaries are the only units you can place away from your own cities.' +`

with

`'\n\n  Keep enough credits coming in to pay your mercenaries; the Mercenaries section says how long your treasury lasts. Credits are the only way to raise mercenaries, and mercenaries are the only units you can place away from your own cities.' +`

### Game size tooltip T1 — Exact

`Set how many units each side may field. Default doubles the Small caps, and Large triples them, without changing the map or the starting forces.`

---

## Phase 0 — Baseline

**Goal:** Record the starting state.

### Steps

1. Run `npm run rebuild:native:node`. Then run `npm run build:main`, `npm run lint`, `npm run check:circular`, `npm run check:renderer-types`, and `npm run build:renderer`. Record each result.
2. Run each existing test file named under **Tests to run** in Phases 2 to 5 once, and record any that already fail.
3. Confirm `"version": "3.4.1"` in `package.json`.
4. Confirm these anchors exist exactly once. Stop if one is missing.
   - `if (economy.credits < economy.upkeepPerTurn) lines.push(MERCENARY_FUNDS_WARNING);` in `src/main/openRouter/briefingSectionsMercenaries.ts`;
   - `const lines = [topLevelHeading(SECTION_TITLE_MERCENARIES), '', formatMercenaryFundsLine(economy)];` in that same file;
   - `export const MERCENARY_FUNDS_WARNING =` in `src/main/openRouter/promptSpec/gameRuleMercenaryText.ts`;
   - `? formatMercenaryRaiseAttention({` in `src/main/openRouter/requestOrdersInjection.ts`;
   - `` if (bestCredits) lines.push(`- Credits: no city is producing credits. Queue credits in ${bestCredits.label}.`); `` in `src/main/openRouter/productionPriorities.ts`;
   - `Keep one city queued on credits at all times.` in `src/main/openRouter/promptSpec/coachingTextStrategic.ts`;
   - `<option value="small" selected>Small</option>` and `<option value="medium">Medium</option>` in `static/index.html`;
   - `export const gameSizeSelectTooltipText =` in `src/renderer/chrome/controlTooltipText.ts`.
5. Record the line counts of `briefingSectionsMercenaries.ts`, `requestOrdersInjection.ts`, `productionPriorities.ts`, and `productionPriorities.test.ts`.

### Verification

The Phase 0 Inventory is filled in.

---

## Phase 1 — The Treasury Forecast Module

**Goal:** The Design's module, with every Exact text, tested on its own. Nothing calls it yet.

**Adds:** `src/main/openRouter/treasuryForecast.ts`, `src/main/openRouter/treasuryForecast.test.ts`

### Steps

1. Write `treasuryForecast.ts` as in the Design.
   - Begin it with a file header comment in the form of `mercenaryRaiseAttention.ts`.
   - Give every export an orienting comment.
   - `treasuryCoverTurns` is the only place that computes cover turns.
   - `buildTreasuryForecast` calls `estimateCreditsIncomePerTurn` and `treasuryCoverTurns`. It returns null when `state.mercenaryEconomy` is missing.
2. `treasuryAttention(state, seatId)`:
   - logs `logDebug('treasuryForecast treasuryAttention', { seatId, credits, upkeepPerTurn, incomePerTurn, coverTurns, runOut: bool, hoard: bool })`, with nulls when there is no forecast;
   - returns `{ runOut, hoard }` from one forecast.
3. Every other function logs `logTrace` with its inputs' numbers.

### Tests

Write `treasuryForecast.test.ts`, in the style of `productionPriorities.test.ts`.
- Build snapshots by hand. Use a local `world(partial)` helper like that file's, and real H3 cells from `gridDisk('810ebffffffffff', 1)`.
- Use `AI_SEAT_IDS[0]` as the seat and `HUMAN_SEAT_ID` as the enemy.
- Compute expected income as `Math.floor((urban * CREDITS_PER_ITEM) / creditsItemCost())`. Do not hard-code 1 credit per cell.

1. `cover turns count the payrolls the treasury and income pay`:
   - `(credits 10, upkeep 15, income 10)` → 2;
   - `(4, 15, 10)` → 0;
   - `(0, 15, 0)` → 0;
   - `(-5, 15, 0)` → 0;
   - `(10, 10, 10)` → null;
   - `(0, 0, 0)` → null.
2. `income counts only the seat's own unpaused cities whose next item is credits`. Five cells A to E:
   - `strategicControl`: A, B, C, and D belong to the seat; E belongs to the enemy;
   - `strategicInfrastructure`: urban 12 for each cell;
   - `homeRegionHexesBySeat`: `{ [seat]: [A, B, D] }`;
   - `strategicBuildQueueTotals`:
     - A: next `credits`;
     - B: next `infantry`;
     - C: next `credits`, outside the home, with no unit and no fortification, so occupation-paused;
     - D: next `credits` with `buildPaused: true`;
     - E: next `credits`.

   The income is the expected income for 12 cells, from A only. With `strategicBuildQueueTotals` missing, the income is 0.
3. `the forecast is null without an economy, and the sentence follows each case`. Assert every row of the forecast table, Exact:
   - upkeep 0 gives `''`;
   - covered, with income 20 and upkeep 6;
   - `1 more turn`;
   - `3 more turns`;
   - cannot cover, with income;
   - both "With no city producing credits" forms.
4. `the run-out bullet appears at 5 turns or fewer`:
   - cover 5 gives the Exact `for only 5 more turns` bullet;
   - cover 1 gives `for only 1 more turn`;
   - cover 0 gives the Exact `cannot pay this turn's` bullet;
   - cover 6 gives null;
   - covered gives null;
   - a null forecast gives null.

   Build forecasts with `buildTreasuryForecast` from snapshots, not by hand.
5. `the hoard bullet needs a deep treasury and units under half their caps`. On Small, the combined cap is 34; check that with `getMaxUnitsPerType`.
   - Upkeep 30, credits 600, and 16 built units gives the Exact upkeep form with `20 turns of mercenary upkeep` and `16 … of 34`.
   - Credits 599 gives null.
   - 17 built units gives null.
   - Upkeep 0 and credits 500 gives the Exact no-upkeep form.
   - Upkeep 0 and credits 499 gives null.
   - On Medium (`gameSize: 'medium'`) with upkeep 0, credits 999 gives null and credits 1,000 gives the bullet with `of 68`.
   - 16 built units plus 10 `isMercenary: true` infantry still counts 16.
   - For this test, set `upkeepPerTurn` directly in `mercenaryEconomy`.
6. `treasuryAttention never returns both bullets`:
   - a draining case gives `{ runOut: <text>, hoard: null }`;
   - a hoard case gives `{ runOut: null, hoard: <text> }`;
   - no economy gives both null.

**Tests to run:** `dist/main/openRouter/treasuryForecast.test.js`

### Verification

Phase Check.

---

## Phase 2 — The Forecast in the Mercenaries Section

**Goal:** Locked Decision 3.

**Edits:**
- `src/main/openRouter/briefingSectionsMercenaries.ts`
- `src/main/openRouter/briefingSectionsMercenaries.test.ts`
- `src/main/openRouter/promptSpec/gameRuleMercenaryText.ts`

### Steps

1. In `gameRuleMercenaryText.ts`, apply W1: the new `MERCENARY_FUNDS_WARNING` value and the new `MERCENARY_FUNDS_WARNING_ACTION`. Update the warning's comment: it is shown when credits plus this turn's credits income cannot pay this turn's upkeep.
2. In `briefingSectionsMercenaries.ts`, import `buildTreasuryForecast` and `formatTreasuryForecastSentence` from `./treasuryForecast`.
3. Replace the two anchored lines with this, so each block is its own paragraph (the Design's layout):

   ```ts
   const forecast = buildTreasuryForecast(state, ownSeat);
   const forecastSentence = forecast ? formatTreasuryForecastSentence(forecast) : '';
   const lines = [topLevelHeading(SECTION_TITLE_MERCENARIES), '', formatMercenaryFundsLine(economy)];
   if (forecastSentence.length > 0) lines.push('', forecastSentence);
   const cannotPay = forecast ? forecast.coverTurns === 0 : economy.credits < economy.upkeepPerTurn;
   if (cannotPay) {
     lines.push('', options.productionEnabled ? `${MERCENARY_FUNDS_WARNING} ${MERCENARY_FUNDS_WARNING_ACTION}` : MERCENARY_FUNDS_WARNING);
   }
   ```

   Import `MERCENARY_FUNDS_WARNING_ACTION` beside `MERCENARY_FUNDS_WARNING`.

   `forecast` is never null here, because `economy` was checked above. Keep the fallback anyway, so the line cannot throw.
   - The `lines.push('', subHeading(...))` calls that follow already start with `''`. Do not add another, so there is exactly one blank line before `## Your Mercenaries`.
   - The function returns `lines.join('\n')`, unchanged.
4. The zero-credit short form (`Treasury: 0 credits. No one to rehire.`) is unchanged.
5. Update the orienting comment of `buildMercenariesBriefingBlock` and the file header:
   - a forecast paragraph follows the treasury line when upkeep is above 0;
   - the warning is its own paragraph, shown when credits plus the credits income cannot pay this turn's upkeep.

### Tests

In `briefingSectionsMercenaries.test.ts`, keep the existing cases and add these two. Use the `withTempGameDb`, `createStrategicUnit`, `setTreasuryCredits`, and `getGameStateForPlayer` pattern of the first case.

1. `the treasury line forecasts upkeep from the credits queues`:
   - Setup:
     - create one infantry mercenary for the seat at a home cell, and call `setTreasuryCredits(seat, 40)`;
     - read the state, and take `upkeep = state.mercenaryEconomy!.upkeepPerTurn`; assert it is above 0.
   - Build the first block from `{ ...state, strategicBuildQueueTotals: [] }`, so no seeded queue adds income. It contains `` `With no city producing credits, the treasury covers upkeep for ${Math.floor(40 / upkeep)} more turns.` ``. Write the expected text as a literal template in the test; do not call `formatTreasuryForecastSentence`.
   - Let `expectedIncome = Math.floor((urban * CREDITS_PER_ITEM) / creditsItemCost())`. Find a home cell the seat controls in `state.strategicInfrastructure` whose `urban` makes `expectedIncome >= upkeep`, and assert one exists.
     - Control comes from `state.strategicControl`.
     - If no home city is controlled, call `setHexController(city, seat)` on one home city before reading the state, and record that.
   - Then build the block from `{ ...state, strategicBuildQueueTotals: [{ h3Index: city, queuedUnits: 1, nextUnitType: 'credits', nextRemainingCount: 1, storedPoints: 0 }] }`. It contains `` `\n\nAt about ${expectedIncome} credits a turn from your credits queues, upkeep is covered.\n\n` ``.
   - In both blocks, the funds line is followed by exactly one blank line: the block contains `` `${fundsLine}\n\n` ``, where `fundsLine` is the line that starts with `Treasury: 40 credits.`. Neither block contains `\n\n\n`.
2. `the funds warning is its own paragraph and follows the forecast`:
   - With credits 0, a mercenary, and no income, the block contains, in order and joined by `\n\n`:
     - the forecast `With no city producing credits, the treasury cannot cover this turn's upkeep.`;
     - the production-on W1 paragraph, asserted as one full literal string;
     - then `## Your Mercenaries`.
   - With `productionEnabled: false`, the warning paragraph is exactly `Warning: unless more credits come in this turn, random mercenaries desert to Neutral at the end of it.`. The block does not contain `Queue credits in more cities`.
   - With the same credits and the credits city from the case above, the block does not contain `MERCENARY_FUNDS_WARNING`.
   - With a seat that has no mercenary and credits above 0, there is no forecast paragraph: the line after the funds line is blank, then a `##` heading.

Run the existing first case unchanged; its `Treasury: 40 credits.` count stays 1.

**Tests to run:**
- `dist/main/openRouter/briefingSectionsMercenaries.test.js`
- `dist/main/openRouter/treasuryForecast.test.js`
- `dist/main/openRouter/mercenaryRaiseAttention.test.js`
- `dist/main/openRouter/promptSpec/gameRuleMercenaryText.test.js`

### Verification

Phase Check.

---

## Phase 3 — The Treasury Attention Flags

**Goal:** Locked Decisions 4 and 5 in the strategic briefing.

**Edits:** `src/main/openRouter/requestOrdersInjection.ts`

### Steps

1. Import `treasuryAttention` from `./treasuryForecast`.
2. In `buildStatusInjectionTexts`, before the `return`, add:

   ```ts
   const treasury =
     args.productionEnabled && args.coordinateContext.mode !== 'tactical'
       ? treasuryAttention(args.state, seatId)
       : { runOut: null, hoard: null };
   ```

3. In the non-tactical `additionalAttention` array:
   - change the mercenary condition from `args.productionEnabled` to `args.productionEnabled && treasury.runOut === null`;
   - then append `treasury.runOut` and `treasury.hoard`, after the mercenary entry.

   The order becomes: posture, missile, mercenary raise, treasury run-out, treasury hoard. The existing `.filter((bullet): bullet is string => bullet != null)` drops the nulls.
4. Update the `additionalAttention` field comment in `StatusInjectionTexts`:
   - the order above;
   - the raise bullet is left out while the run-out bullet is shown;
   - at most one treasury bullet appears;
   - none of these bullets counts against the five-flag cap.

### Tests

None new; `treasuryAttention` is tested in Phase 1. The tests below guard the briefing assembly.

**Tests to run:** `dist/main/openRouter/treasuryForecast.test.js`, `dist/main/openRouter/consultPromptParts.test.js`, `dist/main/briefingFormatter.test.js`, `dist/main/openRouter/mercenaryRaiseAttention.test.js`

### Verification

Phase Check. `requestOrdersInjection.ts` is at most 440 lines.

---

## Phase 4 — Credits Priority and the Prompt Rule

**Goal:** Locked Decisions 6 and 7.

**Edits:**
- `src/main/openRouter/productionPriorities.ts`
- `src/main/openRouter/productionPriorities.test.ts`
- `src/main/openRouter/promptSpec/coachingTextStrategic.ts`
- `src/main/openRouter/promptSpec/coachingText.test.ts`

### Steps

1. In `productionPriorities.ts`:
   1. Import `getMaxedUnitTypesForPlayer` from `../productionCaps`, which is already imported for `getPlayerUnitCountsByType`. Import `isBuildUnitType` from `../productionRules`.
   2. Add a private helper with an orienting comment:

      ```ts
      function rowUnitTypesAllAtCap(row: ControlledHexQueueSnapshot, maxed: ReadonlySet<string>): boolean {
        const available = Array.isArray(row.availableUnitTypes) ? row.availableUnitTypes.map((value) => String(value)) : [];
        return available.filter((item) => isBuildUnitType(item)).every((unitType) => maxed.has(unitType));
      }
      ```

      An empty unit list returns true (Locked Decision 6).
   3. In the credits block, compute `maxed` once, before the loop:

      ```ts
      const maxed = new Set<string>(getMaxedUnitTypesForPlayer(args.state.units, args.ownSeat, parseGameSize(args.state.gameSize)));
      ```

      Change the loop's skip test to `if (!builder || builder.urban < minUrban || !rowUnitTypesAllAtCap(row, maxed)) continue;`.
   4. Replace the credits `lines.push` with the Exact credits priority line.
   5. Update the file header and the comments of `buildProductionPriorityLines` and `CREDITS_CITY_MIN_URBAN_PER_SIZE`: a credits city must also be at cap for every unit type it can build.
2. In `coachingTextStrategic.ts`, apply the Exact text P1. Check that goal (5), "Keep every city building, and keep credits coming in for mercenaries.", is unchanged.
3. In `coachingText.test.ts`, change both regexes `/Keep one city queued on credits at all times/` to `/Keep enough credits coming in to pay your mercenaries; the Mercenaries section says how long your treasury lasts/`.

### Tests

In `productionPriorities.test.ts`, add a local helper `creditsLine(label: string): string` that returns the Exact credits priority line for that label. Use it in every credits expectation below.

1. `the credits line names the smallest city that meets the size floor`: the rows list only `['credits']`, so they qualify. Change both expected strings to `creditsLine(...)`. Assert the Small case once against the full Exact literal as well.
2. `the credits line is absent when credits is next or the treasury is at the ceiling`: unchanged.
3. `priority lines stay in missile, naval, then credits order`:
   - add `const creditsCity = ring.find((hex) => hex !== builder && hex !== target && hex !== water)!;` and add `creditsCity` to the `labelsFor` list and to `hexes`;
   - add a second queue row, `queueRow({ h3: creditsCity, urban: 12, types: ['credits'], center: labels.center })`;
   - the three assertions stay, and `lines[2]` equals `creditsLine(creditsCity)`.
4. `strangle names the next missile city and a larger credits city`:
   - rename it to `strangle names the next missile city, and a city that can still build a missile gets no credits line`;
   - both rows can still build a missile, below its cap, so the `leaned` and `plain` credits expectations become `[]`, and so does `banked`;
   - `bankedDefault` stays `[]`;
   - keep every missile assertion.
5. `a paused queue does not count as producing credits or as a queued missile`: change the credits expectation to `[creditsLine(openCity)]`.
6. New: `a credits line needs every buildable unit type at its cap`. Rows A (urban 12) and B (urban 20), each with types `['infantry', 'credits']`, and Small caps:
   - with 11 own infantry, there is no credits line;
   - with 12, the line is `creditsLine(A)`;
   - with 12 infantry that are all `isMercenary: true`, there is no line.
7. New: `a missile below its cap keeps a city off the credits line`. A row with types `['infantry', 'missile', 'credits']` and 12 own infantry:
   - with 0 missiles, there is no line;
   - with `caps.missile` own missiles, the line names it.
8. New: `strangle's larger floor applies to capped cities`. Two credits-only rows, urban `CREDITS_CITY_MIN_URBAN_PER_SIZE` and `CREDITS_CITY_MIN_URBAN_PER_SIZE * POSTURE_SETTINGS.strangle.creditsCityUrbanFactor`:
   - the default settings name the smaller row;
   - `POSTURE_SETTINGS.strangle` names the larger.

Build unit fixtures as the existing missile-cap case does: `{ id, player: OWN, unitType, h3Index: ORIGIN }`, plus `isMercenary` where needed. In cases 6 to 8, assert on the lines that start with `- Credits:`, so a missile or naval line cannot affect the result. Respect the size limit in Conventions.

**Tests to run:**
- `dist/main/openRouter/productionPriorities.test.js` (plus `productionPrioritiesCredits.test.js` if you split it)
- `dist/main/openRouter/promptSpec/coachingText.test.js`
- `dist/main/openRouter/briefingSections.test.js`

### Verification

Phase Check.

---

## Phase 5 — Default Game Size

**Goal:** Locked Decision 8.

**Edits:** `static/index.html`, `src/renderer/chrome/controlTooltipText.ts`, `src/renderer/gameplay/newGameSizeUi.ts`

### Steps

1. In `static/index.html`, inside `<select id="new-game-size-select" …>`:
   1. Change `<option value="small" selected>Small</option>` to `<option value="small">Small</option>`.
   2. Change `<option value="medium">Medium</option>` to `<option value="medium" selected>Default</option>`.
   3. Leave `<option value="large">Large</option>` unchanged.
   4. Replace the select's `data-control-tooltip` value with the Exact text T1.
2. In `controlTooltipText.ts`, set `gameSizeSelectTooltipText` to the Exact text T1.
3. In `newGameSizeUi.ts`, add to the orienting comment of `readSelectedGameSizeFromDocument`: the `medium` option is labeled Default and is selected when the page loads. Its `Expected outcome` (`'small'` when the select is missing or empty) stays true and stays.
4. Check that no other file selects a game size option on load:
   - `Get-ChildItem src/renderer -Recurse -Filter *.ts | Select-String -Pattern "new-game-size-select"` lists only `newGameSizeUi.ts` and the tooltip catalog's comment;
   - `Select-String -Path static/index.html -Pattern 'value="(small|medium|large)"( selected)?'` shows exactly one `selected`, on `medium`.
5. Leave `scripts/ui-smoke/ui-smoke-new-game.cjs` alone. Its scenarios select `small` explicitly.

### Tests

No unit test reads these options.

**Tests to run:** `dist/main/rendererReplayContracts.test.js`, which reads `static/index.html`.

### Verification

Phase Check, plus `npm run check:renderer-types` and `npm run build:renderer`.

---

## Phase 6 — Docs, Version 3.4.2, Final Checks, and Hand-Off

**Goal:** The docs match the code, the version is 3.4.2, and the static checks pass.

**Adds:** `doc/release-notes/v3.4.2.md`

**Edits:**
- `doc/ai-commander-prompts/strategic-prompt.md`, `doc/ai-commander-prompts/example-strategic-prompt.md`, `doc/ai-commander-prompts/information-decision-model.md`, `doc/ai-commander-prompts/source-inventory.md`, `doc/ai-commander-prompts/crosswalk.md`
- `doc/hybrid-ai.md`, `doc/game-size-unit-caps.md`, `doc/how-to-play.md`, `doc/combat-rules-v3.md`
- `doc/ux/control-tooltips.md`, `doc/ux/new-game-dialog.md`
- `README.md`, `doc/README.md`, `package.json`, `package-lock.json`

### Steps

1. `doc/ai-commander-prompts/strategic-prompt.md`:
   - **Attention Flags**, in the paragraph after the one on `formatMercenaryRaiseAttention`. Add the run-out and hoard bullets:
     - what `treasuryAttention` writes, and their conditions with the constant names and values;
     - the two Exact texts with `{credits}`-style placeholders;
     - the mercenary bullet is left out while the run-out bullet shows;
     - at most one treasury bullet appears, and neither counts against the cap.
   - **Production Priorities** (the `SECTION_TITLE_PRODUCTION_PRIORITIES` paragraph). The credits line also needs a city whose every buildable unit type is in `getMaxedUnitTypesForPlayer`, missile included, and the line says so.
   - **Mercenaries section content** (the `formatMercenaryFundsLine` paragraph):
     - the opening's paragraph layout (the Design's Mercenaries section layout);
     - the forecast sentence and its four cases;
     - how income is estimated (Locked Decision 1) and what it ignores (Non-Goals);
     - the new warning condition and the W1 text.
   - Rule 11: replace "Keep one city queued on credits at all times." with P1's first sentence.
2. `example-strategic-prompt.md`: replace the copy of the old sentence with P1's first sentence.
3. `information-decision-model.md`:
   - step 9 and the `PRODUCTION_CAP_QUEUE_RULE` row: replace "Keep one city queued on credits." with "Keep enough credits coming in for mercenary upkeep.";
   - the `PRODUCTION_PRIORITIES` row: the capped-city condition;
   - after the `MERCENARY_RAISE_ATTENTION` row, add a `TREASURY_ATTENTION` row in the same column format, from `treasuryAttention` in `treasuryForecast.ts`;
   - in the `MERCENARY_RAISE_ATTENTION` row, note that the run-out bullet suppresses it.
4. `source-inventory.md`:
   - add `src/main/openRouter/treasuryForecast.ts` next to `mercenaryRaiseAttention.ts`, in the same format;
   - in the `# Mercenaries` row, name the forecast paragraph.

   In `crosswalk.md`, in the `# Mercenaries` row, add the forecast paragraph after "Treasury, upkeep figures".
5. `doc/hybrid-ai.md`, at the production-priorities paragraph and the `creditsCityUrbanFactor` sentence: the credits line now also needs a city at cap for every unit type it can build.
6. Game size:
   - **`doc/game-size-unit-caps.md`:**
     - matches can be Small, Default, or Large;
     - Default is stored as `medium` and is twice Small;
     - the dropdown reads Small / Default / Large and starts on Default;
     - a missing stored size still reads as Small.
   - **`doc/how-to-play.md`:**
     - in the bullet `- **Game size:** Small, Medium, or Large.`, name Default for the middle size, and say the new-game dialog starts on Default;
     - in the Caps bullet, replace `Medium doubles them` with `Default doubles them`.
   - **`doc/combat-rules-v3.md`:** in §1 and its cap table, write Default (`medium`) for the middle size.
   - **`doc/ux/control-tooltips.md`:** the Game size line is T1.
   - **`doc/ux/new-game-dialog.md`:** in the Forces bullet, Game size lists Small, Default, and Large. It starts on Default when the app starts, and keeps the last choice while the app stays open.
7. `npm version 3.4.2 --no-git-tag-version`.
8. `doc/release-notes/v3.4.2.md`:
   - Copy `v3.4.1.md` and change the version everywhere. Keep Downloads and Before you play.
   - In **Saves**:
     - change "through 3.4.0" to "through 3.4.1";
     - change "will not load in 3.4.1" to "will not load in 3.4.2";
     - replace "A 3.4.0 save opens as it is." with "A 3.4.1 save opens as it is, and a match saved at Medium size opens at Default, with the same caps.";
     - keep the posture strip sentence.
   - Replace What's new with `## What's in 3.4.2` and these bullets, **Exact**:
     - `- **Treasury forecast.** Each commander's Mercenaries section now says how many turns its treasury and credits queues cover mercenary upkeep, and its shortfall warning says what to do.`
     - `- **Treasury attention.** Attention Flags warn a commander when upkeep will run out within 5 turns, and when it is sitting on a large treasury while its forces are under half their caps.`
     - `- **Credits where nothing else can be built.** Production Priorities now names a city for credits only when every unit type that city can build is at its cap. Commanders are no longer told to keep a city on credits at all times.`
     - `- **Default game size.** The new-game dialog's Medium size is now called Default, and new games start with it selected. Small and Large are unchanged.`
9. `README.md`:
   - Update the executable names and the version under Status.
   - Leave the test count for the user.
   - Add above the 3.4.1 bullet, **Exact**: `- **3.4.2** adds a treasury forecast to each commander's Mercenaries section, Attention Flags for an upkeep shortfall or an idle treasury, and a credits priority only for cities at their unit caps. The Medium game size is renamed Default and is now the new-game default.`
10. `doc/README.md`: update the shipping version. Add a `Release **3.4.2** …` paragraph above the 3.4.1 one, with the same text as the README bullet.
11. Run `node scripts/check-doc-links.cjs`.
12. Run the Phase Check plus `npm run check:renderer-types` and `npm run build:renderer`, then `npm run rebuild:native:electron` last.
13. Fill in the Completion Log, and give the user the checklist below.

### Manual checklist for the user

Part of your final pass:

1. Start the app and open New Game. Game size reads Default and lies between Small and Large. The unit row shows the doubled caps, infantry 24. The tooltip names Default.
2. Start a match at Default, and confirm the caps in Production Status are the Medium caps.
3. In a commander's briefing, from the debug log or the prompt view:
   - once that side has mercenaries, the forecast is its own paragraph after the Mercenaries treasury line, with a blank line before and after it;
   - when the side cannot pay this turn, the warning is a separate paragraph after the forecast;
   - the forecast's income roughly matches the urban cells of its cities with credits next.
4. Load the 3.4.1 medium save at turn 116. The hoarding side's Attention Flags carry the `Treasury: … turns of mercenary upkeep` bullet, and the other side's do not.
5. Watch for a side whose upkeep outruns its credits. The run-out bullet appears up to 5 turns before desertion, and the raise bullet disappears while it shows.
6. Production Priorities names a credits city only when that city's types are all at cap.
7. Run `npm run ui:smoke` and `npm run doc:shots`, and refresh any new-game screenshot that shows Small selected.

### Verification

The Phase Check passes, `check-doc-links` passes, and the Completion Log is complete.

---

## Reliability Checklist

- [ ] No file outside a phase's lists was edited, except those recorded.
- [ ] `consultPromptParts.ts`, `requestOrdersFlow.ts`, and `src/shared/gameSize.ts` are unchanged. `parseGameSize` still falls back to `'small'`.
- [ ] The forecast is computed only by `buildTreasuryForecast`, and cover turns only by `treasuryCoverTurns`.
- [ ] `treasuryForecast.ts` imports nothing from the briefing or injection modules, and `check:circular` prints no cycle.
- [ ] The forecast sentence is empty when upkeep is 0. The funds warning shows exactly when `coverTurns === 0`.
- [ ] Run-out and hoard never appear together. The raise bullet never appears beside run-out.
- [ ] A city with any buildable unit type below its cap, missile included, is never named for credits.
- [ ] The size select has exactly one `selected`, on `medium`, labeled Default.
- [ ] Every Exact text matches character for character.
- [ ] The Mercenaries opening is funds line, forecast, and warning as separate paragraphs, with one blank line between blocks and no triple newline.
- [ ] Every new attention bullet is one line, starts with `Treasury:`, and names other sections by their exact titles. No heading was added, removed, or renamed.
- [ ] No plan vocabulary in code, tests, or `doc/`.

## Success Definition

- The Mercenaries section tells a commander how many turns its treasury lasts at its current credits income.
- Attention Flags warn 5 turns or fewer before upkeep runs out, and flag a treasury of 20+ turns of upkeep (and at least 500 × size) while the side fields under half its caps.
- Production Priorities suggests credits only in cities at cap for every unit type they can build. The prompt no longer demands a credits city at all times.
- The new-game dialog reads Small, Default, Large, and starts on Default. Stored sizes and old saves behave as before.
- Docs, version 3.4.2, and the release notes are updated. The named tests and static checks pass.

## Phase 0 Inventory

| Item | Value |
| --- | --- |
| Static check results | `build:main`, `lint`, `check:circular` (no cycle), `check:renderer-types` (baseline only), `build:renderer`: all exit 0 |
| Pre-existing failures in named tests | None |
| Anchors confirmed | All, each once |
| Line counts | `briefingSectionsMercenaries.ts` 410, `requestOrdersInjection.ts` 400, `productionPriorities.ts` 313, `productionPriorities.test.ts` 552 |

## Defect Inventory

| Phase | Defect | Fix or reason for stopping |
| --- | --- | --- |

## Completion Log

| Phase | Result | Files changed beyond the lists | Sketch differences | Notes |
| --- | --- | --- | --- | --- |
| 1 | Pass | None | None | 6 tests; hoard test also checks the section titles against `sectionHeadings` |
| 2 | Pass | None | Test helper `homeCreditsCity` calls `setHexController` on the most urban home city unconditionally | 3 new cases (the no-mercenary check is its own case) |
| 3 | Pass | None | None | `requestOrdersInjection.ts` 407 lines |
| 4 | Pass | `briefingSections.test.ts`: caps the seat's units so its home city qualifies for the credits line | Credits cases 6 to 8 split into `productionPrioritiesCredits.test.ts` (main file would pass 600) | P1 uses `SECTION_TITLE_MERCENARIES`; text unchanged |
| 5 | Pass | None | Static cap placeholders in `index.html` set to the Default caps, matching the selected option | |
| 6 | Pass | None | 3.4.1 notes kept as a collapsed entry under Earlier 3.x releases; `combat-rules-v3.md` "Medium is 2× Small" also renamed | `bug_report.yml` placeholder left at 3.4.1; `game-vision-v2.md` still says Medium ×2, Large ×4 |
