# Credits Spending Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Commanders spend the credits they bank. The version stays **3.6.0**: these changes ship in 3.6.0, and its release notes gain bullets. Three changes:

1. **A deeper treasury flag.** The hoard bullet fires whenever the treasury is deep, not only while a side's built units are under half their caps. At or above half their caps it says that mercenaries do not count toward caps.
2. **An off switch for the credits advice.** The system prompt keeps a static rule: give a credits row a larger count unless the Mercenaries section says the credits are more than needed. The Mercenaries forecast paragraph says so when the treasury is deep.
3. **A raise flag that names several cells.** Up to 6 cells, paused cities first, with a count in each. Raises go on until the treasury left would cover only 20 turns of upkeep.

**Shape:**
- Phase 0 records a baseline.
- Phase 1 adds the deep-treasury rule and widens the hoard bullet.
- Phase 2 switches off the credits advice when the treasury is deep.
- Phase 3 rewrites the raise flag around a pure planner.
- Phase 4 updates the docs and release notes, runs the final checks, and hands off.

**Tech:** TypeScript (Electron main and shared modules), `better-sqlite3`, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`.

**Shell:** Windows PowerShell. Working directory `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`. Search with `Get-ChildItem -Recurse src -Include *.ts | Select-String -Pattern '<text>' -SimpleMatch`.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Targeted testing only.** Every phase ends with the Phase Check: static checks plus the tests that phase names. Never run `npm test`, `npm run ui:smoke`, or `npm run doc:shots`, and never run test files the phase does not name. The user runs the full test, review, and fix pass afterwards.
- **Stop only when a check fails** and you cannot fix it within the phase's file lists. Then:
  1. revert that phase (see Backup and Revert);
  2. record the failure in the Defect Inventory;
  3. stop, and tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, `git mv`, `git rm`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**.
  - Do not edit other files, with two exceptions: removing an import that lint reports unused in a listed file, and fixing a test that fails only because of a change the phase names.
  - Record every such file in the Completion Log.
- Find code by the quoted text or the symbol name, not by a line number.
- **Code blocks are sketches** unless marked **Exact**.
  - Write the real code from the file you just read. When a sketch and the file disagree, the file wins; record the difference in the Completion Log.
  - Text marked **Exact** is copied character for character, including punctuation and spacing.
  - In Exact text, `${name}` means the value of that variable or constant, interpolated in a template literal.
- **Tests come first.** Write a new function's test with the function, and run it before any existing code calls it.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Set `$step` to the phase number and `$files` to that phase's **Edits** list.

```powershell
$step = '1'
$files = @('src/main/openRouter/treasuryForecast.ts', 'src/main/openRouter/treasuryForecast.test.ts')
$backup = Join-Path $env:TEMP "aw-360-credits\step-$step"
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

Tests that open a database load `better-sqlite3` under Node, and `npm install` builds it for Electron. Phase 0 runs `npm run rebuild:native:node`. Phase 4 runs `npm run rebuild:native:electron` last, so the app starts again.

- **Native module lock.** If a rebuild fails with `EBUSY` on `better_sqlite3.node`:
  1. close any running Electron app;
  2. rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`;
  3. run the rebuild again;
  4. delete the `.locked` file.

### Phase Check

Every phase from 1 to 4 ends with the Phase Check, run from the repo root:

```powershell
npm run build:main
npm run lint
npm run check:circular
```

- Add `npm run check:renderer-types` whenever the phase adds or edits a file under `src/shared` or `src/renderer`. This plan should need it only in Phase 4's final run.
- Then run every test file the phase adds and every existing test file it lists under **Tests to run**, and no others. All must pass. Run a main-process test with `node dist/main/<path>.test.js`.
- `check:circular` must print **no** cycle.
- A static check or a named test that already failed in Phase 0 is not yours to fix. A **new** failure is.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a check pass.
- **No test may call a real model.** Do not start the app.
- Record each Phase Check result in the Completion Log.

---

## Non-Goals

- **No economy change.** Credits pricing, mercenary fees, upkeep, raise capacity, placement rules, desertion, and unit caps stay as they are.
- **The cheapest affordable option is still chosen per cell.** The raise flag will mostly name infantry. Naming armor mercenaries is out of scope.
- **No change to the Raise Options table, the Units Without Standing Orders table, or Suggested Destinations.** The raise bullet reads Raise Options; it does not change it.
- **No change to the run-out bullet.** It still says to queue more credits when money runs short, and while it shows, the raise flag stays hidden, as today.
- **Campaign targets.** In the reviewed match, after the third side was knocked out, the two sides left had no campaign objective. That is why many units had "—" as Suggested Destination. It is a separate problem and is not fixed here.
- **Idle mercenaries are not given orders here.** No bullet sends idle mercenaries to paused cities. Most of them were idle only because the campaign had no objective: a working campaign gives almost every ground unit a Suggested Destination. Paused cities are covered by the raise bullet, which lists cells that restart a paused queue first. Keeping a garrison in captured cities belongs to the campaign's unit selection, in a separate change.
- **Files not to edit:**

  | File | Lines | Why |
  | --- | --- | --- |
  | `src/main/openRouter/consultPromptParts.ts` | 602 | Over 600; prompt assembly does not change |
  | `src/main/openRouter/promptSpec/sectionHeadings.ts` | 615 | Over 600; importing from it is fine |

- Do not edit anything under `.spec/completed/`, release notes of versions before 3.6.0, or the historical documents named in `AGENTS.md`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`.

- **Orienting comments.** Every new or changed declaration, and every field of an interface or parameter-object type, has a JSDoc block:
  - a one-line summary;
  - `Purpose:` (or `Contract:` for types and fields);
  - `When to use:`, `Expected outcome:`, and `Exceptions:`.

  Update every comment whose behavior this plan changes. Afterwards, no comment may still say:
  - that the hoard bullet needs units under half their caps;
  - that the raise flag names one hex, or keeps 3 turns of upkeep;
  - that the raise flag ignores the upkeep of the mercenaries already raised;
  - that a credits row should always get a larger count.

  No generic filler.
- **Logging (rule 02).** Only `src/main` logs.
  - Database readers and flow functions log `logDebug` on entry.
  - Pure helpers log `logTrace`.
  - Log seat ids, unit ids, hex ids, counts, and credits only.
- **Names.** Use the file and symbol names this plan gives. camelCase functions, PascalCase types, UPPER_SNAKE constants.
- **No plan vocabulary** in code, comments, test names, or `doc/`.
- **Seat ids:** no literals in production code.
- **Size limits (rule 09).**
  - Each new file must stay under 350 lines.
  - Each edited file must stay under 600.
  - Record every final line count in the Completion Log.
  - **A file already over 600 lines only shrinks.** No phase edits a source or test file over 600 lines. The one long file Phase 4 touches, `doc/ai-commander-prompts/example-strategic-prompt.md` (669 lines), gets a same-line sentence replacement and no new line. If a test in such a file fails because of this plan's text, do not edit it in place: delete that one test from the big file, add its corrected version to a new sibling test file with the same test name, and record the move in the Completion Log.
- **Mutability (rule 13), arguments (rule 10).**
  - At most 2 parameters, or one parameter object with a commented type.
  - Pure functions never mutate their inputs.
- **Reuse (rule 06).**
  - `isTreasuryDeep` is the only "more than you need" test. The hoard bullet and the forecast sentence both call it.
  - `planMercenaryRaises` is the only raise budget.
- **Tests (rule 03).** Test contracts, not private helpers or call order. Copy the structure of the sibling test file named in each phase.
- **Prompt structure:**
  - The system prompt changes in one place, the credits-count paragraph (Phase 2), and stays static: it reads only constants.
  - Every other change is in the situation message.
  - No heading, table, column, or attention bullet is added or removed.
  - The rewritten raise bullet is still one line.
  - The forecast addition is one sentence in the existing forecast paragraph.
- **Docs.** Phase 4 updates `doc/`, `README.md`, and the release notes. Do not edit them earlier.

---

## Evidence From the 3.6.0 Match (turns 50–70)

- **Treasuries kept growing.**
  - Eastern Asia: 15,006 → 21,840 credits, against upkeep of about 175 a turn.
  - North America: 13,571 → 16,315, against upkeep of about 106.
  - Both forecasts read "at least 100 more turns".
- **The raise flag set the spending rate.** Every hire order from turn 50 to 64 was exactly the hex and count the raise flag named: 1–3 infantry a turn per side.
  - The flag names one hex, and its count is capped by that hex's capacity.
  - Eastern Asia's raise table listed 10 cells with about 24 infantry of capacity a turn.
- **The hoard bullet never fired for the two rich sides.** It fires only while built units are under half their caps. Eastern Asia was at 24/24 infantry and 16/16 armor.
- **Credits advice with no off switch.**
  - Eastern Asia kept 101 of its 115 queues on credits, with 6,100 more credits queued.
  - The production bullet in the system prompt says "For steady income, give it a larger count."
- **Dead production in conquered cities.** Eastern Asia had 68 paused queues ("occupying units or fortifications required"). One unit in a city restarts its queue.
- **Idle mercenaries.** About half had no standing order (17 of Eastern Asia's 36, 11 of North America's 26), and their Suggested Destination was "—" because neither side had a campaign objective. This plan does not address them (see Non-Goals).

---

## Locked Decisions

1. **Deep treasury.** `isTreasuryDeep({ forecast, gameSize })` is true when `forecast.credits >= max(TREASURY_HOARD_UPKEEP_TURNS × forecast.upkeepPerTurn, TREASURY_HOARD_FLOOR_PER_SIZE × GAME_SIZE_MULTIPLIER[size])`. This is today's hoard floor (20 turns, 500 per size step).
2. **Hoard bullet.** It fires whenever the treasury is deep.
   - Below half the caps it keeps today's text.
   - At or above half it uses the new text in the Design.
   - `TREASURY_HOARD_BUILT_CAP_SHARE` now only chooses the wording.
   - The run-out and hoard bullets still never both appear.
3. **Credits advice.** The system text is static and conditional (Design). When the treasury is deep, the Mercenaries forecast paragraph appends one sentence.
4. **Raise budget.** `MERCENARY_UPKEEP_RESERVE_TURNS` becomes `20` (from 3). The treasury left after the raises must still cover that many turns of total upkeep, counting the mercenaries already paid for plus the new ones.

   This is intended: a side whose treasury already covers fewer than 20 turns gets no raise suggestion. The run-out bullet still guards the low end.
5. **Raise cells.**
   - At most `MERCENARY_RAISE_ATTENTION_MAX_CELLS` = 6.
   - Cells are taken in Raise Options order (resuming cells first), except that among cells that do not resume, cells outside the home region come before home cells.
   - Each cell takes its cheapest affordable option and as many as its capacity and the budget allow.
6. **Bullet order** in `additionalAttention` is unchanged: posture, missile, raise, treasury run-out, treasury hoard. All of them stay strategic only.
7. **Release.** The version stays 3.6.0. `doc/release-notes/v3.6.0.md` gains bullets, and the 3.6.0 summaries in `README.md` and `doc/README.md` gain a clause. Nothing is committed.

---

## Design

### `isTreasuryDeep` and the hoard bullet (Phase 1) — `treasuryForecast.ts`

```ts
export function isTreasuryDeep(args: { readonly forecast: TreasuryForecast; readonly gameSize: GameStateSnapshot['gameSize'] }): boolean
```

- It reads the size with `parseGameSize(args.gameSize)`.
- It logs `logTrace` with `credits`, `upkeepPerTurn`, the floor, and the result.

`formatTreasuryHoardAttention` returns `null` when the forecast is null or the treasury is not deep. Otherwise `held` is built as today, and the text is **Exact**:

- `built < capTotal × TREASURY_HOARD_BUILT_CAP_SHARE`: `Treasury: ${held}, while you field ${built} infantry, armor, naval, and air units against a combined cap of ${capTotal}. Raise mercenaries where Raise Options under Mercenaries lists a cell, and queue units instead of credits where a city can still build them.`
- otherwise: `Treasury: ${held}, while you field ${built} infantry, armor, naval, and air units against a combined cap of ${capTotal}. Mercenaries do not count toward those caps: raise them where Raise Options under Mercenaries lists a cell.`

### Credits advice (Phase 2)

**System text.** `buildCreditsCountGuidance` in `gameRuleMercenaryText.ts` is **Exact**: `A credits row adds ${CREDITS_PER_ITEM} credits for each ${cost} production points it spends, and it stops when its count runs out. For steady income, give it a larger count, unless the ${SECTION_TITLE_MERCENARIES} section says your credits are more than you need. A city makes one production point per city cell each turn, so a count of 10 in a city with ${cost} city cells lasts about 10 turns.`

It reads only constants, so the cached system prompt changes once and then stays stable.

**Forecast sentence.**
- `formatTreasuryForecastSentence` takes one object: `{ forecast: TreasuryForecast; deep: boolean }`.
- When `deep` is false, it returns today's sentence.
- When `deep` is true, it appends, after a space, or alone when today's sentence is empty, **Exact**: `Your ${credits} credits are more than you need: spend them on mercenaries before you queue more credits, and queue units instead of credits where a city can still build them.`
- `buildMercenariesBriefingBlock` passes `deep: options.productionEnabled && isTreasuryDeep({ forecast, gameSize: state.gameSize })`.
  - The section also shows with production off when the seat owns a mercenary. The model cannot raise or queue anything then, so the sentence must not appear.

### Raise planner (Phase 3) — `mercenaryRaiseAttention.ts`

```ts
export const MERCENARY_UPKEEP_RESERVE_TURNS = 20;
export const MERCENARY_RAISE_ATTENTION_MAX_CELLS = 6;

export interface MercenaryRaiseCell {
  readonly h3Index: string;
  readonly option: HireRaiseOption;
  readonly count: number;
  readonly resumes: boolean;
}
export function planMercenaryRaises(input: {
  readonly credits: number;
  readonly upkeepPerTurn: number;
  readonly rows: readonly RaiseOptionRow[];      // raiseOptionRowsForSeat order
  readonly homeHexes: ReadonlySet<string>;
}): readonly MercenaryRaiseCell[];
```

**`planMercenaryRaises`** is pure:
1. **Order the rows.**
   - Keep the rows whose `resumes` is true, in their order.
   - Then the other rows outside `homeHexes`, in their order.
   - Then the other rows inside it, in their order.
2. Walk the ordered rows with a running `credits` and `upkeep`. Stop at `MERCENARY_RAISE_ATTENTION_MAX_CELLS` cells.
3. **Choose the option.** Among the row's options, keep those where `credits - option.fee >= MERCENARY_UPKEEP_RESERVE_TURNS × (upkeep + option.upkeep)`. Take the cheapest, by fee, then `HIREABLE_UNIT_TYPES` order. With none, skip the row.
4. **Count.** `count = min(floor((credits - R × upkeep) / (option.fee + R × option.upkeep)), floor(row.capacityLeft / option.unitCost), HIRE_COUNT_MAX)`, where `R = MERCENARY_UPKEEP_RESERVE_TURNS`. With `count < 1`, skip the row.
5. Add the cell, then `credits -= count × fee` and `upkeep += count × option.upkeep`.

**`formatMercenaryRaiseAttention`** keeps its arguments and returns `{ readonly text: string | null; readonly cells: readonly MercenaryRaiseCell[] }`.
- It keeps today's guard: with no `mercenaryEconomy`, or when `isSeatId(ownSeat)` is false, `text` is `null` and `cells` is empty.
- Its rows are `raiseOptionRowsForSeat(state, ownSeat, campaignTargetH3).slice(0, MERCENARY_BRIEFING_MAX_ROWS)`, the rows the Raise Options table shows, so every cell the bullet names is also in the table. Import `MERCENARY_BRIEFING_MAX_ROWS` from `./promptSpec/gameRuleMercenaryText`, as `briefingSectionsMercenaries.ts` does.
- It builds `homeHexes` from `state.homeRegionHexesBySeat`, calls the planner with `economy.credits` and `economy.upkeepPerTurn`, and logs `logDebug` with `ownSeat`, `credits`, the cell count, and the total.
- With no cells, `text` is `null`.
- Otherwise the text is **Exact**: `Mercenaries: your treasury of ${credits} credits can raise ${total} ${total === 1 ? 'mercenary' : 'mercenaries'} this turn for ${fees} credits and still keep ${MERCENARY_UPKEEP_RESERVE_TURNS} turns of upkeep: ${parts}. Add one raise_mercenaries row per cell, with that count.`
  - `total` is the sum of the counts, and `fees` the sum of `count × fee`.
  - `parts` joins with `'; '`. Each part is `${count} ${option.unitType} at ${format(h3Index)}`, plus ` (restarts its paused queue)` when `resumes`.

### Prompt Layout

| Text | Message | Where | Change |
| --- | --- | --- | --- |
| credits-count paragraph | System | Orders Guidance → Production Queues bullet | sentence 2 replaced; static |
| forecast sentence | Situation | `# Mercenaries`, forecast paragraph | one sentence appended when deep |
| raise bullet | Situation | Attention Flags | rewritten; one line |
| hoard bullet | Situation | Attention Flags, last | fires more often; second wording |

---

## Phase 0 — Baseline

### Steps

1. `npm run rebuild:native:node`
2. Run `npm run build:main`, `npm run lint`, and `npm run check:circular`. Record each result.
3. Run each existing test file named under **Tests to run** in Phases 1 to 3. Record any that fail now.
4. Confirm each anchor below appears exactly once:
   - `export const MERCENARY_UPKEEP_RESERVE_TURNS = 3;` — `src/main/openRouter/mercenaryRaiseAttention.ts`
   - `if (forecast.credits < creditsFloor || built >= capTotal * TREASURY_HOARD_BUILT_CAP_SHARE) return null;` — `src/main/openRouter/treasuryForecast.ts`
   - `For steady income, give it a larger count.` — `src/main/openRouter/promptSpec/gameRuleMercenaryText.ts`
   - `const forecastSentence = forecast ? formatTreasuryForecastSentence(forecast) : '';` — `src/main/openRouter/briefingSectionsMercenaries.ts`
   - `args.productionEnabled && treasury.runOut === null` — `src/main/openRouter/requestOrdersInjection.ts`
   - `For steady income, give it a larger count.` — `doc/ai-commander-prompts/example-strategic-prompt.md`
   - `so give it a larger count for steady income` — `doc/ai-commander-prompts/strategic-prompt.md`
5. Record the line count of every file this plan edits.

### Verification

Every result, anchor, and count is recorded in the Phase 0 Inventory.

---

## Phase 1 — The Hoard Bullet Fires on a Deep Treasury

**Edits:** `src/main/openRouter/treasuryForecast.ts`, `src/main/openRouter/treasuryForecast.test.ts`

### Steps

1. Add `isTreasuryDeep` (Design). `formatTreasuryHoardAttention` computes its floor through it. Do not keep a second copy of the floor arithmetic.
2. Apply the Design's hoard texts. Update the comments on `formatTreasuryHoardAttention`, `TREASURY_HOARD_BUILT_CAP_SHARE` ("chooses the wording"), and `treasuryAttention`.

### Tests

In `treasuryForecast.test.ts`, the test `the hoard bullet needs a deep treasury and units under half their caps` becomes **Exact** `the hoard bullet needs a deep treasury, and its wording follows the caps`. It asserts:
- below the floor, `null`;
- deep and under half the caps, the first Exact text;
- deep and at or above half the caps, the second Exact text, where today's test expects `null`.

Add, **Exact** names:
- `a deep treasury covers twenty turns of upkeep and the size floor`. Check each side of the floor: upkeep-bound, size-bound, and upkeep 0.
- `treasuryAttention never returns both bullets` stays, and must still pass.

### Tests to run

`treasuryForecast.test`, `briefingSectionsMercenaries.test`, `promptOutline.test`.

### Verification

The Phase Check.

---

## Phase 2 — The Credits Advice Switches Off When the Treasury Is Deep

**Edits:**
- `src/main/openRouter/promptSpec/gameRuleMercenaryText.ts`, `gameRuleMercenaryText.test.ts`, `coachingText.test.ts`
- `src/main/openRouter/treasuryForecast.ts`, `treasuryForecast.test.ts`
- `src/main/openRouter/briefingSectionsMercenaries.ts`, `briefingSectionsMercenaries.test.ts`

### Steps

1. Replace `buildCreditsCountGuidance`'s text (Design). Import `SECTION_TITLE_MERCENARIES` from `./sectionHeadings`. Update its comment's Expected outcome to name the "unless" clause.
2. Change `formatTreasuryForecastSentence` to the object parameter (Design), and update its comment.
3. In `buildMercenariesBriefingBlock`, pass `deep` (Design).
4. Fix the callers the build reports. There should be none outside the listed files.

### Tests

- `gameRuleMercenaryText.test.ts` and `coachingText.test.ts`: the guidance assertions expect the new Exact text. Assert it contains `unless the Mercenaries section says your credits are more than you need`.
- `treasuryForecast.test.ts`:
  - update `the forecast is null without an economy, and the sentence follows each case` to pass `deep: false` everywhere;
  - add **Exact** `a deep treasury adds the spend sentence`. Cover the appended form, and the standalone form when upkeep and queued credits are both 0.
- `briefingSectionsMercenaries.test.ts`: add **Exact** `the forecast paragraph says a deep treasury is more than needed`. Use a fixture with 20,000 credits and upkeep 50, and a seat that owns a mercenary.
  - With production on, the sentence is in the same paragraph as the forecast, with no blank line between.
  - With production off, the section still shows (the seat owns a mercenary) and the sentence is absent.

### Tests to run

`gameRuleMercenaryText.test`, `coachingText.test`, `treasuryForecast.test`, `briefingSectionsMercenaries.test`, `consultPromptParts.test`, `systemPromptStability.test`, `promptOutline.test`.

### Verification

The Phase Check. The new system text appears in the static system message only: `consultPromptParts.test` and `systemPromptStability.test` pass, and the text has no per-turn number.

---

## Phase 3 — The Raise Flag Names Several Cells

**Edits:**
- `src/main/openRouter/mercenaryRaiseAttention.ts`, `mercenaryRaiseAttention.test.ts`
- `src/main/openRouter/requestOrdersInjection.ts` (only to read `.text` from the new return value)

### Steps

1. Write the `planMercenaryRaises` tests first (below), then the planner (Design).
2. Rewrite `formatMercenaryRaiseAttention` around it (Design).
   - Set `MERCENARY_UPKEEP_RESERVE_TURNS = 20`, and add `MERCENARY_RAISE_ATTENTION_MAX_CELLS`.
   - Remove `optionIsAffordable`, `cheapestAffordableOption`, and `affordableRaiseCount` once nothing calls them.
   - Update the module comment and each function comment.
3. In `requestOrdersInjection.ts`, read `.text` from the result: `formatMercenaryRaiseAttention({ ... }).text`, in the same place and under the same `args.productionEnabled && treasury.runOut === null` guard. Change nothing else in that file except the comments that describe the raise bullet.

### Tests

Replace the three existing tests with these **Exact** names. Keep the temp-database style for the formatting tests, and use plain objects for the planner.
- **`the planner keeps twenty turns of total upkeep`.** One row, infantry fee 5, upkeep 5, unit cost 20, capacity 400, `upkeepPerTurn` 100. With credits `20 × 100 + 3 × (5 + 20 × 5)`, the count is 3. One credit less gives 2.
- **`the planner takes resuming cells first, then cells outside home`.** Rows A (home), B (outside), C (resumes) give the order C, B, A.
- **`the planner stops at six cells and at each cell's capacity`.** Eight rows give six cells. A row with capacity 40 and an infantry option of unit cost 20 gives at most 2.
- **`the planner spends the treasury across cells, not per cell`.** Two rows. The second row's count shrinks by what the first row spent.
- **`the raise bullet lists each cell, and marks one that restarts a paused queue`.** Temp database. The existing `outsideCity` helper gives a controlled city with no unit and no fortification, which is occupation-paused, so its row resumes. Assert the Exact text, with `(restarts its paused queue)` on that cell, and that `cells` lists it.
- **`the raise bullet is quiet when no cell is affordable`.** `text` is `null` and `cells` is empty.

### Tests to run

`mercenaryRaiseAttention.test`, `briefingSectionsMercenaries.test`, `consultPromptParts.test`, `promptOutline.test`, `systemPromptStability.test`.

### Verification

The Phase Check.

---

## Phase 4 — Docs, Release Notes, Final Checks, and Hand-Off

**Edits:**
- `doc/ai-commander-prompts/strategic-prompt.md`, `information-decision-model.md`, `crosswalk.md`, `example-strategic-prompt.md`
- `doc/hybrid-ai.md`, `doc/README.md`, `README.md`
- `doc/release-notes/v3.6.0.md`

### Steps

1. **`doc/ai-commander-prompts/`:**
   - `strategic-prompt.md`:
     - the paragraph that begins with `formatMercenaryRaiseAttention` and "writes the mercenary bullet": up to 6 cells, resuming cells first and then cells outside home, 20 turns of total upkeep including the current roster, and the new Exact text with `{placeholders}` as that paragraph uses them;
     - the hoard part of the `treasuryAttention` paragraph: it shows whenever the treasury is deep, with both wordings;
     - item 11, **Keep production queued**: the sentence that names `buildCreditsCountGuidance` also says "unless the Mercenaries section says your credits are more than you need";
     - the Mercenaries section's description: the forecast paragraph's deep sentence, shown only with production on.
   - `information-decision-model.md`: the `MERCENARY_RAISE_ATTENTION` row (20 turns, up to 6 cells, roster upkeep counted) and the `TREASURY_ATTENTION` row (the hoard bullet no longer needs units under half their caps).
   - `crosswalk.md`: in the `# Mercenaries` row, after "a forecast paragraph of how many turns the treasury and credits queues cover upkeep", add that the paragraph also says the credits are more than needed when the treasury is deep and production is on.
   - `example-strategic-prompt.md`: replace the old credits-count sentence with the new Exact text, in place, on the same line. The file is over 600 lines, so add no line.
2. **`doc/hybrid-ai.md`:** after the paragraph that begins `The treasury forecast in a commander's briefing steps through each credits queue`, append to that paragraph one sentence: when production is on and `isTreasuryDeep` holds, the forecast also says the credits are more than needed. Nothing else in the file describes these bullets today; do not add more.
3. **`doc/README.md`:**
   - in the constants paragraph, the sentence that begins "A raise attention line reserves" also names `MERCENARY_RAISE_ATTENTION_MAX_CELLS` in the same file;
   - extend the `Release **3.6.0** …` paragraph with the README clause below.
4. **`doc/release-notes/v3.6.0.md`:** under `## What's in 3.6.0`, after the existing bullets, add **Exact**:
   - `- **Commanders spend their credits.** The mercenary flag now names up to six cells a turn, paused cities first, and raises until the treasury left covers 20 turns of upkeep.`
   - `- **Treasury advice that knows when to stop.** The treasury warning now appears whenever credits pile up, even for a side at its unit caps, and commanders are told to stop queuing credits once they hold more than they need.`
5. **`README.md`:** at the end of the `- **3.6.0** …` bullet, before its final period, add **Exact**: `, and makes commanders spend banked credits on mercenaries`. Do not change the version anywhere.
6. Run `node scripts/check-doc-links.cjs`.
7. Run the Phase Check plus `npm run check:renderer-types`, then `npm run rebuild:native:electron` last.
8. Fill in the Completion Log, and give the user the checklist below.

### Manual checklist for the user

Part of your final pass:

1. **Raise bullet.** With a rich side, its Attention Flags name several cells with counts, paused cities first. The hire orders in the debug log (`gameDb insertHireOrder`) follow it over several turns.
2. **Treasury.** The hoard bullet shows for a side at its caps with a deep treasury. Its Mercenaries forecast paragraph ends with the "more than you need" sentence.
3. **Paused cities.** Cells the raise bullet marks `(restarts its paused queue)` drop off Paused Queues the turn after the raise.
4. **Trend.** Over 10 turns, the rich sides' treasuries stop growing, or shrink, and their mercenary counts rise.
5. Run `npm run ui:smoke`.

### Verification

The Phase Check passes, `check-doc-links` passes, and the Completion Log is complete.

---

## Reliability Checklist

- [ ] `isTreasuryDeep` is the only deep-treasury test, used by the hoard bullet and the forecast sentence.
- [ ] `planMercenaryRaises` is pure and does not mutate its input.
- [ ] The raise bullet never names more than 6 cells. After its raises, the treasury still covers 20 turns of total upkeep (tested).
- [ ] With production off, the Mercenaries section never shows the deep sentence.
- [ ] `requestOrdersInjection.ts` changed only to read `.text`, plus comments. No bullet was added, removed, or reordered.
- [ ] The run-out and hoard bullets still never both appear. The raise bullet stays hidden while the run-out bullet shows.
- [ ] The system prompt's only change is the static credits-count paragraph (`systemPromptStability.test` passes). No heading, table, or column changed.
- [ ] Every Exact text matches character for character.
- [ ] `check:circular` prints no cycle. No plan vocabulary in code, tests, or `doc/`. The version is still 3.6.0.

## Success Definition

- A rich side is told to raise across several cells, paused cities first, until 20 turns of upkeep remain.
- The treasury warning reaches sides at their caps.
- The credits advice stops when credits are more than needed.
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
