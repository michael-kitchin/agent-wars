# Knockout Rules and Finishing Weak Sides Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** A side that has lost its homeland is knocked out, and the AI commanders can see and finish sides that are close to being knocked out. Three changes ship together as release 3.3.0:

1. **Home loss knockout.** A side is knocked out when other sides and Neutral together hold home hexes containing at least **90%** of its home's original urban cells. This applies on the global map and on regional maps. Today the global map requires one attacker to hold every home hex, ocean included, and regional maps require one attacker to hold 75%.
2. **Knockout status in the strategic briefing.** Every commander sees, for itself and each enemy, how many city hexes the side holds and how much of its home is lost. A side with five or fewer city hexes gets its city hexes listed.
3. **Campaign targeting.** A city scores three times higher when its holder has five or fewer city hexes, unless the commander has an active non-aggression pact or ceasefire with that holder. The enemy-home bonus applies only when the city's holder is the side whose home contains it. Land operations use the same comparator as campaigns.

**Shape:** Phase 0 records a baseline. Phase 1 changes one constant. Phase 2 adds the home-loss count. Phase 3 switches the knockout rule and its player-facing wording. Phase 4 adds the knockout status data. Phase 5 changes the prompt text. Phase 6 changes campaign scoring. Phase 7 updates the docs, sets version 3.3.0, runs the final verification, and hands the user a manual checklist.

**Tech:** TypeScript (Electron main, sandboxed renderer bundled with esbuild, shared modules), `better-sqlite3`, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`.

**Shell:** Windows PowerShell. Working directory `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- The full Verification Bar runs only in Phase 0 and Phase 7. Every other phase ends with the shorter Phase Check, which is not optional.
- **Stop only when a verification fails** and you cannot fix it within the phase's file lists. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, except to remove an import that lint reports unused in a listed file, or to fix a test that fails only because of a change the phase names. Record every such file in the Completion Log.
- Find code by the quoted text, not by a line number.
- **Code blocks are sketches** unless marked **Exact**. Write the real code from the file you just read. When a sketch and the file disagree, the file wins; record the difference in the Completion Log. Text marked **Exact** is copied character for character, including punctuation and spacing.
- **Tests come first.** Write a new module's test with the module, and run it before any existing code calls the module.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Set `$step` to the phase number and `$files` to that phase's **Edit** list.

```powershell
$step = '1'
$files = @('src/shared/victoryRules.ts')
$backup = Join-Path $env:TEMP "aw-knockout-rules\step-$step"
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

## Verification

### Phase Check

Every phase from 1 to 6 ends with the Phase Check, run from the repo root:

```powershell
npm run build:main
npm run lint
npm run build:renderer
npm run check:renderer-types
npm run check:circular
```

Then run, with `node dist/main/<path>.test.js` or `node dist/shared/<path>.test.js`, every test file the phase adds and every existing test file the phase lists under **Tests to run**. All must pass.

- `check:circular` must print **exactly** the cycles recorded in Phase 0. A new cycle fails the phase.
- `npm run build:renderer` rewrites `static/renderer.js`. That is expected.
- No script runs tests under `src/renderer`. Every rule this plan adds lives in `src/shared` or `src/main` and is tested there.
- A test run may print `logError` lines from code that reads a database the test did not open (for example "classification cache is not loaded" or an agreement read). They are expected when the test still passes.
- Record each Phase Check result in the Completion Log.

### Verification Bar

```powershell
npm test
npm run build:renderer
npm run check:circular
```

- `npm test` runs the native rebuild, `build:main`, `lint`, `naming:check`, `check:renderer-types`, `check:circular`, every compiled `dist/main/**/*.test.js` and `dist/shared/**/*.test.js`, and `notices:check`. It takes about 20 minutes.
- When the final Verification Bar fails, find the phase whose change caused the failure, fix it within that phase's file lists, record the defect, and run the full bar again.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a gate pass.
- **Native module lock.** If `npm test` fails in `rebuild:native:node` with `EBUSY` on `better_sqlite3.node`, close any running Electron app, rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`, rerun `npm test`, then delete the `.locked` file.
- **No test may call a real model.**

---

## Non-Goals

- No change to the other two knockout reasons: `no_city_hexes` and `home_cities_destroyed` keep their meaning and their tests. The stored reason id `home_control` keeps its name.
- No garrison or hold logic for captured cities. No change to unit orders, standing orders, or operations other than the shared land comparator and its inputs.
- No change to how agreements, stances, or messages are made or stored. Campaigns read agreements only to withhold the finishing bonus.
- No change to mercenary rules.
- No stored rule version and no migration. A loaded save uses the new rules from its next end of turn.
- No new UI element. Only the wording of the knockout notice and the knockout dialog changes.
- No change to tactical (battle) prompts.
- No change to how sea and air operations rank cities. They do not use the weights.
- The `inEnemyHome` field keeps its meaning (the city lies in an active enemy's home, whoever holds it). The operations briefing phrase "in an enemy home region" stays as it is.
- `computeHomeControlProgress` keeps its signature and behavior. It still answers "how much of this home does this one side hold".
- Do not edit anything under `.spec/completed/`, release notes of earlier versions in `doc/release-notes/`, or the historical documents named in `AGENTS.md`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`. Lint enforces some of them.

- **Orienting comments.** Every new or updated declaration needs a JSDoc block, including private functions, constants, types, and every field of an interface or parameter-object type. Each block has a one-line summary, then `Purpose:` (or `Contract:` for types and fields), `When to use:`, `Expected outcome:`, and `Exceptions:`. Update the comment of every existing declaration whose behavior this plan changes, so no comment still describes the old rule (one attacker, every hex on the global map, 75%, a "regional" share). **Do not copy generic filler.** Say what the code does and why.
- **Logging (rule 02).** Only `src/main` logs. `src/shared` and `src/renderer` never import the main-process logger. Each new or newly exported function in `src/main` logs on entry at the level this plan names. Functions that read the database log `logDebug`. Pure calculators that run many times per consult (once per city, once per home, or inside a sort) log `logTrace`, as `computeHomeControlProgress` and `scoreCampaignCity` already do. Every caught error logs `logError` with the error. Log seat ids, turn numbers, and counts only.
- **Names.** camelCase files and functions, PascalCase types, UPPER_SNAKE constants. Follow `doc/naming-conventions-contract-v1.md`. Use the file and symbol names this plan gives. `npm test` runs `naming:check`.
- **No plan vocabulary in version control.** Words such as "phase", "step", or "execution plan", and this plan's heading words, must never appear in code, comments, test names, or `doc/`.
- **Seat ids.** Production code uses `HUMAN_SEAT_ID`, `AI_SEAT_IDS`, `NEUTRAL_OWNER_ID`, and the guards in `src/shared/seatIds.ts`, never string literals. Tests may use literals.
- **Size limits (rule 09).** Files should stay under 600 lines and must stay under 1000. Two files are already over 600 and **must not grow**: `src/main/openRouter/consultPromptParts.ts` (609) and `src/main/openRouter/openRouterMatrix.test.ts` (678). Put new logic in the new files this plan names.
- **Mutability (rule 13).** `const` unless reassigned. `readonly` on fields, parameter arrays, and object types that are not modified.
- **Arguments (rule 10).** At most 6 parameters. Every new function here takes at most 2, or one parameter object whose type has an orienting comment on the type and each field.
- **Tests (rule 03).** Test contracts: inputs, outputs, observable effects. Happy paths and the essential failures each phase names. Do not test constants, private helpers, or call order. If an existing case in a test file you edit only checks an implementation detail of code this plan changes, remove it and record that in the Completion Log. Copy the imports and structure of the sibling test file each phase names.
- **Reuse (rule 06).** One counting loop serves both home counts (Phase 2). One comparator serves campaigns and land operations (Phase 6).
- **Docs.** Phase 7 updates `doc/`. Do not edit `doc/` in earlier phases.

---

## Locked Decisions

The user made these, or they follow from the user's choices and the match data below. Do not revisit them.

1. **One threshold, 90%, on every map.** `HOME_CONTROL_WIN_MIN_URBAN_SHARE = 0.9` in `src/shared/victoryRules.ts`. `GLOBAL_GAME_MAP.controlWinMinUrbanShare` and every regional profile use it. `REGIONAL_CONTROL_WIN_MIN_URBAN_SHARE` is removed.
   - *Why 90%:* a side keeps fighting while it holds more than a tenth of its home, which leaves the most room for a comeback. In the user's turn-108 global match, 80% and 90% knock out the same sides on the same turns. South America has held under 10% of its home since turn 28. Western Europe's one real comeback, from 0% to 25% of its home between turns 33 and 36, came after it had already lost its home on turn 21, so no threshold would have preserved it.
2. **What counts as lost.** A home cell is **lost** when its hex is held by another seat (active or not) or by Neutral (`NEUTRAL_OWNER_ID`). A hex with no controller counts as neither held nor lost. Shared home hexes start with no controller: in the user's match, 25 original cells on the Guiana coast sit in both South America's and Western Europe's homes. Counting them as lost could knock out a side whose home overlaps heavily with another's on turn 1.
3. **The knockout test.** A side loses its home when its lost cells reach `ceil(0.9 × total)`: the existing `Math.ceil(share * total - 1e-9)` rule, where `total` is the original urban cells of every home hex.
4. **Every-hex fallback.** When the effective share is null (`effectiveControlWinMinUrbanShare` returns null because the terrain classification cache is not loaded), or the home's total original urban cells is 0, the side loses its home when **every** home hex is lost.
5. **Who gets the credit.** For every knockout reason, `outBy` is the active seat other than the victim that holds the most of the victim's original home urban cells. Neutral is never credited. A tie goes to the seat with the lower `seatOrder` (`activeSeats` already sorts by it). If no seat holds any, `outBy` is null.
6. **All matches, saves included.** No stored rule version. Loading a save applies the new rules at its next end of turn. In the user's current global match, both South America (it holds 0% of its home) and Western Europe (it holds 0.5%; other sides hold 85% and Neutral holds 14%) are knocked out at the end of the next turn.
7. **Knockout status is game-rule information.** Like today's home-control progress lines, the counts use true control even when fog of war is on. Only the listing of individual city hexes respects what the viewer has explored.
8. **Near knockout.** A side holding at most `NEAR_KNOCKOUT_MAX_CITY_HEXES = 5` city hexes (`src/shared/victoryRules.ts`) is near knockout. The briefing lists its city hexes, and campaign scoring applies the finishing weight.
9. **Campaign weight.** `campaignCityWeight(city) = (city.heldByHomeSide ? CAMPAIGN_ENEMY_HOME_WEIGHT : 1) × (city.ownerNearKnockout ? CAMPAIGN_FINISHING_WEIGHT : 1)`, with `CAMPAIGN_ENEMY_HOME_WEIGHT = 2` (unchanged) and `CAMPAIGN_FINISHING_WEIGHT = 3`.
   - `heldByHomeSide`: the city's holder is the active enemy whose home contains it.
   - `ownerNearKnockout`: the holder has at most `NEAR_KNOCKOUT_MAX_CITY_HEXES` cities in this candidate list **and** the commander has no active pact with the holder.
   - *Worked example:* a 17-cell straggler city 1 land step away, its holder down to 2 city hexes, scores 17 × 3 ÷ 3 = 17. A 40-cell city held by its own home side 5 steps away scores 40 × 2 ÷ 7 ≈ 11.4. The straggler city wins. With the holder at 6 city hexes, or under an active pact, it scores 17 ÷ 3 ≈ 5.7 and loses.
10. **Active pact.** One of the commander's **own** agreement rows whose kind is `non_aggression` or `ceasefire_in_place`, whose counterpart is an active seat, and whose `sideAgreementStanding` for the current turn is `'active'`. A `proposed` agreement does not count.
11. **One comparator.** Campaigns and land operations rank cities with the exported `campaignScoreBeats`. The private copy in `landOperationCandidates.ts` is deleted.
12. **Player-facing wording.** The knockout notice and dialog say "Other sides and Neutral hold …". Phase 3 gives the exact text. The input field `globalHome` is renamed `everyHexRule`, because it is true whenever the every-hex fallback applies, not on the global map.
13. **Release.** Version 3.3.0, following steps 1 to 3 of "Before the build" in `doc/releasing.md`. Nothing is committed.

---

## Design

### Constants (`src/shared/victoryRules.ts`) — Exact values

```ts
export const HOME_CONTROL_WIN_MIN_URBAN_SHARE = 0.9;
export const NEAR_KNOCKOUT_MAX_CITY_HEXES = 5;
```

Each gets a full orienting comment.

- `HOME_CONTROL_WIN_MIN_URBAN_SHARE`: the share of a home's original urban cells that other sides and Neutral must hold together to knock that home's side out, on every map.
- `NEAR_KNOCKOUT_MAX_CITY_HEXES`: a side holding this many city hexes or fewer is close to the no-city-hexes knockout; the strategic briefing lists its city hexes and campaign scoring favors its cities.

### Home loss count (`src/main/gameActions/homeControlProgress.ts`)

A new function beside `computeHomeControlProgress`. Both count through one private helper, so the loop exists once.

```ts
export type HomeLossProgress = {
  readonly lostUrbanCells: number;   // original urban cells in home hexes held by another seat or by Neutral
  readonly totalUrbanCells: number;  // original urban cells in all home hexes
  readonly neededUrbanCells: number; // lost cells at which the owner is out; 0 under the every-hex rule
  readonly lostHexes: number;        // home hexes held by another seat or by Neutral
  readonly totalHexes: number;       // home hexes
  readonly everyHexRule: boolean;    // true when the share is null or totalUrbanCells is 0
  readonly homeLost: boolean;        // the owner has lost its home under the rule in force
};

export function computeHomeLossProgress(args: {
  readonly homeHexes: readonly string[];
  readonly ownerSeatId: string;
  readonly controlByHex: ReadonlyMap<string, string | null | undefined>;
  readonly baselineUrbanCellsForHex: (h3Index: string) => number;
  readonly minUrbanShare: number | null;
}): HomeLossProgress
```

Rules:

- A hex is lost when `controlByHex.get(hex)` is a non-empty string other than `ownerSeatId`. `null` and `undefined` are not lost.
- Empty `homeHexes`: every count 0, `everyHexRule: true`, `homeLost: false`.
- `everyHexRule = minUrbanShare === null || totalUrbanCells === 0`.
- `neededUrbanCells = everyHexRule ? 0 : Math.ceil(minUrbanShare * totalUrbanCells - 1e-9)`.
- `homeLost = everyHexRule ? totalHexes > 0 && lostHexes === totalHexes : lostUrbanCells >= neededUrbanCells`.
- Logs `logTrace` with the owner id and the hex count, as `computeHomeControlProgress` does.

The private helper takes the home hexes, a `(controller) => boolean` test, and the baseline callback, and returns `{ matchedUrbanCells, totalUrbanCells, matchedHexes, totalHexes }`. `computeHomeControlProgress` uses it with `controller === args.controller` and keeps its exact outputs.

### Knockout rule input (`src/main/gameActions/endOfTurnOutcomeRules.ts`)

`EndOfTurnOutcomeInput.controlWinMet: (attacker, victim) => boolean` is replaced by:

```ts
readonly homeControlLost: (victim: SeatId) => boolean;
```

`reasonsFor(victim)` pushes `'home_control'` when `input.homeControlLost(victim.seatId)` is true. `outByFor` drops its `home_control` branch and always uses the existing "most home city cells" loop (`homeCityCellsControlledBy`). That loop already takes the first seat with the strictly highest count from `active`, which `activeSeats` sorts by `seatOrder`, and returns null when every count is 0. Its `reasons` parameter becomes unused: remove it.

`evaluateEndOfTurnOutcome` in `endOfTurnOutcome.ts` supplies:

```ts
homeControlLost: (victim) => computeHomeLossProgress({
  homeHexes: homeHexes.get(victim) ?? [],
  ownerSeatId: victim,
  controlByHex,
  baselineUrbanCellsForHex: (h3Index) => baselineUrbanCellsForControlWin(h3Index, effectiveShare),
  minUrbanShare: effectiveShare,
}).homeLost,
```

`homeCityCellsControlledBy` keeps its current closure over `computeHomeControlProgress`.

### Knockout status (`src/main/gameActions/knockoutStatus.ts`, new)

A pure builder plus a thin database reader, so the logic is tested without a database.

```ts
export interface KnockoutCityHex { readonly h3Index: string; readonly urbanCells: number; }
export interface SideKnockoutStatus {
  readonly seatId: SeatId;
  readonly name: string;                          // the seat's stored homeRegion, trimmed
  readonly cityHexes: readonly KnockoutCityHex[]; // hexes it controls with current urbanHexCount > 0
  readonly homeLoss: HomeLossProgress;            // its own home
  readonly viewerHeldHomeUrbanCells: number;      // enemy rows: original cells of its home the viewer holds; own row: 0
}
export interface KnockoutStatusForSeat {
  readonly share: number | null;                  // the effective share every row used
  readonly own: SideKnockoutStatus;
  readonly enemies: readonly SideKnockoutStatus[]; // active enemies in seat order
}

export function buildKnockoutStatus(args: {
  readonly viewerSeatId: SeatId;
  readonly seats: readonly SeatRecord[];
  readonly homeHexesBySeat: ReadonlyMap<SeatId, readonly string[]>;
  readonly controlByHex: ReadonlyMap<string, string | null | undefined>;
  readonly infrastructure: readonly { readonly h3Index: string; readonly urbanHexCount: number }[];
  readonly baselineUrbanCellsForHex: (h3Index: string) => number;
  readonly minUrbanShare: number | null;
}): KnockoutStatusForSeat | null

export function knockoutStatusForSeat(seatId: SeatId): KnockoutStatusForSeat | null
```

`buildKnockoutStatus` (logs `logTrace` with the viewer id and enemy count):

- Returns null when the viewer is not in `seats` or is not active (`isSeatActive`).
- Enemies are the seats from `activeSeats(seats)` other than the viewer, in that order.
- For each row (own first, then each enemy), `homeLoss` is `computeHomeLossProgress` with that row's seat as owner.
- `cityHexes`: infrastructure rows with `urbanHexCount > 0` whose controller is that row's seat, sorted by `urbanCells` descending, then `h3Index` ascending. `urbanCells` is the current `urbanHexCount`, the same count the no-city-hexes rule uses.
- `viewerHeldHomeUrbanCells`: for an enemy row, `computeHomeControlProgress` with `controller: viewerSeatId`, `heldUrbanCells`. For the own row, 0.

`knockoutStatusForSeat` (logs `logDebug` with the seat id, enemy count, and share) reads what `homeControlProgressForSeat` reads today. It returns null unless `loadScenarioState` says `REGION_VS_REGION_SCENARIO_ID`. Otherwise it reads `getSeatRoster()`, `effectiveControlWinMinUrbanShare()`, `getHexControlMap()`, `getScenarioHomeRegionHexes(seat.homeRegion)` for each seat, and `listStrategicInfrastructureRows()`, uses `baselineUrbanCellsForControlWin` as the baseline, and calls `buildKnockoutStatus`. It catches nothing; the prompt builder that calls it already catches and logs. It replaces `homeControlProgressForSeat`, which Phase 5 deletes.

### Prompt text (`src/main/openRouter/scenarioGoals.ts`)

**Scenario Progress lines.** `buildScenarioProgressLines(state, status: KnockoutStatusForSeat | null): string[]` replaces the old per-enemy lines. It returns `[]` when `state.scenarioId !== 'region_vs_region'` or `status` is null. Otherwise it returns the own row's lines, then each enemy's lines, in the order of `status.enemies`. It keeps its existing `logDebug`.

Helper phrases — **Exact**:

- City hex count: `no city hexes` when 0, `1 city hex` when 1, `${n} city hexes` otherwise.
- One listed hex: `${code} (${cells} urban ${cells === 1 ? 'cell' : 'cells'})`, where `code` is `formatHomeRegionHexCodesForPrompt([h3Index])` from `consultPromptPartsHelpers.ts`. Items are joined with `, `.

Own row — **Exact** templates (`{}` are values; everything else is literal):

- Share rule: `- Your side: you hold {cityHexPhrase}. Other sides and Neutral hold {lostUrbanCells} of your home's {totalUrbanCells} original urban cells. You are knocked out if they reach {neededUrbanCells}, or if you lose every city hex.`
- Every-hex rule: `- Your side: you hold {cityHexPhrase}. Other sides and Neutral hold {lostHexes} of your {totalHexes} home hexes. You are knocked out if they hold all of them, or if you lose every city hex.`
- When 1 ≤ city hex count ≤ `NEAR_KNOCKOUT_MAX_CITY_HEXES`, a second line: `  Your city hexes: {list}.` (two leading spaces).

Enemy row — **Exact** templates:

- Share rule: `- {name}: holds {cityHexPhrase}. Other sides and Neutral hold {lostUrbanCells} of its home's {totalUrbanCells} original urban cells, {viewerHeldHomeUrbanCells} of them yours. It is knocked out if they reach {neededUrbanCells}, or if it loses every city hex.`
- Every-hex rule: `- {name}: holds {cityHexPhrase}. Other sides and Neutral hold {lostHexes} of its {totalHexes} home hexes. It is knocked out if they hold all of them, or if it loses every city hex.`
- When 1 ≤ city hex count ≤ `NEAR_KNOCKOUT_MAX_CITY_HEXES`, a second line. Which one depends on which of its city hexes the viewer has explored (`state.exploredHexes`; a missing list means every hex is explored):
  - all explored: `  Its city hexes: {list}. Taking all of them knocks it out.`
  - some explored: `  Its known city hexes: {list}. Some of its city hexes are unexplored.`
  - none explored: `  Its city hexes are unexplored.`

**Changed sentences — Exact.**

- `WIN_CONDITION_REMINDER_FIRST_SENTENCE`:
  `Your goal is to be the last side standing. A side is knocked out when other sides and Neutral together hold its home region (see the share below), when its home region has no cities left, or when it holds no city hexes anywhere. A knocked-out side's units become neutral garrisons and its land becomes neutral.`
- `REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET`: `Other sides and Neutral together holding every hex of the enemy home region`
- `regionalControlSnippet(share)`: `` `Other sides and Neutral together holding enemy home region hexes with at least ${pct}% of its original urban cells` ``
- New exported constant `REGION_VS_REGION_SCENARIO_NO_CITY_SNIPPET`: `Taking every city hex the enemy holds anywhere`
- The objective list in `buildScenarioObjectiveRulesBlock` becomes:

  ```text
  - Knock an enemy out at the end of a turn by any of these:
      (1) {controlSnippet}, OR
      (2) {REGION_VS_REGION_SCENARIO_WIN_URBAN_SNIPPET}, OR
      (3) {REGION_VS_REGION_SCENARIO_NO_CITY_SNIPPET}.
  ```

  The first line is the string `'- Knock an enemy out at the end of a turn by any of these:\n'`. Each path line starts with four spaces, as the current code does.
- `regionalWinPathsBullet(share)`:
  `` `- Win by being the last side standing: an enemy is knocked out when other sides and Neutral together hold its home region (at least ${pct}% of its original urban cells), when its home cities are destroyed, or when it holds no city hex anywhere. Those are the cells that matter. A side with only a few city hexes left is close to being knocked out.` ``
- `WIN_PATHS_BULLET` in `src/main/openRouter/promptSpec/coachingTextStrategic.ts`:
  `- Win by being the last side standing: an enemy is knocked out when other sides and Neutral together hold every hex of its home region, when its home cities are destroyed, or when it holds no city hex anywhere. Those are the cells that matter. A side with only a few city hexes left is close to being knocked out.`

### Campaign weight and pacts

`src/main/openRouter/campaignPactPartners.ts` (new):

```ts
export const CAMPAIGN_PACT_KINDS: readonly SideAgreementKind[]; // Exact: ['non_aggression', 'ceasefire_in_place']

export function pactPartnerSeatIdsFrom(args: {
  readonly rows: readonly SideAgreementRow[];       // the commander's own agreement rows
  readonly turnNumber: number;
  readonly activeSeatIds: ReadonlySet<string>;
}): ReadonlySet<string>

export function readActivePactPartnerSeatIds(args: {
  readonly seatId: string;
  readonly turnNumber: number;
  readonly activeSeatIds: ReadonlySet<string>;
}): ReadonlySet<string>
```

- `pactPartnerSeatIdsFrom` (logs `logTrace`): a row counts when its `kind` is in `CAMPAIGN_PACT_KINDS` and `sideAgreementStanding({ status, endTurn, currentTurn: turnNumber, counterpartActive: activeSeatIds.has(counterpartSeatId) })` is `'active'`. It returns the set of those rows' `counterpartSeatId`. `SideAgreementRow` (`src/main/gameDb/sideAgreementStore.ts`) has `counterpartSeatId`, `kind`, `endTurn`, and `status`. `SideAgreementStandingArgs` (`src/shared/sideAgreements.ts`) has `status`, `endTurn`, `currentTurn`, and `counterpartActive`.
- `readActivePactPartnerSeatIds` (logs `logDebug`): calls `listSideAgreementsForSeat(gameDbOps, seatId)` (`src/main/gameDb/sideAgreementStore.ts`, `gameDbOps` from `src/main/gameDb/dbConnection.ts`) inside `try`. On any error it logs `logError` with the seat and turn and returns an empty set, so a campaign never fails because agreements could not be read. Otherwise it returns `pactPartnerSeatIdsFrom(...)`.

`src/main/openRouter/campaignTargetSelection.ts`:

- `CampaignCity` gains two fields, each with a `Contract:` comment:
  - `readonly heldByHomeSide: boolean;` — the city's holder is the active enemy whose home contains it.
  - `readonly ownerNearKnockout: boolean;` — the holder has at most `NEAR_KNOCKOUT_MAX_CITY_HEXES` cities in this candidate list, and the viewer has no active pact with it.
- `knownCampaignCities` gains the argument `readonly finishingExemptSeatIds: ReadonlySet<string>`, documented as "holders whose cities never get the finishing weight: the viewer's active pact partners". It builds the list as today, then sets `ownerNearKnockout` with a second pass that counts cities per `ownerSeatId`. `heldByHomeSide = homeSeat !== null && owner === homeSeat`. `inEnemyHome` is computed exactly as today.
- `export const CAMPAIGN_FINISHING_WEIGHT = 3;`
- `export function campaignCityWeight(city: CampaignCity): number` returns the product in Locked Decision 9 and logs `logTrace`.
- `scoreCampaignCity` and `campaignScoreBeats` use `campaignCityWeight`. Update the formula comment to `urban × weight ÷ ((steps + 2) × (1 + known forts ÷ 4))`, where weight is `campaignCityWeight`.
- `campaignScoreBeats` becomes `export` and logs `logTrace`.

`src/main/openRouter/campaignObjectiveFlow.ts`: `campaignInputsFromState` already builds `activeEnemySeatIds`. It calls `readActivePactPartnerSeatIds({ seatId, turnNumber: state.turnNumber, activeSeatIds: activeEnemySeatIds })` and passes the result to `knownCampaignCities` as `finishingExemptSeatIds`.

---

## Phase 0 — Baseline and Prerequisites

**Add:** nothing. **Edit:** nothing.

1. Run `git status --short` and record the output in the Phase 0 Inventory.
2. Run the Verification Bar. Record pass or fail for each command, and the exact cycle list `check:circular` prints.
3. Record the line counts of `src/main/openRouter/consultPromptParts.ts`, `src/main/openRouter/openRouterMatrix.test.ts`, `src/main/openRouter/scenarioGoals.ts`, `src/main/gameActions/endOfTurnOutcome.ts`, `src/main/openRouter/campaignTargetSelection.ts`, and `src/main/openRouter/campaignObjectiveFlow.ts`.
4. **Prerequisites.** Confirm each of these exists, and record any that does not. **If any is missing, stop and tell the user.**
   - `src/shared/activeGameMap.ts`: `GLOBAL_GAME_MAP` with `controlWinMinUrbanShare: null`.
   - `src/shared/gameMapTypes.ts`: the `controlWinMinUrbanShare` field and its comment.
   - `src/shared/regionalRulesCatalog.ts`: `REGIONAL_CONTROL_WIN_MIN_URBAN_SHARE = 0.75`. `src/main/gameMap/loadGameMap.ts` imports it.
   - `src/shared/victoryRules.ts`: `countCityHexesBySeat`, `rankSeatsByCityHexes`. Its only import is `./seatIds`.
   - `src/shared/seatIds.ts`: `NEUTRAL_OWNER_ID`, `isAiSeatId`. `src/shared/seatRoster.ts`: `activeSeats` (sorts by `seatOrder`), `isSeatActive`, `SeatRecord`.
   - `src/main/gameActions/homeControlProgress.ts`: `computeHomeControlProgress` with a `controller` argument, `HomeControlProgress`.
   - `src/main/gameActions/endOfTurnOutcome.ts`: `effectiveControlWinMinUrbanShare`, `baselineUrbanCellsForControlWin`, `homeControlProgressForSeat`, `SeatHomeControlPair`, `evaluateEndOfTurnOutcome`.
   - `src/main/gameActions/endOfTurnOutcomeRules.ts`: `decideEndOfTurnOutcome`, `EndOfTurnOutcomeInput` with `controlWinMet` and `homeCityCellsControlledBy`.
   - `src/shared/knockoutNotice.ts` and `src/shared/knockoutDialogCopy.ts`: the input field `globalHome`, and the sentences `holds all of its home.` and `holds all of your home.`
   - `src/renderer/gameplay/knockoutDialog.ts` and `src/renderer/gameplay/knockoutNotices.ts`: the text `globalHome: share === null,`.
   - `src/main/openRouter/scenarioGoals.ts`: `buildScenarioProgressLines`, `EnemyUrbanProgress`, `WIN_CONDITION_REMINDER_FIRST_SENTENCE`, `REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET`, `REGION_VS_REGION_SCENARIO_WIN_URBAN_SNIPPET`, `regionalWinPathsBullet`, and the text `'- Win at end of turn by either:\n'`.
   - `src/main/openRouter/promptSpec/coachingTextStrategic.ts`: `WIN_PATHS_BULLET`. `src/main/openRouter/promptSpec/coachingGates.ts`: the comment on `controlWinMinUrbanShare`.
   - `src/main/openRouter/consultPromptParts.ts`: the call `homeControl = homeControlProgressForSeat(ownSeat);` and the call `buildScenarioProgressLines(state, {`.
   - `src/main/openRouter/consultPromptPartsHelpers.ts`: `formatHomeRegionHexCodesForPrompt`.
   - `src/main/openRouter/campaignTargetSelection.ts`: `CampaignCity`, `knownCampaignCities`, `scoreCampaignCity`, private `campaignScoreBeats`, `CAMPAIGN_ENEMY_HOME_WEIGHT`.
   - `src/main/openRouter/campaignObjectiveFlow.ts`: `campaignInputsFromState` and its `activeEnemySeatIds`.
   - `src/main/operations/landOperationCandidates.ts`: private `scoreBeats`.
   - `src/main/gameDb/sideAgreementStore.ts`: `listSideAgreementsForSeat`, `SideAgreementRow`. `src/shared/sideAgreements.ts`: `sideAgreementStanding`, `SideAgreementKind`. `src/main/gameDb/dbConnection.ts`: `gameDbOps`.

**Stop if** the bar fails before any edit.

---

## Phase 1 — One Threshold

Every map uses 90%. The knockout rule is still one attacker against one home; that changes in Phase 3. After this phase the global map prints the urban-share progress lines it never printed before, because its share is no longer null. That is expected.

**Add:** nothing.
**Edit:** `src/shared/victoryRules.ts`, `src/shared/activeGameMap.ts`, `src/shared/regionalRulesCatalog.ts`, `src/main/gameMap/loadGameMap.ts`

### Steps

1. `victoryRules.ts`: add `HOME_CONTROL_WIN_MIN_URBAN_SHARE` and `NEAR_KNOCKOUT_MAX_CITY_HEXES` exactly as in the Design section, with full orienting comments.
2. `activeGameMap.ts`: import `HOME_CONTROL_WIN_MIN_URBAN_SHARE` from `./victoryRules` and set `controlWinMinUrbanShare: HOME_CONTROL_WIN_MIN_URBAN_SHARE` in `GLOBAL_GAME_MAP`. Update any comment in this file that says the global map uses every hex.
3. `regionalRulesCatalog.ts`: delete `REGIONAL_CONTROL_WIN_MIN_URBAN_SHARE` and its comment.
4. `loadGameMap.ts`: import `HOME_CONTROL_WIN_MIN_URBAN_SHARE` from `../../shared/victoryRules` and use it in the regional profile. Remove `REGIONAL_CONTROL_WIN_MIN_URBAN_SHARE` from the import.
5. Search `src` for `REGIONAL_CONTROL_WIN_MIN_URBAN_SHARE` and for `0.75` used as a control share. Production code must have no hits. A test that passes `0.75` as its own input keeps it.

### Tests

No new tests: a constant's value is not a contract (rule 03). The existing tests below check that the rules still behave.

**Tests to run:** `dist/shared/victoryRules.test.js`, `dist/main/gameActions/endOfTurnOutcome.test.js`, `dist/main/gameActions/homeControlProgress.test.js`, `dist/main/openRouter/scenarioGoals.test.js`, `dist/main/openRouter/consultPromptParts.test.js`, `dist/main/openRouter/openRouterMatrix.test.js`, `dist/shared/knockoutNotice.test.js`. If one fails only because it expected `75%` from the map profile, or expected the global map to print no progress lines, update it in this phase and record it in the Completion Log.

### Verification

Run the Phase Check. `check:circular` must show no new cycle from `activeGameMap.ts` importing `victoryRules.ts`.

---

## Phase 2 — Counting a Lost Home

`computeHomeLossProgress` exists and is tested. `computeHomeControlProgress` shares its counting loop and behaves exactly as before. Nothing calls the new function yet.

**Add:** nothing.
**Edit:** `src/main/gameActions/homeControlProgress.ts`, `src/main/gameActions/homeControlProgress.test.ts`

### Steps

1. Add the private counting helper from the Design section, with a full orienting comment. Rewrite `computeHomeControlProgress` to use it. Its signature, outputs, and log line do not change.
2. Add `HomeLossProgress` and `computeHomeLossProgress` from the Design section. Every field gets a `Contract:` comment.
3. Update the file's top comment, so it says the file counts a home's urban cells two ways: those one side holds, and those its owner has lost.

### Tests

In `homeControlProgress.test.ts`, every existing case must pass unchanged. Add these for `computeHomeLossProgress`, with owner `a1`, home hexes `h1` (10 cells), `h2` (5 cells), and `h3` (0 cells, open water), share 0.9:

- `h1` held by `a2`, `h2` held by `'neutral'`, `h3` held by `a1`: `lostUrbanCells` 15, `neededUrbanCells` 14, `lostHexes` 2, `totalHexes` 3, `everyHexRule` false, `homeLost` true.
- Same, but `h2` with no controller: `lostUrbanCells` 10 and `homeLost` false. With `h2` held by `a1`: also false.
- Share `null`: `everyHexRule` true and `neededUrbanCells` 0. With `h1` held by `a2`, `h2` by `'neutral'`, and `h3` uncontrolled, `homeLost` is false. With `h3` held by `a3`, it is true.
- A home whose hexes all have 0 cells, share 0.9: `everyHexRule` true.
- Share 0.9 and 10 total cells: `neededUrbanCells` is 9.
- Empty home: every count 0 and `homeLost` false.

**Tests to run:** `dist/main/gameActions/homeControlProgress.test.js`, `dist/main/gameActions/endOfTurnOutcome.test.js`, `dist/main/gameActions/endOfTurnOutcomeRules.test.js`.

### Verification

Run the Phase Check.

---

## Phase 3 — The Knockout Rule Uses the Lost Home

A side is knocked out when it has lost its home as Locked Decisions 2 to 4 define. `outBy` is the seat holding the most of its home. The notice and the dialog say "Other sides and Neutral hold …".

**Add:** `src/shared/knockoutDialogCopy.test.ts`
**Edit:** `src/main/gameActions/endOfTurnOutcomeRules.ts`, `src/main/gameActions/endOfTurnOutcomeRules.test.ts`, `src/main/gameActions/endOfTurnOutcome.ts`, `src/main/gameActions/endOfTurnOutcome.test.ts`, `src/shared/gameMapTypes.ts`, `src/shared/knockoutNotice.ts`, `src/shared/knockoutNotice.test.ts`, `src/shared/knockoutDialogCopy.ts`, `src/renderer/gameplay/knockoutDialog.ts`, `src/renderer/gameplay/knockoutNotices.ts`

### Steps

1. `endOfTurnOutcomeRules.ts`: replace `controlWinMet` in `EndOfTurnOutcomeInput` with `homeControlLost` as in the Design section, with a `Contract:` comment that says what "lost" means. In `decideEndOfTurnOutcome`, `reasonsFor` calls `input.homeControlLost(victim.seatId)`. `outByFor` always uses the most-home-cells loop; remove its `reasons` parameter and its `home_control` branch. Update the comments of `outBy`, `homeCityCellsControlledBy`, `decideEndOfTurnOutcome`, and `SeatKnockout`, so none mentions "the control seat" or "one other side".
2. `endOfTurnOutcome.ts`: in `evaluateEndOfTurnOutcome`, supply `homeControlLost` as in the Design section. Keep `homeCityCellsControlledBy`. Update the comments of `effectiveControlWinMinUrbanShare`, `baselineUrbanCellsForControlWin`, and `evaluateEndOfTurnOutcome` if they describe one attacker, "control win", or the global every-hex rule.
3. `gameMapTypes.ts`: update the comment on `controlWinMinUrbanShare`. `Contract:` the share of a home's original urban cells that other sides and Neutral must hold together to knock its side out; `null` means every home hex must be held by them. Remove the word "regional".
4. `knockoutNotice.ts`: rename the input field `globalHome` to `everyHexRule`, with a `Contract:` comment: true when the every-hex fallback applies. Replace the `home_control` sentence and remove the line `const outBy = input.outByName ?? 'A side';`. **Exact:**

   ```ts
   const most = input.outByName ? `, ${input.outByName} the most` : '';
   sentences.push(
     input.everyHexRule
       ? `Other sides and Neutral hold all of its home${most}.`
       : `Other sides and Neutral hold ${input.controlShareLabel} of its home's cities${most}.`
   );
   ```

   Update the comments of `everyHexRule` and `controlShareLabel` (their example sentences).
5. `knockoutDialogCopy.ts`: rename `globalHome` to `everyHexRule` the same way, and update its comment's example. In `reasonLead`, the `home_control` sentence becomes, **Exact:** `input.everyHexRule ? 'Other sides and Neutral hold all of your home.' : `Other sides and Neutral hold ${input.controlShareLabel} of your home's cities.``
6. `knockoutDialog.ts` and `knockoutNotices.ts`: rename the property `globalHome: share === null,` to `everyHexRule: share === null,`. Change nothing else.

### Tests

- `endOfTurnOutcomeRules.test.ts`: in `decide`, replace the `control` argument with `homeLost?: (victim: SeatId) => boolean`, default `() => false`, passed as `homeControlLost`. Rewrite each existing use of `control` as a `homeLost` that is true for the same victim. Then:
  - The `byControl` case in "outBy is the seat holding the most home city cells, or the control seat, or nobody" now expects `outBy` to be `AI_SEAT_IDS[0]`, the seat with 5 cells, not `HUMAN_SEAT_ID`. Rename that test "outBy is the seat holding the most home city cells, or nobody".
  - New: a victim whose `homeLost` is true, with `homeCells` 6 for one attacker and 4 for another, is knocked out with reason `home_control` and `outBy` the 6-cell seat.
  - New: two attackers with equal `homeCells` credit the one with the lower `seatOrder`.
  - New: a victim whose `homeLost` is true while every `homeCells` is 0 (Neutral holds its home) is knocked out with `outBy` null.
- `endOfTurnOutcome.test.ts`: these tests use the database. Keep their scenarios. If one fails only because the knockout is now credited to the seat with the most home cells, update the expectation and record it in the Completion Log. Add no new database test.
- `knockoutNotice.test.ts`: rename `globalHome` to `everyHexRule` in `base`. Update the expected text:
  - `W. Turkey holds 75% of its home's cities.` becomes `Other sides and Neutral hold 75% of its home's cities, W. Turkey the most.`
  - `W. Turkey holds all of its home.` becomes `Other sides and Neutral hold all of its home, W. Turkey the most.`
  - Every other assertion that looks for `holds 75%` or `W. Turkey holds` (the reason-order check and the nickname `startsWith` check) changes to the matching new sentence, so the test still checks the same order and the same nickname.
  - Add a case with `outByName: null` that expects `Other sides and Neutral hold 75% of its home's cities.`
- `knockoutDialogCopy.test.ts` (new; copy the imports and style of `knockoutNotice.test.ts`): `formatHumanKnockoutDialog` with `outByName: null`, `reasons: ['home_control']`, `everyHexRule: false`, and `controlShareLabel: '90%'` gives a lead containing `Other sides and Neutral hold 90% of your home's cities.` With `everyHexRule: true`, it contains `Other sides and Neutral hold all of your home.`

**Tests to run:** `dist/main/gameActions/endOfTurnOutcomeRules.test.js`, `dist/main/gameActions/endOfTurnOutcome.test.js`, `dist/main/gameActions/homeControlProgress.test.js`, `dist/main/gameActions/knockoutConsequences.test.js`, `dist/shared/knockoutNotice.test.js`, `dist/shared/knockoutDialogCopy.test.js`.

### Verification

Run the Phase Check. Then search `src` for `globalHome` and for `controlWinMet` used as an outcome input. Expect no hits outside `homeControlProgress.ts` and its test.

---

## Phase 4 — Knockout Status Data

The status each commander will see exists and is tested. Nothing uses it yet.

**Add:** `src/main/gameActions/knockoutStatus.ts`, `src/main/gameActions/knockoutStatus.test.ts`
**Edit:** nothing.

### Steps

1. `knockoutStatus.ts`: write the types, `buildKnockoutStatus`, and `knockoutStatusForSeat` from the Design section. Full orienting comments on every type, field, and function. Import `computeHomeLossProgress`, `computeHomeControlProgress`, and `HomeLossProgress` from `./homeControlProgress`. Import `effectiveControlWinMinUrbanShare` and `baselineUrbanCellsForControlWin` from `./endOfTurnOutcome`. Import the database readers from `../gameDb`, as `endOfTurnOutcome.ts` does.

### Tests

`knockoutStatus.test.ts` (copy the imports and `seat(...)` helper style of `endOfTurnOutcomeRules.test.ts`). Test `buildKnockoutStatus` only. Use AI seats `a1` (the viewer), `a2`, and `a3`, plus `a4` already out, share 0.9, and a `baselineUrbanCellsForHex` backed by a small map.

- `own` is `a1`. `enemies` are `a2` then `a3`. `a4` is not an enemy.
- `a2`'s home is `h1` (10 cells) and `h2` (5 cells). With `h1` held by `a1` and `h2` held by `'neutral'`: its `homeLoss.lostUrbanCells` is 15, its `homeLoss.homeLost` is true, and its `viewerHeldHomeUrbanCells` is 10.
- `cityHexes` lists only hexes with current `urbanHexCount > 0` controlled by that seat, sorted by cells descending, then by `h3Index`.
- A viewer that is out, or not in `seats`, gives null.

**Tests to run:** `dist/main/gameActions/knockoutStatus.test.js`.

### Verification

Run the Phase Check.

---

## Phase 5 — What the Commanders Are Told

The strategic briefing shows each side's knockout status, and every win-rule sentence describes the new rule. `homeControlProgressForSeat` is gone.

**Add:** nothing.
**Edit:** `src/main/openRouter/scenarioGoals.ts`, `src/main/openRouter/scenarioGoals.test.ts`, `src/main/openRouter/promptSpec/coachingTextStrategic.ts`, `src/main/openRouter/promptSpec/coachingGates.ts`, `src/main/openRouter/consultPromptParts.ts`, `src/main/gameActions/endOfTurnOutcome.ts`, `src/main/openRouter/openRouterMatrix.test.ts`, `src/main/openRouter/tacticalPromptSectionParity.test.ts`, `src/main/openRouter/consultPromptParts.test.ts`

### Steps

1. `scenarioGoals.ts`:
   - Change `WIN_CONDITION_REMINDER_FIRST_SENTENCE`, `REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET`, `regionalControlSnippet`, and `regionalWinPathsBullet` to the Exact text in the Design section. Update their comments.
   - Add `REGION_VS_REGION_SCENARIO_NO_CITY_SNIPPET`, and change the objective list in `buildScenarioObjectiveRulesBlock` to the Exact three-path list.
   - Delete `EnemyUrbanProgress` and `enemyProgressRows`. Rewrite `buildScenarioProgressLines(state, status)` to the Design section, with one private helper per row kind (`ownStatusLines`, `enemyStatusLines`) and the two phrase helpers. Import `KnockoutStatusForSeat` and `SideKnockoutStatus` as types from `../gameActions/knockoutStatus`, `NEAR_KNOCKOUT_MAX_CITY_HEXES` from `../../shared/victoryRules`, and `formatHomeRegionHexCodesForPrompt` from `./consultPromptPartsHelpers`.
   - Remove the `HomeControlProgress` import if nothing else uses it.
   - **If `check:circular` reports a new cycle through `consultPromptPartsHelpers.ts`,** do not import it. Instead, add a private `strategicHexCodeForPrompt(h3Index: string): string` to `scenarioGoals.ts`. It returns `h3ToCode(h3Index, { mode: 'strategic' })` from `../briefing/map/hexCodeTranslator`, and on a thrown error returns `h3Index`. That is the same behavior as `formatHomeRegionHexCodesForPrompt` for one hex. Record the choice in the Completion Log.
2. `coachingTextStrategic.ts`: change `WIN_PATHS_BULLET` to the Exact text, and update its orienting comment.
3. `coachingGates.ts`: update the comment on `controlWinMinUrbanShare`. It is the share the knockout rule uses on every map, and null only when the every-hex fallback applies. Do not change code.
4. `consultPromptParts.ts` (must not grow):
   - Replace `let homeControl: ReturnType<typeof homeControlProgressForSeat> = null;` and its `try` block with the same shape for `knockoutStatusForSeat(ownSeat)`, in a variable named `knockoutStatus`. Keep the `logError` call and name the new function in its message.
   - Replace the line that reads `homeControl?.controlWinMinUrbanShare` with `const controlWinMinUrbanShare = knockoutStatus?.share;`.
   - Replace the `buildScenarioProgressLines(state, { ... })` call with `buildScenarioProgressLines(state, knockoutStatus)`.
   - Fix the imports.
5. `endOfTurnOutcome.ts`: delete `homeControlProgressForSeat` and `SeatHomeControlPair`, with their comments. Remove imports that lint then reports unused.
6. Search `src` for `homeControlProgressForSeat`, `SeatHomeControlPair`, `EnemyUrbanProgress`, and `Win at end of turn by either`. Expect no hits.

### Tests

- `scenarioGoals.test.ts`: replace the old progress-line tests with tests of the new `buildScenarioProgressLines`, built from a hand-written `KnockoutStatusForSeat`:
  - Share rule, own row with 2 city hexes: the first line equals the own share template filled in, and the second line starts with `  Your city hexes: `.
  - An enemy with 7 city hexes gets one line, the enemy share template, and no listing.
  - An enemy with 2 city hexes, all explored: the listing ends with `Taking all of them knocks it out.` With one of them unexplored: `Its known city hexes:` and `Some of its city hexes are unexplored.` With none explored: `  Its city hexes are unexplored.`
  - Every-hex rule (`share: null`, `everyHexRule: true`): the own and enemy every-hex templates.
  - Counts 0, 1, and 3 give `no city hexes`, `1 city hex`, and `3 city hexes`. One urban cell gives `1 urban cell`.
  - A `scenarioId` other than `region_vs_region`, or `status` null, gives `[]`.
  - `buildScenarioObjectiveRulesBlock` with share 0.9 contains `90% of its original urban cells` and the `(3)` path. With share null it contains `every hex of the enemy home region`.
  - The hex-code formatter needs the strategic registry. If it cannot translate a test h3 index, it returns the raw index. Assert on what it returns for your fixture, as the existing tests in this file do.
- `openRouterMatrix.test.ts` (must not grow), `tacticalPromptSectionParity.test.ts`, `consultPromptParts.test.ts`: they reference the changed constants. Update only assertions that fail because of the Exact text changes in this phase, and record each in the Completion Log.

**Tests to run:** `dist/main/openRouter/scenarioGoals.test.js`, `dist/main/openRouter/consultPromptParts.test.js`, `dist/main/openRouter/openRouterMatrix.test.js`, `dist/main/openRouter/tacticalPromptSectionParity.test.js`, `dist/main/gameActions/endOfTurnOutcome.test.js`, `dist/main/gameActions/knockoutStatus.test.js`.

### Verification

Run the Phase Check. Confirm `consultPromptParts.ts` and `openRouterMatrix.test.ts` have no more lines than their Phase 0 counts.

---

## Phase 6 — Campaign Targeting Finishes Weak Sides

**Add:** `src/main/openRouter/campaignPactPartners.ts`, `src/main/openRouter/campaignPactPartners.test.ts`, `src/main/openRouter/campaignTargetSelection.test.ts`
**Edit:** `src/main/openRouter/campaignTargetSelection.ts`, `src/main/openRouter/campaignObjectiveFlow.ts`, `src/main/openRouter/campaignRules.test.ts`, `src/main/operations/landOperationCandidates.ts`

### Steps

1. `campaignPactPartners.ts`: write `CAMPAIGN_PACT_KINDS`, `pactPartnerSeatIdsFrom`, and `readActivePactPartnerSeatIds` from the Design section, with full orienting comments.
2. `campaignTargetSelection.ts`: add the two `CampaignCity` fields, the `finishingExemptSeatIds` argument, `CAMPAIGN_FINISHING_WEIGHT`, and `campaignCityWeight`, as in the Design section. `scoreCampaignCity` and `campaignScoreBeats` use `campaignCityWeight`. Export `campaignScoreBeats`. Update the comments of `CAMPAIGN_ENEMY_HOME_WEIGHT` (it now applies when the holder is the home side), `scoreCampaignCity`, `campaignScoreBeats`, and `knownCampaignCities`.
3. `campaignObjectiveFlow.ts`: in `campaignInputsFromState`, read the pact partners and pass them to `knownCampaignCities`, as in the Design section. Update the function's comment to mention them.
4. `landOperationCandidates.ts`: delete the private `scoreBeats` function and its comment. Call `campaignScoreBeats` where `scoreBeats` was called. Remove the imports of `CAMPAIGN_ENEMY_HOME_WEIGHT` and `CAMPAIGN_FORTIFICATIONS_PER_PENALTY_STEP` if they become unused. The `inEnemyHome: city.inEnemyHome` line in the candidate object stays.
5. `campaignRules.test.ts`: the helper that builds a `CampaignCity` (it returns `{ h3Index, urbanHexCount, ownerSeatId: 'a2', inEnemyHome, knownFortifiedCount }`) adds `heldByHomeSide: inEnemyHome, ownerNearKnockout: false`. Inline `CampaignCity` literals in that file get the same two fields, with `heldByHomeSide` equal to their `inEnemyHome` and `ownerNearKnockout: false`. Any call of `knownCampaignCities` in that file passes `finishingExemptSeatIds: new Set()`. That keeps every existing ranking: home cities keep the home weight, and no city gets the finishing weight. Change no assertion.

### Tests

`campaignPactPartners.test.ts` (copy imports and style from `campaignRules.test.ts`; build `SideAgreementRow` literals from that type's fields). Test `pactPartnerSeatIdsFrom`:

- An `active` `non_aggression` row with an active counterpart, whose end turn is not past: the counterpart is in the set.
- The same with kind `ceasefire_in_place`: in the set.
- Kind `joint_action`, status `proposed`, an end turn before the current turn, or an inactive counterpart: not in the set.

`campaignTargetSelection.test.ts` (copy imports and style from `campaignRules.test.ts`):

- `knownCampaignCities` with enemies `a2` and `a3`, and `h1` in `a2`'s home: held by `a2`, `inEnemyHome` and `heldByHomeSide` are both true. Held by `a3`, `inEnemyHome` is true and `heldByHomeSide` false. A city outside every home gives both false.
- `ownerNearKnockout`: `a2` holding 5 listed cities gives true on each; 6 gives false. `a2` holding 2 cities while `a2` is in `finishingExemptSeatIds` gives false.
- `campaignCityWeight`: 1 (neither), 2 (home side only), 3 (finishing only), 6 (both).
- `chooseCampaignTarget`, the worked example from Locked Decision 9: a 17-cell city 1 step away with `ownerNearKnockout` true beats a 40-cell home-side city 5 steps away. With `ownerNearKnockout` false, the 40-cell city wins.
- A city in `a2`'s home held by `a3`, with no finishing weight, loses to an otherwise equal city held by its home side.

**Tests to run:** `dist/main/openRouter/campaignPactPartners.test.js`, `dist/main/openRouter/campaignTargetSelection.test.js`, `dist/main/openRouter/campaignRules.test.js`, `dist/main/openRouter/campaignObjectiveFlow.test.js`, `dist/main/openRouter/campaignTargetOverride.test.js`, `dist/main/operations/landOperationCandidates.test.js`, `dist/main/operations/operationCandidates.test.js`, `dist/main/operations/operationCommandsLand.test.js`, `dist/main/openRouter/briefingSectionsOperations.test.js`.

### Verification

Run the Phase Check. Search `src` for `function scoreBeats`. Expect no hits.

---

## Phase 7 — Docs, Version 3.3.0, Final Verification, and Hand-Off

**Add:** `doc/release-notes/v3.3.0.md`
**Edit:** `package.json`, `package-lock.json` (both by `npm version` only), `README.md`, `doc/README.md`, `doc/region-vs-region.md`, `doc/hybrid-ai.md`, `doc/how-to-play.md`, `doc/ai-commander-prompts/strategic-prompt.md`, `doc/ai-commander-prompts/source-inventory.md`, plus any other maintained `doc/` file the search in step 2 finds

### Steps

1. **Version.** Run `npm version 3.3.0 --no-git-tag-version`. It must change only the version fields of `package.json` and `package-lock.json`.
2. **Find stale text.** Search `doc/` (not release notes older than 3.3.0, not the historical documents `AGENTS.md` names) for each of these. Fix every maintained hit **that describes home control, knockouts, the knockout status, or campaign scoring** so it describes the new rules, and leave hits about other subjects alone. Terms: `75%`, `every strategic hex of the home`, `every hex`, `one other side controls`, `Another active seat meets the control rule`, `control win`, `holds all of its home`, `holds all of your home`, `homeControlProgressForSeat`, `buildScenarioProgressLines`, `you need`, `CAMPAIGN_ENEMY_HOME_WEIGHT`, `REGIONAL_CONTROL_WIN_MIN_URBAN_SHARE`, `scoreBeats`. Take every number and name from the code, and name the symbol it comes from.
3. **Required doc changes:**
   - `doc/region-vs-region.md`, win evaluation:
     - The home control reason is the 90% rule on both maps (`HOME_CONTROL_WIN_MIN_URBAN_SHARE`): other seats and Neutral together, with unclaimed hexes counting for no one, as `computeHomeLossProgress` defines.
     - Say when the every-hex fallback applies.
     - `outBy` is the seat holding the most home cells, for every reason; Neutral is never credited.
     - Update the paragraph on the goal sentence and the Scenario Objective block (three paths), and the paragraph on progress lines (the knockout status lines, and the near-knockout listing at `NEAR_KNOCKOUT_MAX_CITY_HEXES`).
   - `doc/hybrid-ai.md`:
     - The campaign score is `urban × weight ÷ ((steps + 2) × (1 + known forts ÷ 4))`, with `campaignCityWeight`, `CAMPAIGN_ENEMY_HOME_WEIGHT` (the holder is the home side), and `CAMPAIGN_FINISHING_WEIGHT`.
     - The finishing weight is withheld from active pact partners (`CAMPAIGN_PACT_KINDS`).
     - Land operations use the same comparator.
   - `doc/README.md`:
     - In the engine constants table, add `HOME_CONTROL_WIN_MIN_URBAN_SHARE` and `NEAR_KNOCKOUT_MAX_CITY_HEXES` to the win-rules row, and `CAMPAIGN_FINISHING_WEIGHT`, `campaignCityWeight`, and `CAMPAIGN_PACT_KINDS` next to `CAMPAIGN_ENEMY_HOME_WEIGHT`. Follow the update instructions around that table.
     - Add a release paragraph above the 3.2.1 paragraph, in the same voice. **Release 3.3.0** knocks a side out when other sides and Neutral hold 90% of its home's original city cells, on every map. It shows each commander how close every side is to being knocked out, and lists the city hexes of a side with five or fewer. It makes campaigns favor finishing nearly beaten sides, except a commander's pact partners.
     - Update the shipping version.
   - `doc/how-to-play.md`, winning and losing: the new home rule and the "Other sides and Neutral hold …" notice.
   - `doc/ai-commander-prompts/strategic-prompt.md` and `source-inventory.md`: the new Scenario Progress lines, the changed sentences, and `knockoutStatusForSeat` in place of `homeControlProgressForSeat`. Update `example-strategic-prompt.md` only if it shows the old progress lines or the old objective list.
   - Any `doc/ux/` document that quotes the knockout notice or dialog text, and its Code Entry Points if a named symbol changed.
4. **Release notes.** Write `doc/release-notes/v3.3.0.md`, starting from `doc/release-notes/v3.2.1.md`:
   - Change every `3.2.1` in the downloads and first-launch steps to `3.3.0`.
   - In the saves bullet, keep its existing sentences with their version numbers moved forward one release ("A save from 2.12.0 through 3.2.1 still opens. A save from 2.10.0 or earlier will not load in 3.3.0."), and keep the agreements sentence as written. Add: "A save's match uses the new knockout rules from its next turn, so a side that has already lost 90% of its home is knocked out at the end of that turn."
   - Replace "What's in 3.2.1" with "What's in 3.3.0": three short sections, for the knockout rule, the commanders' knockout status, and campaign targeting.
   - Add "Known limits": a side that loses most of its home in one or two turns is knocked out at once, with no grace period; the regional threshold rises from 75% to 90%; and home hexes nobody holds count for no one.
5. **README.md:** the executable names under Play it, the version under Status, the releases list (a **3.3.0** bullet matching the `doc/README.md` paragraph), and the test count under What's inside (the count `npm test` prints).
6. Run the Verification Bar. Record each result.
7. Search changed **and new** files for plan vocabulary (`git diff` does not list new files). Run `git status --short`, then search each listed file under `src/`, `doc/`, and `README.md` for `phase`, `Phase`, `execution plan`, and `step` used as a plan label. Expect no hits apart from words that were already in those files.

### Manual checklist for the user

Hand the user this list in your final message, with the documents you updated.

1. **The running global match.** Load it, or its newest autosave, and press Ready once. South America and Western Europe are both knocked out at the end of that turn. Each notice says "Other sides and Neutral hold 90% of its home's cities, …" and names the side holding the most.
2. **The briefing.** In a development run, after a commander's consult, open the newest `debug-last-user-prompt-*.txt` in the repo root if the app wrote one. Under Scenario Progress there is one "Your side" line and one line per enemy. A side with five or fewer city hexes has its city hexes listed with codes.
3. **The objective text.** The same prompt's Scenario Objective lists three ways to knock an enemy out, with 90%.
4. **A regional match.** Start one, play two turns, and check that the briefing says 90%, not 75%.
5. **Campaign targets and pacts.** In a match where a side drops to five or fewer city hexes, a commander near it with no active non-aggression pact or ceasefire with it picks one of its cities as the campaign target. A commander with such a pact gets no finishing bonus against it. Check `campaign_objectives` in the database, or the campaign line in the briefing.

---

## Reliability Checklist

- [ ] Each phase's files were backed up before the first edit.
- [ ] The Phase Check ran and passed at the end of every phase from 1 to 6.
- [ ] `HOME_CONTROL_WIN_MIN_URBAN_SHARE` is the only control share in production code, and `REGIONAL_CONTROL_WIN_MIN_URBAN_SHARE` no longer exists.
- [ ] One private loop counts home cells. The knockout rule, the outBy credit, the status lines, and the "yours" count all go through `computeHomeLossProgress` or `computeHomeControlProgress`.
- [ ] Uncontrolled home hexes count for no one. Neutral-held hexes count as lost.
- [ ] `campaignScoreBeats` is the only city comparator. `landOperationCandidates.ts` has no copy.
- [ ] An agreement read that fails cannot stop a campaign: it logs and returns no pact partners.
- [ ] No comment still describes one attacker, the global every-hex rule, 75%, or a "regional" share.
- [ ] `consultPromptParts.ts` and `openRouterMatrix.test.ts` did not grow.
- [ ] Every new or updated declaration has a full orienting comment that is not generic filler.
- [ ] No log line carries anything but seat ids, turn numbers, and counts.
- [ ] `npm run check:circular` shows only the Phase 0 cycles.
- [ ] No baseline file was edited.
- [ ] No commit, push, stash, checkout, restore, reset, or clean was run.
- [ ] No plan vocabulary appears in `src/`, `static/`, `README.md`, or `doc/`.

## Success Definition

- A side whose home's original urban cells are at least 90% held by other seats and Neutral is knocked out at the end of the turn, on every map, with `outBy` the seat holding the most of its home. Unclaimed home hexes count for no one.
- The knockout notice and dialog say "Other sides and Neutral hold …".
- Every strategic briefing shows each side's city hex count and home-loss status, and lists the city hexes of any side holding five or fewer.
- The win-rule sentences describe the new rule and the three ways to knock a side out.
- Campaigns and land operations rank cities with one comparator. It applies the finishing weight, except against active pact partners, and the corrected home weight.
- The app version is 3.3.0, with release notes and updated docs.
- The Verification Bar passes.

---

## Phase 0 Inventory

| Item | Value |
|------|-------|
| `git status --short` | `?? .spec/2026-11-21-knockout-rules-and-finishing-execution-plan.md` |
| `npm test` | Not run at baseline, by the user's instruction (the release had just shipped). |
| `npm run build:renderer` | Not run at baseline; `build:main` passed. |
| `check:circular` cycle list | None (`check-circular-deps: ok (no circular dependencies)`). |
| Line counts (consultPromptParts, openRouterMatrix test, scenarioGoals, endOfTurnOutcome, campaignTargetSelection, campaignObjectiveFlow) | 609, 678, 312, 265, 240, 312 |
| Prerequisites present | All. |
| Missing symbols | None. |

## Defect Inventory

| Phase | Command | First error | Action taken |
|-------|---------|-------------|--------------|
| 1 | `node dist/main/gameActions/endOfTurnOutcome.test.js` | `no_city_hexes` was reason index 1, not 0: the 90% share on the global map now also gives `home_control`. | Assertion changed to check `no_city_hexes` precedes `home_cities_destroyed`. |
| 3 | `npm run build:main` | `standings.test.ts` used the renamed `globalHome` field. | Renamed to `everyHexRule`. |
| 3 | `node dist/main/gameActions/knockoutConsequences.test.js` | No knockout: the victim's units kept 4 of 25 home hexes (88% lost, under 90%). | Fixture now deletes the victim's units before Ready. |
| 6 | `npm run build:main` | `seaOperationCandidates.ts` calls `knownCampaignCities` without `finishingExemptSeatIds`. | Passes an empty set; sea operations do not use the weights. |
| 6 | `node dist/main/openRouter/campaignRules.test.js` (expected) | The `knownCampaignCities` deepEqual lists single-city holders, which are now near knockout. | Their expected `ownerNearKnockout` became `true`. |

## Completion Log

| Phase | Result | Sketch differences | Files changed outside the Add/Edit lists | Docs updated |
|-------|--------|--------------------|------------------------------------------|--------------|
| 0 | Prerequisites present; no cycles | Full bar skipped by the user | None | None |
| 1 | Phase Check passed; listed tests pass | None | `src/main/gameActions/endOfTurnOutcome.test.ts` | None |
| 2 | Phase Check passed; 10 tests in `homeControlProgress.test.js` | Helper `countHomeHexes` takes one parameter object (controlByHex added) | None | None |
| 3 | Phase Check passed; listed tests pass | The every-hex rules test also asserts an out seat is never asked about its home | `src/shared/standings.test.ts`, `src/main/gameActions/knockoutConsequences.test.ts` | None |
| 4 | Phase Check passed; 4 tests | None | None | None |
| 5 | Phase Check passed; `consultPromptParts.ts` 602 lines, matrix test 678 | `formatHomeRegionHexCodesForPrompt` imported (no cycle) | None | None |
| 6 | Phase Check passed; listed tests pass | `campaignRules.test.ts` deepEqual expectation changed (see Defect Inventory) | `src/main/operations/seaOperationCandidates.ts` | None |
| 7 | Version 3.3.0; docs and release notes written; final `npm test` stopped early at the user's request (no failures in 202 completed files); targeted tests pass | README test count left at its old value until a full run prints the new one | `src/main/openRouter/consultPromptParts.ts` territory sentence, `coachingGates.ts` summary (review fixes) | README.md, doc/README.md, region-vs-region.md, combat-rules-v3.md, game-vision-v2.md, how-to-play.md, region-summary-1.md, hybrid-ai.md, ai-commander-prompts/{strategic-prompt, example-strategic-prompt, source-inventory, information-decision-model, variants}.md, release-notes/v3.3.0.md |
