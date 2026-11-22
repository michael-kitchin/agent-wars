# Posture Choice and Fit Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** AI commanders make a real posture choice every strategic turn, the engine records it, and the briefing's advice tells enemies apart. Four changes ship together as release 3.4.1:

1. **An explicit posture is always recorded.** Declaring `overland` with no stored posture now stores it and starts the 6-turn hold, like any other posture. Today it is treated as an echo of the default and dropped.
2. **Posture fit measures a real force.** An enemy home counts as reachable by land only when enough of the commander's ground units are within the campaign's land reach. Each Fit line prints the step count.
3. **A posture attention flag.** When the current posture does not fit the side that holds the campaign target, Attention Flags says so.
4. **`posture` is required** in every strategic reply. A reply that still leaves it out keeps the current posture, silently.

**Shape:** Phase 0 records a baseline. Phase 1 records explicit choices. Phase 2 reworks the fit rule and its lines. Phase 3 adds the attention flag. Phase 4 makes the field required and updates the prompt text. Phase 5 updates the docs, sets version 3.4.1, runs the final checks, and hands off.

**Tech:** TypeScript (Electron main, shared modules), `better-sqlite3`, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`.

**Shell:** Windows PowerShell. Working directory `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Targeted testing only.** Every phase ends with the Phase Check: static checks plus the tests that phase names. Never run `npm test`, `npm run ui:smoke`, or `npm run doc:shots`, and never run test files the phase does not name. The user runs the full test, review, and fix pass afterwards.
- **Stop only when a check fails** and you cannot fix it within the phase's file lists. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, except to remove an import that lint reports unused in a listed file, or to fix a test that fails only because of a change the phase names. Record every such file in the Completion Log.
- Find code by the quoted text, not by a line number.
- **Code blocks are sketches** unless marked **Exact**. Write the real code from the file you just read. When a sketch and the file disagree, the file wins; record the difference in the Completion Log. Text marked **Exact** is copied character for character, including punctuation and spacing. In Exact text, `${name}` means the value of that variable or constant, interpolated in a template literal.
- **Tests come first.** Write a new function's test with the function, and run it before any existing code calls it.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Set `$step` to the phase number and `$files` to that phase's **Edit** list.

```powershell
$step = '1'
$files = @('src/main/operations/postureChoice.ts', 'src/main/operations/postureChoice.test.ts')
$backup = Join-Path $env:TEMP "aw-posture-choice\step-$step"
foreach ($f in $files) {
  $dest = Join-Path $backup $f
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item $f $dest -Force
}
```

To revert a phase:

```powershell
foreach ($f in $files) { Copy-Item (Join-Path $backup $f) $f -Force }
```

---

## Verification

### Native module

Tests that open a database load `better-sqlite3` under Node, and `npm install` builds it for Electron. Phase 0 runs `npm run rebuild:native:node`, and Phase 5 runs `npm run rebuild:native:electron` last, so the app starts again.

- **Native module lock.** If a rebuild fails with `EBUSY` on `better_sqlite3.node`, close any running Electron app, rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`, run the rebuild again, then delete the `.locked` file.

### Phase Check

Every phase from 1 to 5 ends with the Phase Check, run from the repo root:

```powershell
npm run build:main
npm run lint
npm run check:circular
```

- Add `npm run check:renderer-types` when the phase adds or edits any file under `src/shared`. This plan edits none, so it should not be needed. Run it anyway in Phase 5.
- Then run, with `node dist/main/<path>.test.js`, every test file the phase adds and every existing test file the phase lists under **Tests to run**, and no others. All must pass.
- `check:circular` must print **no** cycle.
- A static check or a named test that already failed in Phase 0 is not yours to fix. A **new** failure is.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a check pass.
- **No test may call a real model.** Do not start the app.
- Record each Phase Check result in the Completion Log.

---

## Non-Goals

- No change to what any posture does (`POSTURE_SETTINGS`), to the hold length (`POSTURE_MIN_HOLD_TURNS`, 6), or to the default posture (`overland`).
- The engine never chooses a posture.
- No change to the land graph or the map data. The Bering link between Eastern Asia and Northern America, and Western Europe's Caribbean and Guiana home hexes, stay as they are.
- No change to the campaign, campaign lifts, raids, or the charts. A declared overland now shows on the posture strip as declared, because the strip already reads the stored row.
- No change to tactical (battle) prompts or their schema.
- **No change to the two JSON examples** (`getFinalJsonOrdersExampleBlock` and `buildRepairSchemaText`). The first is called from `consultPromptParts.ts`, which must not be edited. An example `posture` value could also be copied word for word and switch a commander's posture back. Both examples therefore still omit `posture`. A reply that follows them keeps its posture (Locked Decision 3). The schema's `required` list and text P2 are what ask for the field.
  - The drift test in `envelopeJsonSchema.test.ts` (`testTaughtExamplesFitSchema`) uses gates without `includePosture`, so it still passes. Do not add `includePosture` to its gates.
- Do not edit anything under `.spec/completed/`, release notes of earlier versions, or the historical documents named in `AGENTS.md`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`.

- **Orienting comments.** Every new or changed declaration, and every field of an interface or parameter-object type, has a JSDoc block: a one-line summary, then `Purpose:` (or `Contract:` for types and fields), `When to use:`, `Expected outcome:`, and `Exceptions:`. Update every comment whose behavior this plan changes, so none still says an explicit default is an echo, that `posture` is optional, or that one unit within 30 steps makes a home reachable. No generic filler.
- **Logging (rule 02).** Only `src/main` logs. Database readers and flow functions log `logDebug` on entry. Pure functions that run per enemy or per unit log `logTrace`. Every catch logs `logError` with the error. Log seat ids, turn numbers, and counts only.
- **Names.** Use the file and symbol names this plan gives. camelCase functions, PascalCase types, UPPER_SNAKE constants.
- **No plan vocabulary** in code, comments, test names, or `doc/`.
- **Seat ids:** no literals in production code.
- **Size limits (rule 09).** Files should stay under 600 lines and must stay under 1000. `src/main/openRouter/consultPromptParts.ts` must not be edited. `postureFit.ts` (263 lines in 3.4.0) may grow to at most 420.
- **Mutability (rule 13)**, **arguments (rule 10):** at most 2 parameters, or one parameter object with a commented type.
- **Tests (rule 03).** Test contracts, not private helpers or call order. Copy the structure of the sibling test file named in each phase.
- **Reuse (rule 06).** One function decides an enemy's fits and is used by both the Fit lines and the attention flag. The campaign target's holder comes from the one helper the Campaign Objective section already uses, exported (Phase 3).
- **Docs.** Phase 5 updates `doc/`. Do not edit `doc/` earlier.

---

## Evidence From the 3.4.0 Match

At turn 58 the stored postures row was still empty for all four seats. The repo's `debug.log` covers turns 15 to 28:

- **The advice was built.** The Posture section and its Fit lines were built for all 56 strategic consults, without errors.
- **Every declaration was dropped.** 8 replies declared `overland`. Each was logged `postureChoice unchanged … echoed: true` and never stored. No other posture was declared, and no `posture dropped` reason appeared.
- **The fit rule called almost every enemy reachable by land.** Reproduced on the saved turns, the test counted a home as reachable when any one ground unit was within 30 land steps. Three things made that nearly always true:
  - On the land graph, Eastern Asia's and Northern America's homes are 4 land steps apart, by the Bering link.
  - Western Europe's home includes Caribbean and Guiana hexes, which touch the Americas.
  - One unit in a foothold counted as reach.

  So nearly every Fit line said overland, and the commanders either declared overland or omitted the field.

---

## Locked Decisions

1. **Recording.** `applyPostureChoice` writes the row whenever **no row is stored**, whatever the posture, `overland` included, with `sinceTurn` = this turn. That starts the hold. A choice equal to a **stored** posture changes nothing (no new `sinceTurn`). Changing a stored posture inside the hold is refused, as now.
2. **Required field.** `posture` is in the strategic envelope's `required` list whenever the field is offered, and its schema becomes an enum of `POSTURES`. The schema stays `strict: false`.
3. **Missing field.** A strategic reply without `posture` keeps the current posture. Nothing is printed in the next briefing. The engine logs `logDebug` `'requestOrdersApplyParsed posture omitted'` with the seat id and turn.
4. **Land reach is measured from a force.**
   - The force is `force = Math.min(CAMPAIGN_ASSAULT_MIN_UNITS, own ground units not embarked)`, where `CAMPAIGN_ASSAULT_MIN_UNITS` is 6.
   - `landSteps` is the land steps from the enemy's home to the `force`-th nearest such unit. It is null when `force` is 0, or when fewer than `force` units are within `CAMPAIGN_REACH_LIMIT_STEPS` (30).
   - A home is **near by land** when `landSteps !== null && landSteps <= CAMPAIGN_MAX_LAND_STEPS` (12), the campaign's own reach for a new target.
5. **Fits** (replacing the 3.4.0 rule):
   1. Near by land: `['overland']`, plus `'blitz'` when `garrison <= POSTURE_FIT_LIGHT_GARRISON_MAX` (3).
   2. Otherwise, sea-reachable: `['maritime']` when the landing's required force is at most `maritimeCapacity`, else `['strangle', 'maritime']` (unchanged).
   3. Otherwise, `landSteps !== null` (far by land, with no sea route): `['overland']`.
   4. Otherwise: `['strangle']`.
6. **Attention flag** when all of these hold:
   - the consult has a campaign plan;
   - the target's holder is an active enemy with a Fit row;
   - the current posture (the stored one, or `overland` by default) is not in that row's fits.
7. **Release.** 3.4.1, with its own release notes. Nothing is committed.

---

## Design

### Fit data (`postureFit.ts`)

Replace `PostureFitFacts.landReachable: boolean` with two fields:

- `landSteps: number | null`: Locked Decision 4.
- `landForce: number`: the `force` used. It is 0 when the seat has no ground unit.

Add, all exported:

- `forceLandSteps(args: { distances: readonly number[]; force: number }): number | null`, pure. It sorts a copy of `distances` ascending and returns the element at `force - 1`. It returns null when `force <= 0` or `distances.length < force`.
- `nearByLand(facts: Pick<PostureFitFacts, 'landSteps'>): boolean`, pure: `landSteps !== null && landSteps <= CAMPAIGN_MAX_LAND_STEPS`.
- `postureFitsText(fits: readonly Posture[]): string`, pure, **Exact** outputs:
  - `['overland']` → `overland`
  - `['overland', 'blitz']` → `overland, or blitz while its home is this lightly held`
  - `['maritime']` → `maritime`
  - `['strangle', 'maritime']` → `strangle, then maritime`
  - `['strangle']` → `strangle`
- `interface PostureFitRow { readonly seatId: string; readonly name: string; readonly pactPartner: boolean; readonly facts: PostureFitFacts; readonly fits: readonly Posture[] }`.
- `interface PostureFitReport { readonly shipsLine: string; readonly rows: readonly PostureFitRow[] }`.
- `buildPostureFitReport(state: GameStateSnapshot): PostureFitReport | null`. It replaces the body of `buildPostureFitLines` and returns null where that returned `[]`. Changes from 3.4.0:
  - **Home distances.** For each enemy, run `getLandStepDistances` with:
    - `originH3s` = that enemy's home hexes a ground unit may enter, which is each `h3` where `landUnitCanOccupyHex(h3, landMass)` and `(landMass.get(h3)?.waterPct ?? 100) < STRATEGIC_LAND_MAX_WATER_PCT`;
    - `maxDepth: CAMPAIGN_REACH_LIMIT_STEPS`.

    That gives distances **from the home**. `canLandUnitTraverseEdge` checks a shared land-mass id, which works the same in both directions, and the water share of the hex being entered. So searching outward from enterable home hexes gives a unit's march toward the home.
  - **Known approximation (document it in the comment):** the outward search also requires the unit's own hex to be under the water cap, which a march does not. A ground unit on a hex at or above the cap is not counted. That can only make a home look farther, never nearer.
  - `distances` = the steps of every own ground unit that is not embarked, skipping units the search did not reach.
  - `landSteps = forceLandSteps({ distances, force })`.
- `postureFitLinesFrom(report: PostureFitReport | null): readonly string[]`: `[]` for null, otherwise `[shipsLine, ...rows.map(postureFitLine)]`.
- `buildPostureFitLines` is removed. Its one caller moves to the report (Phase 2).

### Fit line — Exact

`postureFitLine(row: PostureFitRow): string` builds:

```text
- Fit, ${name}${pact}: ${reach}. Its home holds ${garrisonCount}${reason}. Fits: ${postureFitsText(fits)}.
```

- `pact` is `' (active pact)'` or `''`.
- `garrisonCount` is `` `${n} ${n === 1 ? 'ground unit' : 'ground units'}` ``.
- `force` below is `` landForce === 1 ? '1 of your ground units is' : `${landForce} of your ground units are` ``.
- `reach`, in this order:
  1. `landSteps === 0`: `` `${force} in its home` ``
  2. `nearByLand`: `` `${force} ${landSteps} ${landSteps === 1 ? 'land step' : 'land steps'} from its home` ``
  3. `landSteps !== null && seaReachable`: `` `${force} ${landSteps} land steps from its home, too far to march, but it can be reached by sea` ``
  4. `landSteps !== null`: `` `${force} ${landSteps} land steps from its home, too far to march, and it cannot be reached by sea` ``
  5. `seaReachable`: `it can be reached only by sea`
  6. otherwise: `it cannot be reached by land or sea`
- `reason` is non-empty only when `fits` is `['strangle', 'maritime']`. It keeps the 3.4.0 wording, after a comma: `` `, so a landing needs ${required}, more than the ${maritimeCapacity} maritime could land` ``, or, when `required === OPERATION_MIN_GROUND_UNITS`, `` `, but maritime could land only ${maritimeCapacity}, fewer than the ${required} any landing needs` ``.

*Examples:*

- `- Fit, Eastern Asia: 6 of your ground units are 4 land steps from its home. Its home holds 8 ground units. Fits: overland.`
- `- Fit, Northern America: 6 of your ground units are 19 land steps from its home, too far to march, but it can be reached by sea. Its home holds 45 ground units, so a landing needs 68, more than the 16 maritime could land. Fits: strangle, then maritime.`

### Attention flag — Exact

`postureAttentionBullet(args: { report: PostureFitReport | null; targetHolderSeatId: string | null; current: Posture; declared: boolean; holdUntilTurn: number | null }): string | null`, pure. It returns null when:

- `report` or `targetHolderSeatId` is null;
- no row has that seat id;
- `row.fits` includes `current`.

Otherwise, with `fitsText = postureFitsText(row.fits)`:

- `holdUntilTurn === null`: `` `Posture: your campaign target is held by ${row.name}, and ${fitsText} fits it. You are on ${current}${declared ? '' : ' by default'}. Set "posture" in your reply to change it.` ``
- otherwise: `` `Posture: your campaign target is held by ${row.name}, and ${fitsText} fits it. You are on ${current} until turn ${holdUntilTurn}.` ``

`holdUntilTurn` is `stored.sinceTurn + POSTURE_MIN_HOLD_TURNS` when a row is stored and that turn is later than the current turn. Otherwise it is null.

### Prompt text — Exact

**P1.** `promptContracts.ts`, the envelope line for `posture`:

```text
"posture": "<posture>"
```

**P2.** `promptContracts.ts`, the posture paragraph:

```text
Required "posture": one of ${POSTURES.join(', ')}. Send your current posture to keep it. A new posture holds for ${POSTURE_MIN_HOLD_TURNS} turns before it can change; the Posture section of the briefing says when.
```

**P3.** `postureRuleText.ts`, two replacements in the opening paragraph:
- `Set it with "posture" in your reply.` → `Name it with "posture" in every reply.`
- `If you never set one you are on overland.` → `Until you name one you are on overland by default.`

**P4.** `postureRuleText.ts`, `POSTURE_FIT_PARAGRAPH`: replace its second sentence (`Overland fits an enemy whose home your ground units can reach by land.`) with:

```text
Overland fits an enemy whose home a real force of your ground units can reach by land within ${CAMPAIGN_MAX_LAND_STEPS} land steps, or one you can reach only by a longer march.
```

Then append this sentence at the end of the paragraph:

```text
When your posture does not fit the side that holds your campaign target, Attention Flags says so.
```

`POSTURE_FIT_PARAGRAPH` becomes a function or a template built from the constant, so the number is never typed by hand.

**P5.** `briefingSectionsPosture.ts`, the no-row status line:

```text
- Posture: ${DEFAULT_POSTURE}, the default. You have not declared one. Name one with "posture" in your reply.
```

---

## Phase 0 — Baseline

**Goal:** Record the starting state.

### Steps

1. Run `npm run rebuild:native:node`, then `npm run build:main`, `npm run lint`, `npm run check:circular`, and `npm run check:renderer-types`. Record each result.
2. Run each existing test file named under **Tests to run** in Phases 1 to 4 once, and record any that already fail.
3. Confirm `"version": "3.4.0"` in `package.json`.
4. Confirm these anchors exist exactly once. Stop if one is missing.
   - `if (args.posture === current) {` in `src/main/operations/postureChoice.ts`;
   - `export function buildPostureFitLines(` in `src/main/openRouter/postureFit.ts`;
   - `fitLines: buildPostureFitLines(args.state),` in `src/main/openRouter/requestOrdersInjection.ts`;
   - `` posture: '"posture": "<optional posture>"', `` in `src/main/openRouter/promptContracts.ts`;
   - `case 'posture':` in `src/main/openRouter/promptSpec/envelopeJsonSchema.ts`;
   - `const required = ['strategy', 'orders'];` in that same file;
   - `` `- Posture: ${DEFAULT_POSTURE}, the default. You may set another at any time.` `` in `briefingSectionsPosture.ts`;
   - `function targetOwnerName(` in `src/main/openRouter/briefingSectionsCampaign.ts`.
5. Record the line counts of `postureFit.ts`, `requestOrdersInjection.ts`, `promptContracts.ts`, and `envelopeJsonSchema.ts`.

### Verification

The Phase 0 Inventory is filled in.

---

## Phase 1 — Record an Explicit Posture

**Goal:** Locked Decision 1.

**Edits:** `src/main/operations/postureChoice.ts`, `src/main/operations/postureChoice.test.ts`

### Steps

1. In `applyPostureChoice`, replace the echo test so that only a **stored** posture can be echoed:

   ```ts
   if (stored !== null && stored.posture === args.posture) {
     logDebug('postureChoice unchanged', { seatId: args.seatId, from: current, to: args.posture, turnNumber: args.turnNumber, echoed: true });
     return { applied: true, dropReasons: [] };
   }
   ```

   The hold check and the write that follow are unchanged. With no row stored, every valid choice is written.
2. Update the function's orienting comment and the file header: an explicit choice is stored even when it names the default, and that starts the hold.

### Tests

`postureChoice.test.ts`:
- add `an explicit overland with no stored row is stored and starts the hold`: no row, choose `overland` on turn 10 → `readPosture` returns `{ posture: 'overland', sinceTurn: 10 }`. Choosing `maritime` on turn 12 is then refused with the existing hold text naming turn 16.
- add `repeating the stored posture keeps its turn`: a stored `maritime` from turn 3, chosen again on turn 5 → `sinceTurn` is still 3.
- Keep the existing cases. If one asserts that an overland choice with no row stores nothing, change it to the new rule and record that.

**Tests to run:** `dist/main/operations/postureChoice.test.js`, `dist/main/openRouter/briefingSectionsPosture.test.js`

### Verification

Phase Check.

---

## Phase 2 — Fit Measures a Real Force

**Goal:** Locked Decisions 4 and 5, with the Design's fit data and Exact line.

**Edits:** `src/main/openRouter/postureFit.ts`, `src/main/openRouter/postureFit.test.ts`, `src/main/openRouter/requestOrdersInjection.ts`

### Steps

1. `postureFit.ts`: apply Design, Fit data and Fit line.
   - Import `CAMPAIGN_MAX_LAND_STEPS` from `./campaignTargetSelection`, `CAMPAIGN_ASSAULT_MIN_UNITS` from `./campaignRules`, and `landUnitCanOccupyHex` and `STRATEGIC_LAND_MAX_WATER_PCT` from `../../shared/landTraversalStrategic`.
   - `postureFitsFor` follows Locked Decision 5, using `nearByLand`.
   - `postureFitLine` takes a `PostureFitRow`.
   - Keep `postureShipsLine`, `POSTURE_FIT_LIGHT_GARRISON_MAX`, the pact lookup, the garrison count, `maritimeCapacity`, and `seaReachable` exactly as in 3.4.0.
   - Delete the forward search from own units. It is replaced by the per-enemy search from the home.
2. `requestOrdersInjection.ts`:
   - Inside `buildStatusInjectionTexts`, compute `const postureFitReport = showOperations ? buildPostureFitReport(args.state) : null;` once, before the posture section is built.
   - Pass `fitLines: postureFitLinesFrom(postureFitReport)` to `buildPostureSection`.
   - Keep `postureFitReport` in a local for Phase 3.

### Tests

`postureFit.test.ts`. Rewrite the cases that built `landReachable` so they build `landSteps` and `landForce`. Every case must cover a contract:

- `forceLandSteps`:
  - `[5, 1, 9, 3]` with force 2 → 3;
  - force 4 → 9;
  - force 5 → null;
  - force 0 → null;
  - `[]` with force 1 → null.
- `postureFitsFor`:
  - `landSteps` 4 with garrison 8 → overland;
  - `landSteps` 4 with garrison 3 → overland, blitz;
  - `landSteps` 12 → overland;
  - `landSteps` 13 with sea, garrison 0, capacity 16 → maritime;
  - `landSteps` 13 without sea → overland;
  - null with sea and garrison 45, capacity 16 → strangle, maritime;
  - null without sea → strangle.
- `postureFitLine`: the two Exact examples in Design, plus one line for each `reach` case, `(active pact)`, and the singular `1 of your ground units is`.
- `postureFitsText`: each Exact output.

**Tests to run:** `dist/main/openRouter/postureFit.test.js`, `dist/main/openRouter/briefingSectionsPosture.test.js`

### Verification

Phase Check. `postureFit.ts` is at most 420 lines.

---

## Phase 3 — The Posture Attention Flag

**Goal:** Locked Decision 6 and the Design's attention flag.

**Edits:** `src/main/openRouter/postureFit.ts`, `src/main/openRouter/postureFit.test.ts`, `src/main/openRouter/briefingSectionsCampaign.ts`, `src/main/openRouter/briefingSectionsCampaign.test.ts`, `src/main/openRouter/requestOrdersInjection.ts`

### Steps

1. `briefingSectionsCampaign.ts`: split `targetOwnerName` in two.
   - Export `campaignTargetHolderSeatId(state: GameStateSnapshot, targetH3: string): string | null`. It returns exactly the `ownerSeatId` the existing code computes: the known controller when the hex is explored (any seat, or null), otherwise the single active enemy home that contains it, otherwise null. Add **no** extra filter.
   - `targetOwnerName` calls it and keeps returning the home region name.
   - The attention flag needs no filter: it only finds a row for an active enemy, and every other holder gets no bullet.
   - Log `logTrace`. No change in behavior.
2. `postureFit.ts`: add `postureAttentionBullet` (Design, Exact). Log `logTrace`.
3. `requestOrdersInjection.ts`:
   - Read the stored posture once with `readPosture({ getOne: dbGetOne }, seatId)`. `buildPostureSection` already receives this row; reuse the same read.
   - Build the bullet with:
     - `report: postureFitReport`;
     - `targetHolderSeatId: campaignPlan ? campaignTargetHolderSeatId(args.state, campaignPlan.objective.targetH3) : null`;
     - `current` = the stored posture, or `DEFAULT_POSTURE`;
     - `declared` = a row is stored;
     - `holdUntilTurn` as in Design.
   - Put the bullet first in the non-tactical `additionalAttention` list, before the missile bullet, inside the existing `.filter`.

### Tests

- `postureFit.test.ts`, `postureAttentionBullet`:
  - null report → null;
  - null holder → null;
  - holder with no row → null;
  - current in fits → null;
  - overland by default against a maritime row → the first Exact text, with ` by default`;
  - a declared overland held until turn 16 against `strangle, then maritime` → the second Exact text.
- `briefingSectionsCampaign.test.ts`: `campaignTargetHolderSeatId` returns the explored controller, the single home seat for an unexplored city, and null for an unexplored hex in two homes. Every existing case passes unchanged.

**Tests to run:** `dist/main/openRouter/postureFit.test.js`, `dist/main/openRouter/briefingSectionsCampaign.test.js`, `dist/main/openRouter/briefingSectionsOperations.test.js`

### Verification

Phase Check.

---

## Phase 4 — `posture` Is Required

**Goal:** Locked Decisions 2 and 3, and the prompt text P1 to P5.

**Edits:** `src/main/openRouter/promptSpec/envelopeJsonSchema.ts`, `src/main/openRouter/promptSpec/envelopeJsonSchema.test.ts`, `src/main/openRouter/promptContracts.ts`, `src/main/openRouter/promptContracts.test.ts`, `src/main/openRouter/promptSpec/postureRuleText.ts`, `src/main/openRouter/promptSpec/coachingText.test.ts`, `src/main/openRouter/briefingSectionsPosture.ts`, `src/main/openRouter/briefingSectionsPosture.test.ts`, `src/main/openRouter/requestOrdersApplyParsed.ts`

### Steps

1. `envelopeJsonSchema.ts`:
   - `case 'posture':` returns `enumSchema([...POSTURES])`. Import `POSTURES` from the shared posture types.
   - In `buildOrdersEnvelopeResponseFormat`, after the `exitBattle` push, add `if (fields.includes('posture')) required.push('posture');`.
   - Update both comments: posture is a required enum when offered.
2. `promptContracts.ts`: P1 and P2.
3. `postureRuleText.ts`: P3 and P4. Import `CAMPAIGN_MAX_LAND_STEPS` from `../campaignTargetSelection`.
4. `briefingSectionsPosture.ts`: P5.
5. `requestOrdersApplyParsed.ts`: in the strategic, orders-on branch, when `parsed.postureChoice` is undefined and no drop reason in this reply starts with `posture dropped:`, log `logDebug('requestOrdersApplyParsed posture omitted', { seatId, turnNumber: planState.turnNumber })`. Nothing else changes.

### Tests

- `envelopeJsonSchema.test.ts`:
  - with posture offered, `required` includes `posture` and the posture schema's `enum` equals `POSTURES`;
  - with it not offered (tactical), `required` does not include it.
  - `testTaughtExamplesFitSchema` and its gates are unchanged (see Non-Goals).
- `promptContracts.test.ts` and `coachingText.test.ts`: update the expected strings that contain P1 to P4. Record each change.
- `briefingSectionsPosture.test.ts`: the no-row line is P5.

**Tests to run:** the four test files above, plus `dist/main/openRouter/promptSpec/envelopeContract.test.js`

### Verification

Phase Check.

---

## Phase 5 — Docs, Version 3.4.1, Final Checks, and Hand-Off

**Goal:** The docs match the code, the version is 3.4.1, and the static checks pass.

**Adds:** `doc/release-notes/v3.4.1.md`
**Edits:** `doc/hybrid-ai.md`, `doc/ai-commander-prompts/strategic-prompt.md`, `doc/ai-commander-prompts/assembly-contract.md`, `doc/ai-commander-prompts/example-strategic-prompt.md`, `doc/ai-commander-prompts/consultation-flow.md`, `doc/ux/charts-dialog.md`, `README.md`, `doc/README.md`, `package.json`, `package-lock.json`

### Steps

1. `doc/hybrid-ai.md`:
   - where postures are stored: an explicit choice is stored even when it is overland, and starts the hold;
   - the posture-fit rule (force, steps, the four cases);
   - the attention flag.
2. `doc/ai-commander-prompts/strategic-prompt.md`:
   - the Posture section content: the no-row line and the Fit line format;
   - the Attention Flags list: the posture bullet;
   - the envelope: `posture` is required, as an enum;
   - the Postures rule block description.

   In `assembly-contract.md`, `example-strategic-prompt.md`, and `consultation-flow.md`, replace each copy of a changed sentence (P1 to P5) with the new text.
3. `doc/ux/charts-dialog.md`: a declared overland is drawn as a declared posture. The outline now means the commander has not declared one yet.
4. `npm version 3.4.1 --no-git-tag-version`.
5. `doc/release-notes/v3.4.1.md`: copy `v3.4.0.md`, change the version everywhere, and keep Downloads and Before you play. In **Saves**, say a 3.4.0 save opens. Replace What's new with `## What's in 3.4.1` and these bullets, **Exact**:
   - `- **Every commander names a posture.** Each strategic reply now includes one. Naming overland is recorded too, and starts the same 6-turn hold as any other posture.`
   - `- **Better posture advice.** An enemy's home counts as reachable by land only when 6 of your ground units, or all of them if you have fewer, are within 12 land steps of it, and each line gives the distance. A home that only a long march reaches says so, and says whether a sea landing could get there instead.`
   - `- **Posture attention.** When a commander's posture doesn't fit the side holding its campaign target, its Attention Flags say so.`
6. `README.md`:
   - Update the executable names and the version under Status.
   - Leave the test count for the user.
   - Add above the 3.4.0 bullet: `- **3.4.1** makes every commander name a posture each turn and records it, including overland. Posture advice now measures whether a real force can march on an enemy's home, and Attention Flags point out a posture that doesn't fit the campaign's target.`
7. `doc/README.md`: the shipping version, and a `Release **3.4.1** …` paragraph above the 3.4.0 one, with the same text.
8. Run `node scripts/check-doc-links.cjs`.
9. Run the Phase Check plus `npm run check:renderer-types`, then `npm run rebuild:native:electron` last.
10. Fill in the Completion Log and give the user the checklist below.

### Manual checklist for the user

Part of your final pass:

1. Start a new match, or load the 3.4.0 save. After one strategic turn, every AI seat has a stored posture, and the posture strip shows filled cells instead of outlines.
2. Open a commander's briefing, from the debug log or the prompt view if you use one. The Fit lines give step counts, and Eastern Asia and Northern America no longer read "reachable by land" from a single straggler.
3. When a side's campaign targets an enemy whose fit is maritime, its Attention Flags carry the posture bullet. Note whether the commander then declares maritime.
4. Watch for replies without `posture`: `requestOrdersApplyParsed posture omitted` in the debug log.

### Verification

The Phase Check passes, `check-doc-links` passes, and the Completion Log is complete.

---

## Reliability Checklist

- [ ] No file outside a phase's lists was edited, except those recorded.
- [ ] `buildPostureFitReport` still has its try/catch, and returns null on error, so a fit failure never breaks a consult.
- [ ] The fit search starts only from home hexes a ground unit may enter (land-mass id and under the water cap).
- [ ] A reply without `posture` changes nothing and fails nothing.
- [ ] No number in P2 or P4 is typed by hand.
- [ ] `consultPromptParts.ts` is unchanged, and `check:circular` prints no cycle.
- [ ] No plan vocabulary in code, tests, or `doc/`.

## Success Definition

- A declared posture, overland included, is stored and holds for 6 turns.
- Fit lines measure a force of 6 ground units (or all, when fewer) against the campaign's 12-step reach, and print the distance.
- The attention flag appears exactly when the posture does not fit the campaign target's holder.
- `posture` is a required enum in the strategic envelope, and a missing one is harmless.
- Docs, version 3.4.1, and the release notes are updated. The named tests and static checks pass.

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
