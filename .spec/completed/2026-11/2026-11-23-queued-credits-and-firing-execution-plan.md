# Queued Credits Forecast, Firing Mercenaries, and Sight Cues Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Release 3.5.0. Release 3.4.2 was never published, so 3.5.0 replaces it and its release notes carry the 3.4.2 changes too. 3.5.0 adds five changes:

1. **Queued-credits forecast.** The treasury forecast steps through the coming turns. Each turn it uses each city's remaining credits items, its banked production points, and its urban cells, and it stops when the queue runs out. It replaces the per-turn income estimate, which counted a one-item credits queue as income every turn.
2. **Queued credits in the forecast.** The forecast paragraph says how many credits are still queued.
3. **Larger credits counts.** The production rules tell commanders that one credits item pays once, and to give a credits row a larger count for steady income.
4. **Sight cues follow fog.** In the Game Options popover, Sight cues is unchecked and disabled while Fog of war is unchecked.
5. **Commanders can fire mercenaries.** A new `dismiss_mercenary` production order fires a mercenary, the same way the human's Dismiss button does.
   - The rules warn of the consequences.
   - A new Firing Risk table names the home hexes where a fired mercenary could hand the hex to Neutral.
   - The engine refuses any fire, by a commander or by the human, that would by itself knock the side out.

**Shape:**
- Phase 0 records a baseline.
- Phase 1 adds the fire-risk rules and the knockout guard.
- Phase 2 lets commanders fire, drops orders for fired units, and teaches the rules.
- Phase 3 adds the Firing Risk table.
- Phase 4 replaces the forecast.
- Phase 5 adds the larger-count advice.
- Phase 6 links Sight cues to Fog of war.
- Phase 7 updates the docs, sets version 3.5.0, runs the final checks, and hands off.

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
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, `git mv`, `git rm`, or `git clean`. The user reviews every change.
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
$step = '1'
$files = @('src/main/gameActions/dismissMercenary.ts', 'src/main/gameActions/dismissMercenary.test.ts')
$backup = Join-Path $env:TEMP "aw-350\step-$step"
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

Tests that open a database load `better-sqlite3` under Node, and `npm install` builds it for Electron. Phase 0 runs `npm run rebuild:native:node`. Phase 7 runs `npm run rebuild:native:electron` last, so the app starts again.

- **Native module lock.** If a rebuild fails with `EBUSY` on `better_sqlite3.node`:
  1. close any running Electron app;
  2. rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`;
  3. run the rebuild again;
  4. delete the `.locked` file.

### Phase Check

Every phase from 1 to 7 ends with the Phase Check, run from the repo root:

```powershell
npm run build:main
npm run lint
npm run check:circular
```

- Add `npm run check:renderer-types` whenever the phase adds or edits a file under `src/shared` or `src/renderer`.
- Add `npm run build:renderer` whenever the phase edits a file under `src/renderer` or `static`.
- Then run every test file the phase adds and every existing test file it lists under **Tests to run**, and no others. All must pass.
  - Run a main-process test with `node dist/main/<path>.test.js`.
  - Run a shared test with `node dist/shared/<path>.test.js`.
- `check:circular` must print **no** cycle.
- A static check or a named test that already failed in Phase 0 is not yours to fix. A **new** failure is.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a check pass.
- **No test may call a real model.** Do not start the app.
- Record each Phase Check result in the Completion Log.

---

## Non-Goals

- **No minimum service time.** A mercenary can be fired on the turn it was hired.
- **No change to the human's Dismiss control or its labels.** The only human-visible change is the new knockout refusal, which reaches the human through the existing toast.
- **No new tool.** Commanders fire through `productionOrders` only. The `hire_mercenaries` tool does not get a dismiss action.
- **No Keep building for commanders.** The advice is about a larger count only.
- **No change to the economy rules.** Credits pricing, upkeep, hire fees, payroll, and desertion stay as they are.
- **No change to `computeHomeLossProgress`, the end-of-turn knockout rules, or hex control resolution.** The fire-risk projection reads the same inputs; it never writes control.
- **Sight cues stay as stored.** A saved match with fog off and sight cues on keeps its stored value until the player presses Apply in the in-match dialog.
  - Playback is not changed.
  - The engine does not force sight cues off.
- **The forecast is still an estimate:**
  - It reads only each queue's next entry. Commanders' queues hold one entry, because `set_build_queue` replaces the whole queue.
  - It does not see Keep building.
  - It assumes no queue, city, or mercenary changes this turn.
- **Files not to edit:**

  | File | Lines | Why |
  | --- | --- | --- |
  | `src/main/openRouter/consultPromptParts.ts` | 602 | Already over 600 |
  | `src/main/openRouter/requestOrdersApplyParsed.ts` | 776 | Already over 600 |
  | `src/main/openRouter/promptSpec/sectionHeadings.ts` | 615 | Already over 600 |
  | `src/renderer/chrome/controlTooltipText.ts` | 663 | Already over 600; importing from it is fine |
  | `src/main/openRouter/requestOrdersInjection.ts` | — | Not needed; its calls into `treasuryForecast.ts` keep their signatures |

- Do not edit anything under `.spec/completed/`, release notes of versions before 3.4.2, or the historical documents named in `AGENTS.md`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`.

- **Orienting comments.** Every new or changed declaration, and every field of an interface or parameter-object type, has a JSDoc block:
  - a one-line summary;
  - `Purpose:` (or `Contract:` for types and fields);
  - `When to use:`, `Expected outcome:`, and `Exceptions:`.

  Update every comment whose behavior this plan changes. Afterwards, no comment may still say:
  - that the forecast uses a per-turn income estimate;
  - that `buildMercenaryRule` has three paragraphs;
  - that only the human can dismiss a mercenary;
  - that `productionOrders` has three actions.

  No generic filler.
- **Logging (rule 02).** Only `src/main` logs.
  - Database readers and flow functions log `logDebug` on entry.
  - Pure helpers log `logTrace`.
  - Every refusal logs `logDebug` with the reason, as `refuse` in `dismissMercenary.ts` does.
  - Log seat ids, unit ids, hex ids, counts, and credits only.
- **Names.** Use the file and symbol names this plan gives. camelCase functions, PascalCase types, UPPER_SNAKE constants.
- **No plan vocabulary** in code, comments, test names, or `doc/`.
- **Seat ids:** no literals in production code. Use `NEUTRAL_OWNER_ID` for Neutral.
- **Size limits (rule 09).** Files should stay under 600 lines and must stay under 1000.
  - Each new file must stay under 350 lines.
  - Each edited file that is under 600 lines must stay under 600.
  - Record every final line count in the Completion Log.
- **Mutability (rule 13), arguments (rule 10):** at most 2 parameters, or one parameter object with a commented type. Pure functions never mutate their inputs.
- **Tests (rule 03).** Test contracts, not private helpers or call order. Copy the structure of the sibling test file named in each phase.
- **Reuse (rule 06).**
  - `fireWouldKnockOut` is the only place that decides whether a fire knocks a side out. The guard and the Firing Risk table both call it.
  - `projectCreditsQueues` is the only place that steps a treasury through coming turns.
- **Prompt structure.** Follow the Design's Prompt Layout map:
  - every new paragraph is its own block, separated by one blank line;
  - every new attention bullet is one line;
  - a pointer to another section uses that section's exact title, and says which part of the prompt it is in when two sections share a name;
  - the one new heading is `Firing Risk`.
- **Docs.** Phase 7 updates `doc/`, `README.md`, the release notes, and the bug template. Do not edit them earlier.

---

## Evidence From the 3.4.2 Match

From `debug.log` at turn 10:
- **Every credits purchase was a one-off.** All 131 credits purchases came from entries with `"remainingCount":1`. Each one pays 20 credits once, and then the queue is empty.
- **The 3.4.2 forecast counted such a queue as income every turn.**
  - Northern America, turn 9: forecast about 42 a turn, earned 20.
  - Eastern Asia, turn 9: forecast 20, earned nothing.
- **Banked points arrive in lumps.** Idle cities kept up to 190 production points, and one queued credits item spent 20 of them at once.
- **The run-out flag worked.** Western Europe on turn 8 and Northern America on turn 10 queued credits in the reply that followed it.
- **No commander can fire.** The only firing path is `executeDismissMercenary`, wired to the human seat.
- **A fired unit is a real Neutral unit.**
  - `resolveStrategicControlAfterCombatAndMovement` gives a hex to its only owner at the end of the turn, unless the hex is fortified.
  - `computeHomeLossProgress` counts a Neutral-held home hex as lost.
  - So a mercenary fired alone in a home hex hands that hex to Neutral and moves the side toward knockout.
- **Stale orders are possible.** A commander's reply is applied against the snapshot it was briefed with.
  - So a movement order, or an `assign_order`, for a unit fired in the same reply would still be stored.
  - `ai_pending_orders` and `standing_orders` would then hold rows for a unit that is now Neutral.

---

## Locked Decisions

1. **Firing is immediate.** A commander's `dismiss_mercenary` row calls the same conversion as the human's Dismiss button, during planning.
2. **Who may fire what.** A commander may not fire:
   - a mercenary aboard a ship (existing rule, every seat);
   - a ship with units aboard (new, commanders only).
3. **Knockout guard (every seat).** A fire is refused when it would by itself complete the side's knockout, as defined below. It applies to the human's Dismiss too.

   **Neutral-held after this turn.** A hex counts as Neutral-held after this turn when all of these hold:
   - the hex is controlled by the side;
   - it is not fortified;
   - a Neutral unit stands there, counting the unit being fired.

   This is conservative: it counts the hex even when the side's own units are also there.

   **The knockout test.** It uses the rules the end-of-turn check uses:
   - home loss through `computeHomeLossProgress`, by the share rule or the every-hex rule;
   - or the side holding no city hex (a controlled hex with current urban cells above 0).

   **"By itself".** The fire is refused when the knockout test is false without this fire and true with it.

   **Scope.** The guard runs only in a region-versus-region match with the seat active, the same scope as `knockoutStatusForSeat`. Otherwise there is no guard.
4. **Stale orders.** At each Ready, `gatherCommanderOrdersForReady` does two things for each seat:
   - before it reads the stored plan, it deletes that seat's `standing_orders` rows whose unit the seat no longer owns;
   - before it returns, it drops every order whose unit (and, for an embark, whose ship) the seat no longer owns.

   Ownership is read from the `units` table. If that read fails, the seat's orders are kept as they are, and the failure is logged.
5. **Firing Risk table.** It is shown only when all of these hold:
   - production is on;
   - the match is region versus region;
   - at least one of the seat's own mercenaries, not aboard a ship, stands in a home hex the seat controls that is not fortified.
6. **Queued-credits forecast.** For each controlled hex whose next queue entry is credits, the forecast reads:
   - the entry's remaining count;
   - the hex's stored points;
   - its urban cells. A neutral border counts 0.

   It skips occupation-paused and `buildPaused` hexes, as 3.4.2 does.

   **Each turn, in order:**
   1. each hex adds its urban cells to its points;
   2. it buys as many credits items as its points and remaining count allow;
   3. upkeep is paid.

   **The result:**
   - `coverTurns` is the number of payrolls covered, starting with this turn's.
   - When every queue is empty, the remaining treasury covers `Math.floor(treasury / upkeep)` more.
   - It is `null` when upkeep is 0, or when upkeep is still paid after `TREASURY_FORECAST_HORIZON_TURNS` (100) turns.
   - `queuedCredits` is the sum of remaining items × `CREDITS_PER_ITEM`.
7. **Sight cues.** While Fog of war is unchecked, Sight cues is unchecked, disabled, and shows the T1 tip.
   - In the new-game options, checking Fog again restores the value Sight cues had before, and its normal tip.
   - In the in-match dialog, a match with fog off shows Sight cues unchecked and disabled. Fog is locked there.
8. **Release.** Version 3.5.0. `doc/release-notes/v3.4.2.md` becomes `v3.5.0.md`, with the 3.4.2 bullets kept under 3.5.0, and the README's 3.4.2 bullet becomes a 3.5.0 bullet. Nothing is committed.

---

## Design

### Module `src/main/gameActions/mercenaryFireRisk.ts` (Phase 1)

**Pure part:**

```ts
export interface FireRiskInputs {
  readonly ownerSeatId: SeatId;
  readonly homeHexes: readonly string[];
  readonly controlByHex: ReadonlyMap<string, string | null | undefined>;
  readonly fortifiedByHex: ReadonlyMap<string, number>;
  readonly urbanByHex: ReadonlyMap<string, number>;      // current urban cells, for the no-city-hex rule
  readonly neutralHexes: ReadonlySet<string>;            // hexes where a Neutral unit stands now
  readonly baselineUrbanCellsForHex: (h3Index: string) => number;
  readonly minUrbanShare: number | null;
}

/** Copy of controlByHex where each owner-held, unfortified hex with a Neutral unit (now or in `extra`) is Neutral. */
export function controlAfterNeutralTakeover(inputs: FireRiskInputs, extra: ReadonlySet<string>): Map<string, string | null | undefined>;
export function projectedHomeLoss(inputs: FireRiskInputs, extra: ReadonlySet<string>): HomeLossProgress;   // computeHomeLossProgress on that copy
export function projectedCityHexCount(inputs: FireRiskInputs, extra: ReadonlySet<string>): number;         // owner-held hexes with urbanByHex > 0 on that copy
/** Locked Decision 3: false before this fire, true with it. */
export function fireWouldKnockOut(inputs: FireRiskInputs, h3Index: string): boolean;
```

- `extra` is the set of hexes where a fire is being considered.
- A side is knocked out by the projection when `projectedHomeLoss(...).homeLost || projectedCityHexCount(...) === 0`.
- `fireWouldKnockOut` computes that with `extra = new Set()` and with `extra = new Set([h3Index])`.

**Database part:**

```ts
/** Null unless the match is region versus region and the seat is active. Logs logDebug. */
export function readFireRiskInputs(seatId: SeatId): FireRiskInputs | null;
```

It reads the same sources as `knockoutStatusForSeat`:

| Input | Source |
| --- | --- |
| scenario | `loadScenarioState({ getOne: dbGetOne })` |
| seat | `getSeatRoster()`, active means `outTurn === null` |
| home hexes | `getScenarioHomeRegionHexes(seat.homeRegion)` |
| control | `getHexControlMap()` |
| fortified and urban counts | `listStrategicInfrastructureRows()` |
| share | `effectiveControlWinMinUrbanShare()` |
| baseline cells | `baselineUrbanCellsForControlWin(h3, share)` |
| Neutral hexes | `dbGetAll('SELECT DISTINCT h3_index AS h3Index FROM units WHERE player = ?', [NEUTRAL_OWNER_ID])` |

### Refusal reasons (Phase 1 and 2) — Exact

Add both to `src/shared/mercenaryDismiss.ts`, each with an orienting comment:

- `DISMISS_REASON_KNOCKOUT = 'Firing this mercenary would let Neutral take enough of your home or cities to knock you out.'`
- `DISMISS_REASON_SHIP_CARGO = 'A ship with units aboard cannot be fired. Unload it first.'`

### Envelope row (Phase 2)

- **The new action.** `productionOrders` gains `{"action":"dismiss_mercenary","unitId":"<id>"}`.
- **`productionOrders.ts`.** It accepts the row like `rehire_mercenary` and drops it with this reason when the unit id is missing. **Exact:** `` `${prefix}: dismiss_mercenary requires unitId.` ``
- **Schema.** `PRODUCTION_ORDER_ACTIONS` lists the action, and it uses the `unitId`-only row schema, as rehire does.

### Rules text (Phase 2) — Exact

**E1.** Set `MERCENARY_ENVELOPE_ROWS_SENTENCE` (`gameRuleMercenaryText.ts`) to:

`To hire, add {"action":"raise_mercenaries","hex":"<code>","unitType":"infantry","count":1} or {"action":"rehire_mercenary","unitId":"<id>"} rows to productionOrders. To fire a mercenary, add {"action":"dismiss_mercenary","unitId":"<id>"}.`

**R4 and R5.** `buildMercenaryRule()` gains two paragraphs after its third, so it returns five paragraphs joined by `'\n\n'`:

- **R4:** `To fire a mercenary, add a dismiss_mercenary row to productionOrders. It turns Neutral at once, in its cell, with a defend order. Its upkeep stops, and any order you gave it this turn is dropped. You cannot fire a mercenary aboard a ship, or a ship with units aboard. While you can see a fired unit, you can rehire it for two turns of its upkeep.`
- **R5:** `A fired unit left alone in a cell takes the cell for Neutral at the end of the turn unless the cell is fortified. One that shares a cell with your units fights them at the next resolution. Neutral-held home hexes count toward your knockout, and a city Neutral takes no longer counts as yours. A fire that would knock you out is refused. When a Firing Risk table appears under Mercenaries in your briefing, it names the home hexes where firing is dangerous.`

**W2.** Set `MERCENARY_FUNDS_WARNING_ACTION` to:

`Queue more credits, and do not raise or rehire mercenaries this turn. Firing a mercenary you can spare also stops its upkeep.`

`buildMercenaryUpkeepRule` (production off) is unchanged. That seat cannot send production orders.

### Firing Risk table (Phase 3) — Exact

**Placement.** The table is a subsection of the Mercenaries section, placed directly after Your Mercenaries.
- Heading: `subHeading(SECTION_TITLE_FIRING_RISK)`.
- `SECTION_TITLE_FIRING_RISK = 'Firing Risk' as const` is exported from the new module `briefingSectionsMercenaryFiring.ts`, because `sectionHeadings.ts` is not edited.

**Rows.** One per home hex that meets Locked Decision 5:
- **Sort:** refused rows first, then original urban cells descending, then hex id.
- **Limit:** at most `MERCENARY_BRIEFING_MAX_ROWS` rows, then `` `…and ${hidden} more.` ``.

**Opening paragraph.** Let `loss = projectedHomeLoss(inputs, new Set())`.
- **Share rule** (`loss.everyHexRule === false`): `` `A fired mercenary left alone in one of these home hexes hands it to Neutral at the end of the turn. Other sides and Neutral hold ${loss.lostUrbanCells} of your home's ${loss.totalUrbanCells} original urban cells, counting home hexes Neutral units already stand in. You are knocked out if they reach ${loss.neededUrbanCells}.` ``
- **Every-hex rule:** `` `A fired mercenary left alone in one of these home hexes hands it to Neutral at the end of the turn. Other sides and Neutral hold ${loss.lostHexes} of your ${loss.totalHexes} home hexes, counting home hexes Neutral units already stand in. You are knocked out if they hold all of them.` ``

**Table.**

| Column | Content |
| --- | --- |
| `Home Hex` | `format(h3Index)` |
| `Original Urban Cells` | `inputs.baselineUrbanCellsForHex(h3Index)` |
| `Your Mercenaries` | The seat's mercenary ids there, sorted. At most 4 are shown, then `` `, +${n} more` `` |
| `If Fired` | `refused: knocks you out` when `fireWouldKnockOut(inputs, h3Index)`; otherwise `fights your units there; Neutral takes it if it wins` when a unit of the seat that is not a mercenary stands in the hex; otherwise `Neutral takes it at the end of the turn` |

Build the table with `buildPromptTableLines`, as the other Mercenaries tables do.

**Example (Exact layout).** Shown as the precomputed briefing prints it, one level below `## Mercenaries`. The block itself is built with `subHeading`, so it begins `## Firing Risk` before that shift.

```text
### Firing Risk

A fired mercenary left alone in one of these home hexes hands it to Neutral at the end of the turn. Other sides and Neutral hold 30 of your home's 120 original urban cells, counting home hexes Neutral units already stand in. You are knocked out if they reach 60.

| Home Hex | Original Urban Cells | Your Mercenaries | If Fired |
| --- | --- | --- | --- |
| JT | 34 | a4-i18, a4-i19 | refused: knocks you out |
| I8 | 6 | a4-i10 | fights your units there; Neutral takes it if it wins |
```

### Forecast (Phase 4)

**Constant:** `TREASURY_FORECAST_HORIZON_TURNS = 100`.

**Type and functions (sketch):**

```ts
export interface CreditsQueueRow {
  readonly h3Index: string;
  readonly remainingItems: number;   // nextRemainingCount, at least 1
  readonly storedPoints: number;     // at least 0
  readonly pointsPerTurn: number;    // urban cells; 0 on a neutral border
}
export function creditsQueueRowsForSeat(state: GameStateSnapshot, seatId: string): readonly CreditsQueueRow[];
export function projectCreditsQueues(args: {
  readonly credits: number;
  readonly upkeepPerTurn: number;
  readonly rows: readonly CreditsQueueRow[];
  readonly itemCost: number;         // creditsItemCost()
  readonly creditsPerItem: number;   // CREDITS_PER_ITEM
  readonly horizonTurns: number;     // TREASURY_FORECAST_HORIZON_TURNS
}): { readonly coverTurns: number | null; readonly queuedCredits: number };

export interface TreasuryForecast {
  readonly credits: number;
  readonly upkeepPerTurn: number;
  readonly queuedCredits: number;
  readonly coverTurns: number | null;
}
```

**Changes to the existing module:**
- `incomePerTurn`, `estimateCreditsIncomePerTurn`, and `treasuryCoverTurns` are removed.
- `buildTreasuryForecast(state, seatId)` keeps its signature. It now calls the two functions above.
- `creditsQueueRowsForSeat` keeps the 3.4.2 filters:
  - the hex is controlled by the seat;
  - `nextUnitType === CREDITS_QUEUE_ITEM`;
  - the row is not `buildPaused`;
  - the hex is not in `listOccupationPausedHexes`.

  `pointsPerTurn` is 0 when `isNeutralBorderHex`. Rows with a null or non-positive `nextRemainingCount` are skipped.

**Projection sketch:**

```ts
const queuedCredits = rows.reduce((sum, row) => sum + row.remainingItems * creditsPerItem, 0);
if (upkeepPerTurn <= 0) return { coverTurns: null, queuedCredits };
const live = rows.map((row) => ({ points: row.storedPoints, left: row.remainingItems, perTurn: row.pointsPerTurn }));
let treasury = Math.max(0, credits);
for (let turn = 1; turn <= horizonTurns; turn += 1) {
  for (const row of live) {
    row.points += row.perTurn;
    const bought = Math.min(row.left, Math.floor(row.points / itemCost));
    row.points -= bought * itemCost;
    row.left -= bought;
    treasury += bought * creditsPerItem;
  }
  if (treasury < upkeepPerTurn) return { coverTurns: turn - 1, queuedCredits };
  treasury -= upkeepPerTurn;
  if (live.every((row) => row.left === 0)) return { coverTurns: turn + Math.floor(treasury / upkeepPerTurn), queuedCredits };
}
return { coverTurns: null, queuedCredits };
```

### Forecast sentence — Exact

Let:
- `q = forecast.queuedCredits`, `u = forecast.upkeepPerTurn`, `n = forecast.coverTurns`, `H = TREASURY_FORECAST_HORIZON_TURNS`;
- `turns` be `'1 more turn'` when `n === 1`, and otherwise `` `${n} more turns` ``.

| Case | Sentence |
| --- | --- |
| `u === 0 && q === 0` | `''` |
| `u === 0 && q > 0` | `` `Your credits queues hold ${q} more credits.` `` |
| `u > 0 && q > 0 && n === null` | `` `Your credits queues hold ${q} more credits. With them, the treasury covers upkeep for at least ${H} more turns.` `` |
| `u > 0 && q > 0 && n >= 1` | `` `Your credits queues hold ${q} more credits. With them, the treasury covers upkeep for ${turns}.` `` |
| `u > 0 && q > 0 && n === 0` | `` `Your credits queues hold ${q} more credits, but the treasury cannot cover this turn's upkeep.` `` |
| `u > 0 && q === 0 && n >= 1` | `` `No credits are queued, so the treasury covers upkeep for ${turns}.` `` |
| `u > 0 && q === 0 && n === 0` | `` `No credits are queued, and the treasury cannot cover this turn's upkeep.` `` |

`u > 0 && q === 0` always gives a finite `n`, so there is no null row for it.

**Effect on the funds warning.** The warning in the Mercenaries section still shows exactly when `coverTurns === 0`. It now waits for this turn's actual purchases instead of an urban-cell rate.

### Run-out bullet — Exact

`tail` = `Queue more credits, with a larger count or in more cities, raise no more mercenaries, or fire the ones you can spare. Otherwise random mercenaries desert to Neutral.`

- `n >= 1`: `` `Treasury: your ${credits} credits and the ${q} credits still queued pay your ${u} credits of mercenary upkeep for only ${turns}. ${tail}` ``
- `n === 0`: `` `Treasury: your ${credits} credits and this turn's credits cannot pay this turn's ${u} credits of mercenary upkeep. ${tail}` ``

The conditions are unchanged: `n !== null && n <= TREASURY_RUN_OUT_WARNING_TURNS`. The hoard bullet is unchanged.

### Larger-count advice P2 (Phase 5) — Exact

Add `buildCreditsCountGuidance()` to `gameRuleMercenaryText.ts`. It returns, with `cost = creditsItemCost()`:

`` `A credits row adds ${CREDITS_PER_ITEM} credits for each ${cost} production points it spends, and it stops when its count runs out. For steady income, give it a larger count. A city makes one production point per city cell each turn, so a count of 10 in a city with ${cost} city cells lasts about 10 turns.` ``

In `coachingTextStrategic.ts`:
- `PRODUCTION_BULLET` becomes a function `productionBullet(): string`. It returns the same text with `` `\n\n  ${buildCreditsCountGuidance()}` `` inserted right after the paragraph that starts `Keep enough credits coming in`.
- The cost comes from the active map, so the bullet must be built when the prompt is built, not when the module loads.

### Sight cues (Phase 6)

**Pure rule `src/shared/sightCuesFogRule.ts`:**

```ts
export interface SightCuesControlState {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly rememberedChecked: boolean | null;   // non-null only while fog has disabled the box
}
/** Fog off: remember and lock (once). Fog on: unlock and restore (once). Otherwise unchanged. */
export function sightCuesAfterFogChange(args: { readonly fogOn: boolean; readonly current: SightCuesControlState }): SightCuesControlState;
```

**T1 — Exact.** Export `SIGHT_CUES_FOG_OFF_TOOLTIP`, with an orienting comment:

`Sight cues need Fog of war. Check Fog of war to use them.`

**Renderer module `src/renderer/gameplay/newGameSightCuesUi.ts`:**
- `syncNewGameSightCuesWithFog()` reads both boxes and applies `sightCuesAfterFogChange`. It keeps `rememberedChecked` in a module variable and sets the tip:
  - `SIGHT_CUES_FOG_OFF_TOOLTIP` while disabled;
  - `sightCuesCheckboxTooltipText`, imported from `controlTooltipText.ts`, once enabled again.
- `lockSightCuesWhenFogOff()` is for the in-match dialog. When Fog is unchecked, it unchecks and disables Sight cues and sets T1. It never touches the remembered value.
- `registerFogSightCuesLink()` adds one `change` listener to `#new-game-fog-checkbox` that calls `syncNewGameSightCuesWithFog()`.

### Prompt Layout

Every prompt change, where it appears, and how it is laid out. Two sections are both called Mercenaries:
- the rules section, `## Mercenaries` under `# Rules` in the system message;
- the briefing section, `# Mercenaries`, or `## Mercenaries` once the precomputed briefing shifts headings.

| Text | Where | Layout |
| --- | --- | --- |
| R4, R5 | Rules `## Mercenaries`, after its three existing paragraphs. The `rules("mercenaries")` tool returns the same text. | Paragraphs 4 and 5, each one line, joined by `'\n\n'`. No new heading. |
| E1 | The production envelope sentence, wherever `MERCENARY_ENVELOPE_ROWS_SENTENCE` is printed today | One line. Its second sentence names the new row. |
| P2 | `## Production Queues` under `# Orders Guidance`, inside the production bullet, right after the `Keep enough credits coming in` paragraph | A continuation paragraph of that bullet: `'\n\n  '`, the same blank line and two-space indent as the bullet's other paragraphs. |
| Forecast sentence | Briefing Mercenaries section, after the `Treasury:` line, as now | Its own paragraph, as in 3.4.2. Two sentences at most. |
| W2 | Briefing Mercenaries section, the warning paragraph after the forecast, as now | One paragraph: `MERCENARY_FUNDS_WARNING`, a space, W2. |
| Firing Risk | Briefing Mercenaries section, a `subHeading` placed after Your Mercenaries and before Rehire Candidates | Heading, blank line, opening paragraph, blank line, table, then the more-line on its own line. No triple newline before or after. |
| Run-out bullet | Attention Flags, in the same slot as in 3.4.2 | One bullet on one line. |

Headings in the briefing Mercenaries section:

```text
## Mercenaries
### Your Mercenaries
### Firing Risk          (new; only when Locked Decision 5 holds)
### Rehire Candidates
### Raise Options
```

Without a precomputed briefing, the same headings print one level higher (`#` and `##`).

---

## Phase 0 — Baseline

**Goal:** Record the starting state.

### Steps

1. Run `npm run rebuild:native:node`. Then run `npm run build:main`, `npm run lint`, `npm run check:circular`, `npm run check:renderer-types`, and `npm run build:renderer`. Record each result.
2. Run each existing test file named under **Tests to run** in Phases 1 to 6 once, and record any that already fail.
3. Confirm `"version": "3.4.2"` in `package.json`, and that `doc/release-notes/v3.4.2.md` exists.
4. Confirm these anchors exist exactly once. Stop if one is missing.

   | Anchor | File |
   | --- | --- |
   | `function refusalFor(seatId: SeatId, unitId: string): DismissMercenaryResult \| null {` | `src/main/gameActions/dismissMercenary.ts` |
   | `if (action !== 'set_build_queue' && action !== 'raise_mercenaries') {` | `src/main/productionOrders.ts` |
   | `if (order.action === 'rehire_mercenary') {` | `src/main/openRouter/productionOrdersApply.ts` |
   | `const PRODUCTION_ORDER_ACTIONS = ['set_build_queue', 'raise_mercenaries', 'rehire_mercenary'] as const;` | `src/main/openRouter/promptSpec/envelopeJsonSchema.ts` |
   | `export const MERCENARY_ENVELOPE_ROWS_SENTENCE =` | `src/main/openRouter/promptSpec/gameRuleMercenaryText.ts` |
   | `const stored = takePending(seatId);` | `src/main/openRouter/commanderReadyGather.ts` |
   | `lines.push('', subHeading(SECTION_TITLE_YOUR_MERCENARIES), '', mercenaryTable(mercenaries, format));` | `src/main/openRouter/briefingSectionsMercenaries.ts` |
   | `export function estimateCreditsIncomePerTurn(` | `src/main/openRouter/treasuryForecast.ts` |
   | `const PRODUCTION_BULLET =` and `const production = gates.productionEnabled ? [PRODUCTION_BULLET] : [];` | `src/main/openRouter/promptSpec/coachingTextStrategic.ts` |
   | `export function lockOptionControls(editable: boolean, currentTurn: number): void {` | `src/renderer/gameplay/matchOptionsControls.ts` |
   | `export function resetNewGameOptionControls(): void {` | `src/renderer/gameplay/newGameOptionsUi.ts` |
   | `registerGameSizeSelect();` | `src/renderer/gameplay/newGame.ts` |

5. Record the line counts of every file this plan edits.

### Verification

The Phase 0 Inventory is filled in.

---

## Phase 1 — Fire Risk and the Knockout Guard

**Goal:** Locked Decision 3, with the Design's module and `DISMISS_REASON_KNOCKOUT`.

**Adds:** `src/main/gameActions/mercenaryFireRisk.ts`, `src/main/gameActions/mercenaryFireRisk.test.ts`

**Edits:**
- `src/shared/mercenaryDismiss.ts`
- `src/main/gameActions/dismissMercenary.ts`
- `src/main/gameActions/dismissMercenary.test.ts`

### Steps

1. Write `mercenaryFireRisk.ts` as in the Design.
   - Import `computeHomeLossProgress` and `HomeLossProgress` from `./homeControlProgress`.
   - Import `baselineUrbanCellsForControlWin` and `effectiveControlWinMinUrbanShare` from `./endOfTurnOutcome`, as `knockoutStatus.ts` does.
   - The pure functions never mutate `inputs`.
2. Add `DISMISS_REASON_KNOCKOUT` (Exact) to `src/shared/mercenaryDismiss.ts`.
3. In `dismissMercenary.ts`:
   1. Extend the unit read in `refusalFor` to also select `h3_index AS h3Index`.
   2. After the embarked check, add:

      ```ts
      const risk = readFireRiskInputs(seatId);
      if (risk && fireWouldKnockOut(risk, unit.h3Index)) return refuse(seatId, unitId, DISMISS_REASON_KNOCKOUT);
      ```

   3. Update the file header: the function serves any seat, and a fire that would knock the side out is refused.

### Tests

**`mercenaryFireRisk.test.ts`, pure cases.** Build `FireRiskInputs` by hand: three home hexes A, B, C with baseline 10 cells each, share 0.5 (needed 15), and an owner seat from `AI_SEAT_IDS[0]`. Also give the owner a non-home city hex D with urban 5.
1. `firing in an owned unfortified home hex that reaches the share knocks out`:
   - A is held by another seat, so 10 cells are lost;
   - B and C are the owner's;
   - `fireWouldKnockOut(inputs, B)` is true.
2. `a fortified hex, or a hex the side does not hold, never knocks out`:
   - B fortified gives false;
   - firing in A, which is already lost, gives false.
3. `a Neutral unit already in a home hex counts before the fire`:
   - with B in `neutralHexes`, the fire in C is false, because the side is already lost without it;
   - `projectedHomeLoss(inputs, new Set()).lostUrbanCells` is 20.
4. `the every-hex rule needs every home hex`:
   - with `minUrbanShare: null`, A and B held by others, and C the owner's, firing in C is true;
   - with only A held by others, firing in C is false.
5. `firing in the last city hex knocks out`:
   - the owner still controls A, B, and C, so its home is not lost;
   - their current urban cells are 0 in `urbanByHex` (rubble), while their baseline stays 10;
   - D is the owner's only hex with urban above 0;
   - firing in D is true, and firing in B is false.
6. `the inputs are not mutated`: the maps and set are unchanged after the calls.

**`dismissMercenary.test.ts`, keep the existing cases and add two:**
1. `a fire that would knock the side out is refused and changes nothing`. Use `withTempGameDb` and `HUMAN_SEAT_ID`, so the existing `unitRow` helper applies.
   1. Assert `readFireRiskInputs(HUMAN_SEAT_ID)` is non-null. The default temp match is region versus region.
   2. Sort the human's home hexes by baseline cells, smallest first. Hand them one at a time to an AI seat with `setHexController`.
      - After each change, re-read the inputs.
      - If `projectedHomeLoss(inputs, new Set()).homeLost` became true, give that hex back to the human and stop. That hex is X.
      - Under the every-hex rule, the loop stops at the last home hex.
   3. Make sure X has no fortification, using `dbRun` on `res_s_infrastructure`, and insert one human mercenary at X.
   4. Assert the precondition `fireWouldKnockOut(readFireRiskInputs(HUMAN_SEAT_ID)!, X) === true`.
   5. `executeDismissMercenary(HUMAN_SEAT_ID, id)` returns `{ success: false, reason: DISMISS_REASON_KNOCKOUT }`, and the unit is still the human's mercenary.
2. `a fire in a safe hex still succeeds`: the existing first case already covers this. Add an assertion there that `readFireRiskInputs(HUMAN_SEAT_ID)` gives `fireWouldKnockOut(...) === false` for its hex.

**Tests to run:** `dist/main/gameActions/mercenaryFireRisk.test.js`, `dist/main/gameActions/dismissMercenary.test.js`, `dist/main/gameActions/knockoutStatus.test.js`

### Verification

Phase Check, plus `npm run check:renderer-types` (`src/shared` edited).

---

## Phase 2 — Commanders Can Fire

**Goal:** Locked Decisions 1, 2, and 4, plus the rules text E1, R4, R5, and W2.

**Adds:**
- `src/main/gameDb/seatUnitOwnership.ts`
- `src/main/gameDb/seatUnitOwnership.test.ts`
- `src/main/gameActions/ownerTurnOrders.test.ts` (only if it does not exist; otherwise edit it)

**Edits:**
- `src/shared/mercenaryDismiss.ts`
- `src/main/gameActions/dismissMercenary.ts`, `src/main/gameActions/dismissMercenary.test.ts`
- `src/main/productionOrders.ts`, `src/main/productionOrders.test.ts`
- `src/main/openRouter/productionOrdersApply.ts`
- `src/main/openRouter/promptSpec/envelopeJsonSchema.ts`, `src/main/openRouter/promptSpec/envelopeJsonSchema.test.ts`
- `src/main/openRouter/promptSpec/gameRuleMercenaryText.ts`, `src/main/openRouter/promptSpec/gameRuleMercenaryText.test.ts`
- `src/main/gameActions/ownerTurnOrders.ts`
- `src/main/openRouter/commanderReadyGather.ts`, `src/main/openRouter/commanderReadyGather.test.ts`

### Steps

1. Add `DISMISS_REASON_SHIP_CARGO` (Exact) to `mercenaryDismiss.ts`.
2. In `dismissMercenary.ts`, add `executeCommanderDismissMercenary(seatId: SeatId, unitId: string): DismissMercenaryResult`:
   - When `listCargoUnitIdsForShip(unitId).length > 0`, refuse with `DISMISS_REASON_SHIP_CARGO`.
   - Otherwise return `executeDismissMercenary(seatId, unitId)`.
   - It logs `logDebug` on entry.
3. **`productionOrders.ts`:**
   - add `{ readonly action: 'dismiss_mercenary'; readonly unitId: string }` to the `ProductionOrder` union;
   - in `normalizeProductionOrders`, accept `dismiss_mercenary` exactly as `rehire_mercenary` is accepted, with the Exact drop reason;
   - update the union's and the function's comments.
4. **`productionOrdersApply.ts`:** before the rehire branch, add:

   ```ts
   if (order.action === 'dismiss_mercenary') {
     const result = executeCommanderDismissMercenary(seatId, order.unitId);
     if (result.success) appliedCount += 1;
     else droppedReasons.push(`production dismiss_mercenary @ ${order.unitId}: ${result.reason}`);
     continue;
   }
   ```

   Update the file header: a fire row converts the unit immediately.
5. **`envelopeJsonSchema.ts`:**
   - append `'dismiss_mercenary'` to `PRODUCTION_ORDER_ACTIONS`;
   - in `productionOrderRowSchema`, use the `unitId`-only row for `rehire_mercenary` and for `dismiss_mercenary`.
6. **`gameRuleMercenaryText.ts`:**
   - apply E1 and W2;
   - add R4 and R5 to `buildMercenaryRule`;
   - update its comment to five paragraphs.
7. **`ownerTurnOrders.ts`:** add a pure function with an orienting comment:

   ```ts
   export function keepOrdersForOwnedUnits(orders: OwnerTurnOrders, ownedUnitIds: ReadonlySet<string>): OwnerTurnOrders;
   ```

   - It keeps a row of each list only when its `unitId` is owned. An embark row also needs its `navalUnitId` owned.
   - It returns a new object. An absent `airDropOrders` stays absent.
   - It logs `logTrace` with the kept and dropped counts.
8. **`seatUnitOwnership.ts`:** two database functions, each with an orienting comment and a `logDebug` on entry.

   ```ts
   /** Ids of every unit the seat owns now, embarked units included. */
   export function listUnitIdsOwnedBy(ops: BasicDbOps, seatId: string): ReadonlySet<string>;
   /** Deletes the seat's standing orders for units it no longer owns, and returns how many. */
   export function deleteStandingOrdersForUnitsNotOwned(ops: BasicDbOps, seatId: string): number;
   ```

   - `listUnitIdsOwnedBy` runs `SELECT id FROM units WHERE player = ?`.
   - `deleteStandingOrdersForUnitsNotOwned`:
     - counts the rows with `SELECT COUNT(*) AS n FROM standing_orders WHERE player_id = ? AND unit_id NOT IN (SELECT id FROM units WHERE player = ?)`;
     - deletes the same rows;
     - logs the seat and the count.

   Ownership comes from the database, not from `args.getGameStateForPlayer`. That read is fogged, and it is allowed to throw.
9. **`commanderReadyGather.ts`:**
   - At the top of the per-seat loop, before `takePending`, call `deleteStandingOrdersForUnitsNotOwned(gameDbOps, seatId)`. Wrap the call in `try`/`catch` that logs `logError` and carries on.
   - After the final `mergeOperationTurnOrders` loop, add one more loop over `orders`:

     ```ts
     for (const [seatId, seatOrders] of orders) {
       try {
         orders.set(seatId, keepOrdersForOwnedUnits(seatOrders, listUnitIdsOwnedBy(gameDbOps, seatId)));
       } catch (err) {
         logError('commanderReadyGather could not filter orders by ownership', { seatId }, err);
       }
     }
     ```

     A failed ownership read keeps that seat's orders as they are. This matches how the merge loop handles a failed state read.
   - Update the function comment. It must name both steps.

### Tests

**`productionOrders.test.ts`:**
- a `dismiss_mercenary` row with a unit id is accepted;
- one without a unit id is dropped with the Exact reason.

**`envelopeJsonSchema.test.ts`:**
- the `productionOrders` items schema includes `dismiss_mercenary`;
- its row requires exactly `action` and `unitId`.

Keep `testTaughtExamplesFitSchema` passing.

**`gameRuleMercenaryText.test.ts`:**
- `buildMercenaryRule().split('\n\n')` has 5 parts, and parts 4 and 5 equal R4 and R5;
- no part contains `'\n'`, so each paragraph is one line;
- `MERCENARY_ENVELOPE_ROWS_SENTENCE` equals E1;
- `MERCENARY_FUNDS_WARNING_ACTION` equals W2.

**`dismissMercenary.test.ts`:** `executeCommanderDismissMercenary` refuses a loaded ship with `DISMISS_REASON_SHIP_CARGO` and converts nothing. Reuse the ship setup of the existing ship case.

**`ownerTurnOrders.test.ts`:**
- orders for units outside the owned set are dropped from every list;
- an embark onto an unowned ship is dropped;
- the input is unchanged.

**`seatUnitOwnership.test.ts`:** with `withTempGameDb`:
- `listUnitIdsOwnedBy` returns exactly the seat's unit ids;
- insert two `standing_orders` rows for a seat, one for its own unit and one for a unit that is now Neutral. `deleteStandingOrdersForUnitsNotOwned` returns 1, and only the own unit's row remains.

**`commanderReadyGather.test.ts`:** the existing cases store plans for made-up unit ids (`stored-unit`, `` `late-${seat}` ``, `kept-unit`, `other-unit`). The ownership filter would now drop them.
- In each case, insert a real unit row owned by the matching seat before the gather. Use `insertUnitRow` from `../gameDb/unitInsert`, on a hex from `SELECT h3_index AS h3Index FROM hexes LIMIT 1`.
- Keep every existing assertion.
- Add `orders for a unit the seat no longer owns are dropped at Ready`:
  - store a plan with two movement orders, one for a unit the seat owns and one for a unit owned by `NEUTRAL_OWNER_ID`;
  - after the gather, only the first order is left.
- The throwing-state case must still keep `kept-unit`, because ownership is read from the database.

**Tests to run:**
- `dist/main/productionOrders.test.js`
- `dist/main/openRouter/promptSpec/envelopeJsonSchema.test.js`
- `dist/main/openRouter/promptSpec/gameRuleMercenaryText.test.js`
- `dist/main/gameActions/dismissMercenary.test.js`
- `dist/main/gameActions/ownerTurnOrders.test.js`
- `dist/main/gameDb/seatUnitOwnership.test.js`
- `dist/main/openRouter/commanderReadyGather.test.js`
- `dist/main/openRouter/briefingSectionsMercenaries.test.js`
- `dist/main/tools/referenceTools.test.js`

### Verification

Phase Check, plus `npm run check:renderer-types`.

---

## Phase 3 — The Firing Risk Table

**Goal:** Locked Decision 5 and the Design's table.

**Adds:** `src/main/openRouter/briefingSectionsMercenaryFiring.ts`, `src/main/openRouter/briefingSectionsMercenaryFiring.test.ts`

**Edits:** `src/main/openRouter/briefingSectionsMercenaries.ts`

### Steps

1. Write `briefingSectionsMercenaryFiring.ts`:
   - export `SECTION_TITLE_FIRING_RISK`;
   - export `buildMercenaryFiringRiskBlock(args: { readonly state: GameStateSnapshot; readonly ownSeat: SeatId; readonly format: (h3Index: string) => string }): string`.

   It returns `''` or the subsection: heading, blank line, opening paragraph, blank line, table, and the more-line when needed.
   - It calls `readFireRiskInputs`, `projectedHomeLoss`, and `fireWouldKnockOut` from Phase 1.
   - It reads the seat's mercenaries from `state.units` (`player === ownSeat`, `isMercenary === true`, `embarkedOnCarrierUnitId == null`).
   - It catches and logs any error, and returns `''` so a briefing never fails.
2. In `briefingSectionsMercenaries.ts`, after the anchored Your Mercenaries line, add:

   ```ts
   if (options.productionEnabled && mercenaries.length > 0 && isSeatId(ownSeat)) {
     const firing = buildMercenaryFiringRiskBlock({ state, ownSeat, format });
     if (firing.length > 0) lines.push('', firing);
   }
   ```

   Use the same seat-id narrowing the file already uses. If it has none, use `isSeatId` from `../../shared/seatIds`.
3. Update the comment of `buildMercenariesBriefingBlock`: Firing Risk follows Your Mercenaries when a mercenary stands in an at-risk home hex.

### Tests

`briefingSectionsMercenaryFiring.test.ts`, with `withTempGameDb`, in the style of `briefingSectionsMercenaries.test.ts`:
1. `a mercenary in an owned home hex gets a Firing Risk row`:
   - the block starts with `` `${subHeading(SECTION_TITLE_FIRING_RISK)}\n\n` ``. Before the precomputed briefing shifts it, this is `## Firing Risk`;
   - the opening paragraph matches the share or every-hex Exact text for that match;
   - the row reads `Neutral takes it at the end of the turn`;
   - after a regular (non-mercenary) unit of the seat is inserted in the same hex, the row reads `fights your units there; Neutral takes it if it wins`.
2. `a fortified hex, a non-home hex, or an embarked mercenary gives no block`:
   - set the hex's `fortified_count` above 0 with `dbRun` and expect `''`;
   - put the mercenary outside the home and expect `''`;
   - pass a state copy in which that mercenary has `embarkedOnCarrierUnitId` set and expect `''`.
3. `a fire that would knock out is marked refused`: use the greedy setup of the Phase 1 database case. The row reads `refused: knocks you out` and is the first row.
4. `layout`: the block contains no `\n\n\n`, and the opening paragraph and the table are separated by exactly one blank line.

**Tests to run:**
- `dist/main/openRouter/briefingSectionsMercenaryFiring.test.js`
- `dist/main/openRouter/briefingSectionsMercenaries.test.js`
- `dist/main/gameActions/mercenaryFireRisk.test.js`

### Verification

Phase Check.

---

## Phase 4 — The Queued-Credits Forecast

**Goal:** Locked Decision 6, the forecast sentence, and the run-out bullet.

**Edits:**
- `src/main/openRouter/treasuryForecast.ts`
- `src/main/openRouter/treasuryForecast.test.ts`
- `src/main/openRouter/briefingSectionsMercenaries.test.ts`

### Steps

1. In `treasuryForecast.ts`:
   - add `TREASURY_FORECAST_HORIZON_TURNS`, `CreditsQueueRow`, `creditsQueueRowsForSeat`, and `projectCreditsQueues` as in the Design;
   - change `TreasuryForecast` and `buildTreasuryForecast`;
   - remove `estimateCreditsIncomePerTurn`, `treasuryCoverTurns`, and `incomePerTurn`.
2. Rewrite `formatTreasuryForecastSentence` and `formatTreasuryRunOutAttention` to the Exact tables.
   - `formatTreasuryHoardAttention` and `treasuryAttention` keep their behavior.
   - The `treasuryAttention` log replaces `incomePerTurn` with `queuedCredits`.
3. `briefingSectionsMercenaries.ts` needs no edit: it already prints any non-empty sentence as its own paragraph and warns on `coverTurns === 0`. Confirm that by reading it.
4. Update the file header: the forecast steps through each credits queue's remaining items and banked points.

### Tests

**`treasuryForecast.test.ts`:** replace the income and cover-turn cases with these. Keep the hoard case. Keep `treasuryAttention never returns both bullets`, building its forecasts from snapshots.
1. `one queued item pays once`:
   - one row: 1 item, 0 stored points, 20 points a turn, item cost 20, 20 credits an item;
   - credits 0, upkeep 15.
   - Turn 1 earns 20 and pays 15 (5 left). Turn 2 earns nothing, so 5 < 15. `coverTurns` is 1, `queuedCredits` 20.
2. `banked points buy items at once`:
   - 3 items, 60 stored points, 0 points a turn, upkeep 50, credits 0;
   - turn 1 earns 60, pays 50 (10 left); then queues are empty;
   - `coverTurns` is `1 + Math.floor(10 / 50)` = 1.
3. `a queue still paying at the horizon gives null`:
   - 99 items, 0 stored points, 1 point a turn, item cost 20, upkeep 10, credits 2000, horizon 100;
   - the queue is not empty after 100 turns and upkeep is still paid, so `coverTurns` is null.
   - With 40 points a turn instead, the queue empties at turn 50 and `coverTurns` is a number above 100. Assert that it is not null.
4. `upkeep 0 gives null and still counts queued credits`.
5. `rows follow the 3.4.2 filters`:
   - reuse the five-cell snapshot of the old income case;
   - only the seat's unpaused credits city is a row, and its `remainingItems` is its `nextRemainingCount`;
   - a row with `nextRemainingCount: null` is skipped.
6. `the sentence follows each case`: assert every Exact row, building forecasts by hand.
7. `the run-out bullet`: assert both Exact forms, including `tail`. Cover 6 gives null.

Do not hard-code item cost or credits per item where a snapshot is used. Compute them from `creditsItemCost()` and `CREDITS_PER_ITEM`.

**`briefingSectionsMercenaries.test.ts`:** update the three forecast assertions to the new Exact sentences:
- the dry case becomes `No credits are queued, so the treasury covers upkeep for ${Math.floor(40 / upkeep)} more turns.`;
- for the paid case, give the credits row `nextRemainingCount: 99`. Assert the paragraph starts with `` `Your credits queues hold ${99 * CREDITS_PER_ITEM} more credits. With them, the treasury covers upkeep for ` ``. The turn count depends on that city's size, so assert only this prefix;
- the shortfall case becomes `No credits are queued, and the treasury cannot cover this turn's upkeep.`.

**Tests to run:** `dist/main/openRouter/treasuryForecast.test.js`, `dist/main/openRouter/briefingSectionsMercenaries.test.js`, `dist/main/openRouter/briefingSections.test.js`

### Verification

Phase Check.

---

## Phase 5 — Larger Credits Counts

**Goal:** P2.

**Edits:**
- `src/main/openRouter/promptSpec/gameRuleMercenaryText.ts`
- `src/main/openRouter/promptSpec/gameRuleMercenaryText.test.ts`
- `src/main/openRouter/promptSpec/coachingTextStrategic.ts`
- `src/main/openRouter/promptSpec/coachingText.test.ts`

### Steps

1. Add `buildCreditsCountGuidance()` (Exact) to `gameRuleMercenaryText.ts`.
2. In `coachingTextStrategic.ts`, turn `PRODUCTION_BULLET` into `function productionBullet(): string`, as the Design says. Change its one use to `gates.productionEnabled ? [productionBullet()] : []`. Keep every other paragraph character for character.

### Tests

**`gameRuleMercenaryText.test.ts`:** `buildCreditsCountGuidance()` equals the Exact text with `creditsItemCost()` and `CREDITS_PER_ITEM`.

**`coachingText.test.ts`:**
- the production rules contain `For steady income, give it a larger count.`;
- that paragraph comes right after the `Keep enough credits coming in` paragraph, separated by `\n\n  `;
- with production off, it is absent.

**Tests to run:** `dist/main/openRouter/promptSpec/gameRuleMercenaryText.test.js`, `dist/main/openRouter/promptSpec/coachingText.test.js`

### Verification

Phase Check.

---

## Phase 6 — Sight Cues Follow Fog of War

**Goal:** Locked Decision 7.

**Adds:**
- `src/shared/sightCuesFogRule.ts`
- `src/shared/sightCuesFogRule.test.ts`
- `src/renderer/gameplay/newGameSightCuesUi.ts`

**Edits:**
- `src/renderer/gameplay/newGameOptionsUi.ts`
- `src/renderer/gameplay/matchOptionsControls.ts`
- `src/renderer/gameplay/newGame.ts`

### Steps

1. Write `sightCuesFogRule.ts`: the rule and T1, as in the Design. No logging, because it is shared.
2. Write `newGameSightCuesUi.ts`:
   - the three functions from the Design;
   - it imports only `../../shared/sightCuesFogRule` and `../chrome/controlTooltipText`;
   - a missing box makes each function do nothing.
3. In `newGameOptionsUi.ts`, call `syncNewGameSightCuesWithFog()` at the end of `resetNewGameOptionControls`, after Fog is set to checked.
4. In `newGame.ts`, call `registerFogSightCuesLink()` next to `registerGameSizeSelect();`.
5. In `matchOptionsControls.ts`, call `lockSightCuesWhenFogOff()` at the end of `lockOptionControls`, on both the read-only and the editable path. In the read-only path, call it before the `return`.
   - `restoreOptionControls` already restores Sight cues' checked state, disabled state, and tip from the memo. Leave it alone.
   - Update the comment of `lockOptionControls`.

### Tests

`sightCuesFogRule.test.ts`:
1. Fog off from `{ checked: true, disabled: false, rememberedChecked: null }` gives `{ false, true, true }`.
2. Fog off again leaves the state unchanged.
3. Fog on restores `{ true, false, null }`.
4. A remembered `false` restores `false`.
5. Fog on with `rememberedChecked: null` is unchanged.
6. The input object is not mutated.

**Tests to run:** `dist/shared/sightCuesFogRule.test.js`

### Verification

Phase Check, plus `npm run check:renderer-types` and `npm run build:renderer`.

---

## Phase 7 — Docs, Version 3.5.0, Final Checks, and Hand-Off

**Goal:** The docs match the code, the version is 3.5.0, and the static checks pass.

**Adds:** `doc/release-notes/v3.5.0.md` (moved from `v3.4.2.md`)

**Edits:**
- `doc/ai-commander-prompts/` files that contain a changed sentence (step 1)
- `doc/combat-rules-v3.md`, `doc/how-to-play.md`, `doc/hybrid-ai.md`
- `doc/ux/new-game-dialog.md`, `doc/ux/control-tooltips.md`
- `README.md`, `doc/README.md`, `.github/ISSUE_TEMPLATE/bug_report.yml`
- `package.json`, `package-lock.json`

### Steps

1. **Prompt docs.** In `doc/ai-commander-prompts/`, search for each old sentence below and replace each copy with its new Exact text:
   - `At about`
   - `With no city producing credits`
   - `credits a turn from credits queues`
   - `Queue credits in more cities, and do not raise or rehire`
   - `To hire, add {"action":"raise_mercenaries"`

   Then update:
   - **`strategic-prompt.md`:**
     - the Mercenaries section: the forecast's rule (Locked Decision 6), its sentences, and the Firing Risk subsection with its layout;
     - the Attention Flags run-out bullet;
     - the rules block: R4, R5, and P2;
     - the envelope: the `dismiss_mercenary` row.
   - **`information-decision-model.md`:**
     - add a `MERCENARY_FIRING_RISK` row in the same column format, from `buildMercenaryFiringRiskBlock`;
     - update the `TREASURY_ATTENTION` row.
   - **`source-inventory.md`:** add `mercenaryFireRisk.ts`, `briefingSectionsMercenaryFiring.ts`, and `seatUnitOwnership.ts` next to their siblings.
   - **`crosswalk.md`:** in the `# Mercenaries` row, name Firing Risk.
2. **`doc/combat-rules-v3.md`,** in the mercenary paragraphs and near "A deserter, a dismissed mercenary, or a rehire shares a hex":
   - commanders can fire with `dismiss_mercenary`;
   - a loaded ship cannot be fired by a commander;
   - the knockout guard (Locked Decision 3) applies to every seat;
   - orders for units a seat no longer owns are dropped at Ready (Locked Decision 4).
3. **`doc/how-to-play.md`:**
   - Dismiss is refused when it would knock you out, and the toast names the reason;
   - Sight cues is unavailable while Fog of war is off.
4. **`doc/hybrid-ai.md`:** the forecast reads queued items and banked points.
5. **`doc/ux/new-game-dialog.md` and `doc/ux/control-tooltips.md`:** Sight cues is unchecked and disabled while Fog of war is unchecked, and checking Fog restores it. Add T1 to the tooltip list.
6. `npm version 3.5.0 --no-git-tag-version`.
7. **Release notes.** Run `Move-Item doc/release-notes/v3.4.2.md doc/release-notes/v3.5.0.md`. In `v3.5.0.md`:
   - change the version everywhere;
   - in **Saves**, change "through 3.4.1" to "through 3.4.2", and "will not load in 3.4.2" to "will not load in 3.5.0";
   - rename `## What's in 3.4.2` to `## What's in 3.5.0`;
   - put these bullets first, **Exact**, then keep the four 3.4.2 bullets:
     - `- **Commanders can fire mercenaries.** A commander can now fire a mercenary it no longer needs. Its briefing warns what a fired unit does, and a new Firing Risk table names the home hexes where firing could hand the hex to Neutral.`
     - `- **No firing yourself out of the match.** A fire, by a commander or by you, is refused when it would let Neutral take enough of that side's home or cities to knock it out.`
     - `- **A forecast that counts what is queued.** The treasury forecast now steps through each city's remaining credits items and banked points, and says how many credits are still queued. Commanders are told that one credits item pays once, and to queue a larger count for steady income.`
     - `- **Sight cues follow fog.** Sight cues is unchecked and unavailable while Fog of war is off, and comes back as it was when you turn fog on again.`

   Run `node scripts/check-doc-links.cjs`. Fix any link that still points at `v3.4.2.md`.
8. **`README.md`:**
   - Update the executable names and the version under Status to 3.5.0.
   - Leave the test count for the user.
   - Replace the `- **3.4.2** …` bullet with one `- **3.5.0** …` bullet, **Exact**: `- **3.5.0** lets commanders fire mercenaries, with a Firing Risk table and a guard against firing themselves out of the match, and forecasts the treasury from what is actually queued. It also includes the unpublished 3.4.2 changes: treasury attention flags, credits advice only for capped cities, and the Default game size.`
9. **`doc/README.md`:** set the shipping version to 3.5.0. Replace the `Release **3.4.2** …` paragraph with a `Release **3.5.0** …` paragraph with the same text as the README bullet.
10. **`.github/ISSUE_TEMPLATE/bug_report.yml`:** placeholder `"3.5.0"`.
11. Run the Phase Check plus `npm run check:renderer-types` and `npm run build:renderer`, then `npm run rebuild:native:electron` last.
12. Fill in the Completion Log, and give the user the checklist below.

### Manual checklist for the user

Part of your final pass:

1. **Forecast.** In a commander's briefing, the forecast paragraph says how many credits are queued, and its turn count matches what the treasury does over the next turns.
2. **Firing in the log.** When a commander fires, the debug log shows `gameActions executeCommanderDismissMercenary`. The unit turns Neutral, and any order it was given that turn does not run.
3. **Firing Risk.** With a mercenary in an unfortified home hex, Firing Risk lists that hex. A fire that would knock the side out is refused, with the reason in `productionOrders` drop reasons. Your own Dismiss button shows the same reason as a toast.
4. **Sight cues.**
   - In New Game, Game Options: uncheck Fog of war, and Sight cues unchecks and greys out. Check Fog, and it returns to its earlier value.
   - Open the in-match options for a match with fog off. Sight cues is unchecked and disabled.
5. Run `npm run ui:smoke` and `npm run doc:shots`.

### Verification

The Phase Check passes, `check-doc-links` passes, and the Completion Log is complete.

---

## Reliability Checklist

- [ ] No file outside a phase's lists was edited, except those recorded. The five files under Non-Goals are unchanged.
- [ ] `fireWouldKnockOut` is the only knockout decision for fires. It does not mutate its inputs, and it returns false outside region versus region.
- [ ] The human's Dismiss still works in a safe hex. It is refused only by the knockout guard.
- [ ] A commander's fire is refused for a loaded ship and for a mercenary aboard a ship.
- [ ] At Ready, no order and no standing order survives for a unit its seat no longer owns. Ownership is read from the `units` table, and a failed read keeps the orders.
- [ ] `projectCreditsQueues` is the only treasury projection. Nothing uses `incomePerTurn` any more.
- [ ] Every Exact text matches character for character. No new paragraph contains a line break, and no block contains a triple newline.
- [ ] The prompt matches the Prompt Layout map:
  - R4 and R5 are paragraphs 4 and 5 of the rules Mercenaries section;
  - P2 is a continuation paragraph of the production bullet;
  - Firing Risk sits between Your Mercenaries and Rehire Candidates, one level below Mercenaries;
  - no other heading was added, removed, or renamed.
- [ ] Sight cues' remembered value is touched only by `syncNewGameSightCuesWithFog`.
- [ ] `check:circular` prints no cycle. No plan vocabulary in code, tests, or `doc/`.

## Success Definition

- Commanders can fire mercenaries with `dismiss_mercenary`. The rules warn what follows, Firing Risk names the dangerous home hexes, and a fire that would knock the side out is refused for every seat.
- The forecast counts queued credits items and banked points, says how many credits are queued, and advises a larger count.
- Sight cues is unchecked and disabled whenever Fog of war is off.
- Version 3.5.0, its release notes carry the 3.4.2 changes, and the docs are updated. The named tests and static checks pass.

## Phase 0 Inventory

| Item | Value |
| --- | --- |
| Static check results | `rebuild:native:node`, `build:main`, `lint`, `check:circular`, `check:renderer-types`, `build:renderer` all exit 0 |
| Pre-existing failures in named tests | None. All eleven baseline test files exit 0. `ownerTurnOrders.test.ts` did not exist, so Phase 2 created it |
| Anchors confirmed | All 12 anchors present exactly once |
| Line counts | Before: dismissMercenary 95, productionOrders 177, productionOrdersApply 80, envelopeJsonSchema 501, gameRuleMercenaryText 144, ownerTurnOrders 213, commanderReadyGather 212, briefingSectionsMercenaries 418, treasuryForecast 288, coachingTextStrategic 443, newGameOptionsUi 161, matchOptionsControls 375, newGame 486, mercenaryDismiss 245. After: 114, 178, 87, 501, 159, 241, 226, 423, 381, 448, 163, 378, 488, 265. New: mercenaryFireRisk 211, briefingSectionsMercenaryFiring 175, seatUnitOwnership 40, newGameSightCuesUi 88, sightCuesFogRule 79 |

## Defect Inventory

| Phase | Defect | Fix or reason for stopping |
| --- | --- | --- |
| 2 | `briefingSectionsMercenaries.test.ts` asserted the old funds-warning action sentence | Updated to W2 (a change the phase names) |
| 4 | The "funds warning" covered case had no banked points, so cover was 0 under the new projection | Gave the fixture banked points in the test |
| Review | A commander's fire of another side's loaded ship was refused as a loaded ship, not as not yours, and named its cargo | The loaded-ship check moved into `refusalFor`, after the ownership checks |
| Review | A database error in a commander's fire would throw out of `applyProductionOrdersFromEnvelope` | Caught, logged, and turned into a drop reason |
| Review | Firing Risk said Neutral takes a hex that holds a second mercenary of the seat | A second mercenary counts as a unit that stays and fights |
| Review | `resetNewGameVictory` could leave Sight cues checked while Fog of war had locked it | `resetNewGameSightCues` clears the memory and reapplies the Fog rule |

## Completion Log

| Phase | Result | Files changed beyond the lists | Sketch differences | Notes |
| --- | --- | --- | --- | --- |
| 0 | Done | None | None | Backups under the temp directory |
| 1 | Done. Phase 1 tests, lint, circular, renderer-types pass | None | `readFireRiskInputs` returns null for an inactive seat as well as outside region versus region | |
| 2 | Done. All nine named tests pass | `briefingSectionsMercenaries.test.ts` (W2 sentence) | `keepOrdersForOwnedUnits` logs `logTrace` only. `ownerTurnOrders.test.ts` is new | |
| 3 | Done. Firing, Mercenaries and fire-risk tests pass | None | No `isSeatId` narrowing: the briefing's seat is already an AI seat id | |
| 4 | Done. treasuryForecast, Mercenaries and briefingSections tests pass | None | None | `treasuryForecast.ts` is 381 lines, under the 600 limit |
| 5 | Done. gameRuleMercenaryText and coachingText tests pass | None | None | |
| 6 | Done. sightCuesFogRule test, lint, renderer-types, build:renderer pass | None | None | |
| 7 | Done. check-doc-links, Phase Check pass. Native module rebuilt for Electron | `doc/ai-commander-prompts/example-strategic-prompt.md` (rules text, P2, E1) | None | Version 3.5.0. Release notes moved from v3.4.2.md |
