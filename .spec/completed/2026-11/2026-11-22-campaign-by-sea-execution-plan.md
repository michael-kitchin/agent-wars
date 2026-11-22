# Campaign by Sea Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** When two major powers are left and only an ocean lies between them, they fight it out instead of trading raids. Four changes ship together in release 3.4.0:

1. **Sea operations sail with their whole force.** A muster waits until the ships its troops need are at the port, not until the first ship arrives.
2. **A campaign can choose a target across the sea.** The engine's campaign target may be a city the ground units can reach only by ship. Sailing time counts as distance, and it competes with land targets under the same score.
3. **Campaign lifts.** The engine ships ground units that cannot walk to the campaign in a *campaign lift*, a sea operation of its own with its own slot. A lift sails only with enough force for what is waiting at the target. Each later lift reinforces the landing.
4. **Posture fit in the briefing.** The rules explain in general terms when each posture fits. The Posture section lists each active enemy and the postures that fit it, using a land-path check and the enemy's home garrison.

**Shape:** Phase 0 records a baseline. Phase 1 fixes the muster. Phase 2 adds the campaign-lift fields and slot to the operation record. Phase 3 extracts the sea force builder and the contact rule so both kinds of lift share them. Phase 4 adds the pure sea-route and force rules. Phase 5 moves objective resolution into its own file, with no change in behavior. Phase 6 lets campaign objectives use sea routes. Phase 7 launches campaign lifts. Phase 8 changes what the commanders are told. Phase 9 updates the docs, sets version 3.4.0, runs the final checks, and hands the user a manual checklist.

**Companion plan:** `.spec/2026-11-22-posture-strip-and-weather-default-execution-plan.md` runs **after** this one, in the same working tree, and adds two more changes to the same 3.4.0 release. Do not start it until this plan's Phase 9 is complete.

**Tech:** TypeScript (Electron main, sandboxed renderer bundled with esbuild, shared modules), `better-sqlite3`, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`.

**Shell:** Windows PowerShell. Working directory `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Targeted testing only.** Every phase ends with the Phase Check: static checks plus the tests that phase names. Never run `npm test`, `npm run ui:smoke`, or `npm run doc:shots`, and never run test files the phase does not name. The user runs the full test, review, and fix pass after both plans.
- **Stop only when a verification fails** and you cannot fix it within the phase's file lists. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, except to remove an import that lint reports unused in a listed file, or to fix a test that fails only because of a change the phase names. Record every such file in the Completion Log.
- Find code by the quoted text, not by a line number.
- **Code blocks are sketches** unless marked **Exact**. Write the real code from the file you just read. When a sketch and the file disagree, the file wins; record the difference in the Completion Log. Text marked **Exact** is copied character for character, including punctuation and spacing. In Exact text, `${NAME}` means the value of that constant or variable, interpolated in a template literal.
- **Tests come first.** Write a new module's test with the module, and run it before any existing code calls the module.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Set `$step` to the phase number and `$files` to that phase's **Edit** list.

```powershell
$step = '1'
$files = @('src/main/operations/seaOperationAdvance.ts', 'src/main/operations/seaOperationAdvance.test.ts')
$backup = Join-Path $env:TEMP "aw-campaign-by-sea\step-$step"
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

### Native module

Tests that open a database load `better-sqlite3` under Node, and `npm install` builds it for Electron. Phase 0 therefore runs `npm run rebuild:native:node` once. Phase 9 runs `npm run rebuild:native:electron` last, so the app starts again.

- **Native module lock.** If a rebuild fails with `EBUSY` on `better_sqlite3.node`, close any running Electron app, rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`, run the rebuild again, then delete the `.locked` file.

### Phase Check

Every phase from 1 to 9 ends with the Phase Check, run from the repo root:

```powershell
npm run build:main
npm run lint
npm run check:circular
```

Add `npm run check:renderer-types` when the phase adds or edits any file under `src/shared` or `src/renderer`.

Then run, with `node dist/main/<path>.test.js` or `node dist/shared/<path>.test.js`, every test file the phase adds and every existing test file the phase lists under **Tests to run**, and no others. All must pass.

- `check:circular` must print **no** cycle. The baseline (`scripts/circular-deps-baseline.json`) is empty. A new cycle fails the phase. The Import Direction rules under Conventions say how to avoid one.
- No script runs tests under `src/renderer`. Every rule this plan adds lives in `src/shared` or `src/main` and is tested there.
- A test run may print `logError` lines from code that reads a database the test did not open (for example "classification cache is not loaded" or an agreement read). They are expected when the test still passes.
- A static check or a named test that already failed in Phase 0 is not yours to fix. A **new** failure is.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a check pass.
- **No test may call a real model.**
- **No live match.** The user runs the live match and judges it (Phase 9 hands over a checklist). Do not start the app to play a match.
- Record each Phase Check result, and the line count of every file named in **Size limits** below, in the Completion Log.

---

## Non-Goals

- **No game-rule change.** Ship capacity (2 infantry or 1 armor per ship), unit caps, mercenary rules (including no raising inside another side's home), combat, movement, production costs, and city destruction by strikes all stay as they are.
- No change to the knockout rules, the campaign weights (`CAMPAIGN_ENEMY_HOME_WEIGHT`, `CAMPAIGN_FINISHING_WEIGHT`), or the pact rule.
- No change to how the engine picks, offers, or launches raids (the existing sea and air operations), except the muster fix in Phase 1 and the slot count in Phase 2. Raids keep `OPERATION_MAX_SEA_PER_SIZE`, the offer clock, and the posture's clear rule.
- No change to land operations or the Operation Options menu. A land row stays land-only. A commander's land launch never stores a sea target.
- The engine never changes a commander's posture. Posture fit is advice in the briefing.
- No change to air operations.
- No change to tactical (battle) prompts.
- No migration and no stored rule version. A loaded 3.3.0 save reads its campaign and operation rows as before. New optional fields are absent in those rows, and their absence has the 3.3.0 meaning.
- No new UI element. Only briefing text changes.
- Do not edit anything under `.spec/completed/`, release notes of earlier versions in `doc/release-notes/`, or the historical documents named in `AGENTS.md`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`. Lint enforces some of them.

- **Orienting comments.** Every new or updated declaration needs a JSDoc block, including private functions, constants, types, and every field of an interface or parameter-object type. Each block has a one-line summary, then `Purpose:` (or `Contract:` for types and fields), `When to use:`, `Expected outcome:`, and `Exceptions:`. Update the comment of every existing declaration whose behavior this plan changes, so no comment still describes the old rule (a muster that loads "the ships that are there", a campaign that reaches its target "by land" only, one sea slot shared by every sea operation). **Do not copy generic filler.** Say what the code does and why.
- **Logging (rule 02).** Only `src/main` logs. `src/shared` and `src/renderer` never import the main-process logger. Each new or newly exported function in `src/main` logs on entry at the level this plan names. Functions that read the database log `logDebug`. Pure calculators that run many times per consult (once per city, once per port, inside a sort) log `logTrace`. Every caught error logs `logError` with the error. Log seat ids, turn numbers, hex ids, and counts only.
- **Names.** camelCase files and functions, PascalCase types, UPPER_SNAKE constants. Follow `doc/naming-conventions-contract-v1.md`. Use the file and symbol names this plan gives. The user's final pass runs `naming:check`.
- **No plan vocabulary in version control.** Do not mention this plan, its phase numbers, or its headings in code, comments, test names, or `doc/`. The existing game words `phase` (campaign and operation phases) and `step` (land steps) keep their meanings and are fine.
- **Seat ids.** Production code uses `HUMAN_SEAT_ID`, `AI_SEAT_IDS`, `NEUTRAL_OWNER_ID`, and the guards in `src/shared/seatIds.ts`, never string literals. Tests may use literals.
- **Size limits (rule 09).** Files should stay under 600 lines and must stay under 1000.
  - `src/main/operations/seaOperationAdvance.ts` (709 lines in 3.3.0) may grow by **at most 12 lines** over the whole plan.
  - `src/main/operations/seaOperationAdvance.test.ts` (601) may grow by at most 60 lines.
  - `src/main/openRouter/consultPromptParts.ts` (602) **must not be edited**.
  - `src/main/openRouter/campaignRules.ts` (593) shrinks in Phase 5 and must end under 600.
  - Put new logic in the new files this plan names.
- **Mutability (rule 13).** `const` unless reassigned. `readonly` on fields, parameter arrays, and object types that are not modified.
- **Arguments (rule 10).** At most 6 parameters. Every new function here takes at most 2, or one parameter object whose type has an orienting comment on the type and each field.
- **Tests (rule 03).** Test contracts: inputs, outputs, observable effects. Happy paths and the essential failures each phase names. Do not test constants, private helpers, or call order. If an existing case in a test file you edit only checks an implementation detail of code this plan changes, remove it and record that in the Completion Log. Copy the imports and structure of the sibling test file each phase names.
- **Reuse (rule 06).** One sea force builder serves raids, campaign lifts, and the campaign's lift capacity (Phase 3). One contact rule serves raids and lifts (Phase 3). One required-force rule serves target choice, lift launch, and posture fit (Phase 4).
- **Import direction (no cycles).** `src/main/operations/operationCandidates.ts` and `operationTurnFlow.ts` already import `src/main/openRouter/campaignObjectiveFlow.ts`. Therefore:
  - `campaignObjectiveFlow.ts` may import the new `campaignSeaFlow.ts`. `campaignSeaFlow.ts` must **not** import `campaignObjectiveFlow.ts`, `operationCandidates.ts`, or `operationTurnFlow.ts`. It takes what it needs as arguments.
  - `campaignSeaFlow.ts` may import `operations/liftTerrain.ts`, `operations/liftRules.ts`, `operations/seaOperationCandidates.ts`, and `operations/operationRules.ts`. None of those may import any `openRouter/campaign*Flow` module.
  - `operations/campaignLiftLaunch.ts` may import `openRouter/campaignObjectiveFlow.ts`, `openRouter/campaignRules.ts`, `openRouter/campaignSeaConstants.ts`, and `openRouter/campaignSeaRules.ts`. Nothing in `openRouter/` imports `campaignLiftLaunch.ts`.
  - `openRouter/campaignSeaConstants.ts` holds only the sea constants and imports nothing. `campaignTargetSelection.ts` imports its constants from there, never from `campaignSeaRules.ts`, because `campaignSeaRules.ts` imports `campaignTargetSelection.ts`.
  - `openRouter/campaignSeaRules.ts` is pure. It imports only `./campaignSeaConstants`, `./campaignTargetSelection`, `../operations/operationRules`, the shared types it needs, and the logger.
- **Docs.** Phase 9 updates `doc/`. Do not edit `doc/` in earlier phases.

---

## Evidence From the 3.3.0 Match

The user's global 3.3.0 match (four AI seats, Small, fog off) is the reason for each change. A future developer should not need the match file to follow the reasoning.

- **The minors fell fast.** South America was out at turn 24, Western Europe at 26, both to land campaigns.
- **Then 140 turns of stalemate.** From turn 30 to 169, Eastern Asia and Northern America each lost about 2 units a turn and replaced them. Neither home core was taken.
- **Musters sailed half-empty.** In 11 of 17 sea launches, the force sailed when its first ship reached the port. 156 troops were gathered and 84 sailed. All 72 left behind were alive at the port, while their ships were still on the way. Example: one muster had 14 troops and 7 ships, and sailed with 4 troops on 2 ships.
- **The campaign could not cross water.** Eastern Asia's campaign took 38 objectives, all in Africa, Asia, and Europe. Northern America's campaign gave up 12 of 13 targets, because its targets in Asia went out of land reach. Its home army of 45 to 50 units could never join.
- **The opening was real.** Eastern Asia kept 0 to 13 ground units at home for most of the match. Around turns 124 to 132, an 8-unit Northern America landing took 29% of Eastern Asia's city cells against no defenders. No second wave followed, and Eastern Asia brought 76 units home and retook everything.
- **Postures were never used.** Neither commander declared a posture in 145 turns, so both stayed on `overland` all match. That meant half the naval cap in production and a 25% lift share.

---

## Locked Decisions

The user made these, or they follow from the user's choices. Do not revisit them.

1. **Sea targets are always available.** A campaign may pick a sea-reachable city on any turn, competing with land targets under the same score. There is no "only when no enemy home is reachable by land" switch.
   - *Trade-off the user accepted:* a major may sail against another major before it finishes a minor. The finishing weight still favors a near-knockout minor's home city (see the worked example in Design).
2. **Engine only.** No game-rule change (see Non-Goals). City destruction is intended and stays.
3. **Campaign lifts carry at most the posture's lift share.** The cap is `liftGroundCap` with `hasCampaignPlan: true` and `campaignShare` set to the posture's `liftGroundShare`: 25% on `overland`, `strangle`, and `blitz`, and 50% on `maritime`. Raids and campaign lifts draw on the **same** share: `committedCount` counts units in every stored operation.
4. **Raids keep their own slot.** A campaign lift does not count against `OPERATION_MAX_SEA_PER_SIZE`. A seat may run `CAMPAIGN_LIFT_MAX_PER_SIZE` (1) × `GAME_SIZE_MULTIPLIER` campaign lifts at once.
5. **Posture stays the commander's choice.** The rules explain when each posture fits. The Posture section lists each active enemy and the postures that fit it. The engine never sets a posture.
6. **Fog.** Sea-route choice and the lift's force check count every unit within range, including units the seat has not seen. Raids already do the same ("the seat counts enemy units that fog would hide"). Posture fit uses only what the seat sees.
7. **Acceptance is report-only, and testing is targeted.** The plan ends with each phase's named tests, the static checks, and a checklist for the user's own live match. No pass or fail threshold is set on a live match. The user runs the full suite in a final pass.
8. **Release.** Version 3.4.0, following steps 1 to 3 of "Before the build" in `doc/releasing.md`, except the README test count, which the user fills in after the final pass. Nothing is committed. The companion plan adds its own bullets to the same release notes.
9. **Saves.** A missing `purpose` on a stored operation means a raid. A missing `approach` on a stored campaign objective means land. A loaded 3.3.0 save picks sea routes from its next consult.

---

## Design

### Constants — Exact values

In `src/main/openRouter/campaignSeaConstants.ts` (new; constants only, no imports):

| Constant | Value | Meaning |
| --- | --- | --- |
| `CAMPAIGN_SEA_STEP_PENALTY` | `4` | Turns added to a sea route for loading and landing. |
| `CAMPAIGN_MAX_SEA_STEPS` | `16` | A **new** sea target must be within this many sea steps. It mirrors `CAMPAIGN_MAX_LAND_STEPS` (12) plus the penalty. |
| `CAMPAIGN_SEA_REACH_LIMIT_STEPS` | `30` | A **stored** sea target is kept while within this many sea steps, mirroring `CAMPAIGN_REACH_LIMIT_STEPS`. |
| `CAMPAIGN_SEA_PORT_LIMIT` | `3` | Own ports tested, nearest by land steps from the force. |
| `CAMPAIGN_SEA_CITY_TEST_LIMIT` | `8` | Sea-only cities whose routes are measured, best optimistic score first. |
| `CAMPAIGN_SEA_LANDING_TEST_LIMIT` | `3` | Landing hexes tested per port and city, nearest by hops to the port. |
| `CAMPAIGN_LIFT_FORCE_RATIO` | `1.5` | A lift needs this many ground units per enemy unit waiting at the target. |
| `CAMPAIGN_SEA_LAUNCH_WAIT_TURNS` | `10` | A sea target with no campaign lift for more than this many turns is dropped. |
| `CAMPAIGN_SEA_SKIP_TURNS` | `20` | A dropped sea target is not picked again for this many turns. |
| `CAMPAIGN_LIFT_LANDING_MAX_STEPS` | `6` | A hex the seat holds may serve as a lift landing within this many land steps of the target. Own ground units this close count toward the lift's force. |

In `src/main/operations/operationRules.ts`: `CAMPAIGN_LIFT_MAX_PER_SIZE = 1`.

In `src/main/openRouter/postureFit.ts` (new): `POSTURE_FIT_LIGHT_GARRISON_MAX = 3`.

### The required force (one rule)

**Exact:**

```ts
Math.max(OPERATION_MIN_GROUND_UNITS, Math.ceil(CAMPAIGN_LIFT_FORCE_RATIO * (defenders + reinforcers)) - friendlyNearby)
```

- `defenders`: `terrain.enemyUnitsWithin(targetH3, LIFT_OBJECTIVE_CLEAR_RADIUS)`, the same count raids use.
- `reinforcers`: `countObjectiveReinforcers({ state, seatId, cityH3: targetH3, etaTurns })`.
- `friendlyNearby`: the seat's own ground units, not embarked, within `CAMPAIGN_LIFT_LANDING_MAX_STEPS` land steps of the target. It is 0 when choosing a target.
- *Example:* an Eastern Asia city with 5 enemy units within 2 hexes and none that can arrive first needs `max(2, ceil(7.5) − 0) = 8`. A Northern America city with 12 needs 18.

### Sea route and score

A sea route goes from a port the seat holds (`p`) to a landing hex (`l`) of a city. Its length is **Exact:** `seaSteps = landStepsFromForce(p) + sailTurns(p, l) + CAMPAIGN_SEA_STEP_PENALTY`.

- Infantry marches 1 hex a turn and ships sail 2, and `sailTurns` already returns turns. So a sea step and a land step are both about one turn.
- A city has **one approach**, the same rule for a new and a kept target. **Exact:** `landSteps !== undefined && landSteps <= CAMPAIGN_MAX_LAND_STEPS ? 'land' : seaSteps !== undefined ? 'sea' : 'land'`. Here `landSteps` is the city's land steps from the force, and `seaSteps` is its feasible sea route's steps, when one exists. A city with neither a land route within the limit nor a sea route is not a new candidate.
- **Feasible** means the seat's lift capacity is at least the required force with `friendlyNearby = 0`, and `etaTurns = seaSteps − CAMPAIGN_SEA_STEP_PENALTY + 1`.
- **Lift capacity** is the size of the force `buildSeaLiftForce` would build right now, with no eligibility filter, contact units protected, and the posture's share. It is an upper bound: a lift's own launch check in Phase 7 is exact, and the expiry rule catches any gap.
- The score is unchanged: `campaignScoreBeats` with `steps` set to the land steps or the sea steps.

*Worked example (in the plan only, not in code):*
- An Eastern Asia home city of 30 cells, held by Eastern Asia, at sea steps 2 + 6 + 4 = 12, scores 30 × 2 ÷ 14 ≈ 4.29.
- A Northern America outpost city of 10 cells in Africa, 5 land steps away, scores 10 ÷ 7 ≈ 1.43. The sea target wins.
- A near-knockout minor's home city of 10 cells, 8 land steps away, scores 10 × 2 × 3 ÷ 10 = 6.0 and beats the sea target. With the minor at 6 city hexes it scores 2.0 and loses. That is the trade-off in Locked Decision 1.

### Keeping, expiring, and skipping a sea target

A stored objective is **kept** when all of these hold:

- it is still a candidate city (it is in `cities`);
- either its land steps are at most `CAMPAIGN_REACH_LIMIT_STEPS`, or its sea route exists (feasible) with `seaSteps <= CAMPAIGN_SEA_REACH_LIMIT_STEPS`;
- it has not expired.

**Expired**, **Exact:**

```ts
objective.approach === 'sea'
  && !landReachable
  && !campaignLiftRunning
  && turnNumber - (objective.liftLaunchedTurn ?? objective.chosenTurn) > CAMPAIGN_SEA_LAUNCH_WAIT_TURNS
```

`landReachable` is true when the target's land steps from the force are at most `CAMPAIGN_REACH_LIMIT_STEPS`. A target some ground units are already marching on never expires.

When a target expires, the next target is chosen without it. The new objective stores `skippedTargetH3` (the expired target) and `skippedTurn` (this turn).

A skip is **active** while `turnNumber - skippedTurn < CAMPAIGN_SEA_SKIP_TURNS`. An active skip is carried onto a kept objective and removed from cities when choosing. An inactive skip is dropped from the stored objective.

`approach` is recomputed on every resolution with the approach rule above. A land objective omits the field. `liftLaunchedTurn` is carried while the target is kept and omitted on a new target.

### Campaign lift

A campaign lift is a stored `Operation` with `method: 'sea'`, `purpose: 'campaign'`, `source: 'engine'`, `objectiveH3` = the campaign target, and `minGroundUnits` = the required force at launch. It runs through the same muster, transit, assault, and return as a raid, with three differences:

1. **Landing.** A raid lands on `terrain.landingHexes(objectiveH3)`. A lift lands on those hexes **plus** every hex the seat controls that passes `debarkLegal` and `shipCanEnter` and lies within `CAMPAIGN_LIFT_LANDING_MAX_STEPS` land steps of the target (`campaignLiftLandings`). The nearest by sailing time wins, ties by lower hex id. So the first lift lands beside the target, and later lifts may land on the beachhead.
2. **Muster timeout.** At the muster timeout, a lift sails only with at least `minGroundUnits` troops at the port, instead of `OPERATION_MIN_GROUND_UNITS`. Otherwise it is abandoned.
3. **Who boards.** Only the seat's ground units that **cannot** reach the campaign waypoint by land within `CAMPAIGN_REACH_LIMIT_STEPS` may board. Units that can walk stay with the land campaign. Home defenders, units in contact, withheld units, embarked units, and units in another operation never board.

The engine checks for a campaign lift once per seat per operation tick, after raids, in `advanceOperationsForSeat`. A lift launches when every one of these holds:

- the seat has a stored campaign objective whose target is still a known enemy city;
- the campaign-lift slot has room;
- at least `OPERATION_MIN_GROUND_UNITS` units may board;
- a landing exists and the force's port can sail to it;
- the force is at least the required force, with `friendlyNearby` counted.

There is no offer clock. The launch writes `liftLaunchedTurn` on the stored objective, and the operation event turn, so the commander is consulted.

### Muster ready — Exact rule

`seaMusterReady(args)` returns:

1. `false` when `shipsPresentCount === 0`.
2. When `timedOut`: `presentUnitTypes.length >= minUnitsAtTimeout`.
3. Otherwise: `presentUnitTypes.length === remainingUnitCount && shipsPresentCount >= Math.min(remainingShipCount, shipsNeeded(presentUnitTypes))`.

So a muster waits for the ships its troops need. When fewer ships remain than the troops need, it waits for all of them. The timeout behaves as in 3.3.0, except that a campaign lift raises its minimum.

### Posture fit — Exact rules

For each active seat other than the commander's, in `seatOrder`:

- `landReachable`: some hex of that seat's home is in `getLandStepDistances` from the commander's own ground units that are not embarked, with `maxDepth: CAMPAIGN_REACH_LIMIT_STEPS`.
- `seaReachable`: the commander controls at least one hex with `seaportCount > 0` that passes `terrain.embarkLegal`. Also, that home contains a hex with `urbanHexCount > 0` whose `terrain.landingHexes` is non-empty. No sailing route is measured: an ocean route is assumed.
- `garrison`: that seat's infantry and armor standing on its home hexes, from the units the commander sees.
- `maritimeCapacity`: `Math.min(2 * navalCap, Math.floor(ownGroundUnits * POSTURE_SETTINGS.maritime.liftGroundShare))`. Here `navalCap` is `getMaxUnitsPerType(state.gameSize).naval`, and `ownGroundUnits` is the commander's infantry and armor.
- **Fits:**
  1. `landReachable`: `['overland']`, plus `'blitz'` when `garrison <= POSTURE_FIT_LIGHT_GARRISON_MAX`.
  2. Not land-reachable but `seaReachable`, with the required force for `(garrison, 0, 0)` at most `maritimeCapacity`: `['maritime']`.
  3. Not land-reachable but `seaReachable`, otherwise: `['strangle', 'maritime']`.
  4. Neither: `['strangle']`.

### Prompt and briefing text — Exact

**A. Campaign rules** (`src/main/openRouter/promptSpec/campaignRuleText.ts`). In **both** "To choose a different target" sentences, replace `or no ground unit can reach it by land.` with:

```text
or no ground unit can reach it by land or by a campaign lift.
```

Insert this paragraph immediately before the "To choose a different target" paragraph:

```text
A city your ground units cannot reach within ${CAMPAIGN_MAX_LAND_STEPS} land steps can still be the target when a campaign lift can carry them there. Its distance is the march to a port you hold, the sailing turns, and ${CAMPAIGN_SEA_STEP_PENALTY} turns for loading and landing. The engine gathers the ground units that cannot walk to the campaign at a port and sails them as a campaign lift. A lift carries at most your posture's lift share of your ground units, and it sails only with at least ${CAMPAIGN_LIFT_FORCE_RATIO} times the enemy units within ${LIFT_OBJECTIVE_CLEAR_RADIUS} hexes of the target and those that can reach it first, less your ground units already near it. Each later lift lands beside the target or on a hex you hold near it, so a landing is reinforced lift by lift. A target that waits ${CAMPAIGN_SEA_LAUNCH_WAIT_TURNS} turns with no campaign lift is dropped, and the engine does not pick it again for ${CAMPAIGN_SEA_SKIP_TURNS} turns.
```

**B. Posture rules** (`src/main/openRouter/promptSpec/postureRuleText.ts`). Only when `campaignEnabled` is true, insert this paragraph between the four posture bullets and "The historical names are illustrations…":

```text
Which posture fits depends on how you can reach the enemy you mean to beat. Overland fits an enemy whose home your ground units can reach by land. Blitz fits one of those whose home is lightly held. Maritime fits an enemy you can reach only by sea: its full naval cap and larger lift share are what a campaign lift needs. Strangle fits an enemy you cannot reach, or one whose home holds more ground units than you could land. The Posture section lists each enemy and the postures that fit it.
```

**C. Operation rules** (`src/main/openRouter/promptSpec/operationRuleText.ts`). Only when the campaign is enabled, append this as the block's last paragraph:

```text
A campaign lift is the campaign's own sea operation. It is listed with your operations and can be cancelled like one, but it uses a slot of its own and does not count against your sea operations. Give its units and ships no orders unless you mean to take them out.
```

**D. Posture section fit lines** (`buildPostureSection`, appended after the `- Effect:` line, one per line). `count` is `` `${n} ${n === 1 ? 'ground unit' : 'ground units'}` ``. `pact` is `' (active pact)'` when the seat is an active pact partner (`readActivePactPartnerSeatIds`), otherwise `''`. `name` is the seat's `homeRegion`, or its seat id when that is missing.

```text
- Ships: ${naval} of your naval cap of ${navalCap}. On maritime a campaign lift could carry up to ${maritimeCapacity} ground units.
- Fit, ${name}${pact}: home reachable by land, ${count} at home. Fits: overland.
- Fit, ${name}${pact}: home reachable by land, ${count} at home. Fits: overland, or blitz while its home is this lightly held.
- Fit, ${name}${pact}: home reachable only by sea, ${count} at home. Fits: maritime.
- Fit, ${name}${pact}: home reachable only by sea, ${count} at home, more than maritime could land. Fits: strangle, then maritime.
- Fit, ${name}${pact}: home not reachable by land or sea. Fits: strangle.
```

The Ships line comes first, then one Fit line per enemy, using the template for its case. Fit lines appear only when the campaign is enabled (`state.scenarioId === 'region_vs_region'`).

**E. Campaign Objective section** (`buildCampaignObjectiveSection`). When `objective.approach === 'sea'`, print this line **instead of** the staging-hex and phase lines, where `${target}` is the formatted target:

```text
- Approach: by sea. No ground unit of yours can reach ${target} by land, so the engine sails the campaign there in campaign lifts. Active Operations shows the lift.
```

**F. Active Operations campaign bullet** (`campaignBullet`). When `objective.approach === 'sea'`:

```text
- ${CAMPAIGN_OPERATION_ID}: by sea to ${target}, ${city}. Campaign lift ${liftId} is carrying the force.
- ${CAMPAIGN_OPERATION_ID}: by sea to ${target}, ${city}. Waiting for a campaign lift: enough ground units at a port and ships to carry them.
```

The first line is used when a stored campaign lift exists (its id is `liftId`, the lowest id when there are several), and the second otherwise.

**G. Active Operations lift bullets** (`operationBullet`). For an operation where `isCampaignLift(operation)` is true, every `by sea to` becomes `campaign lift by sea to`, and `turned back from` becomes `campaign lift turned back from`. Nothing else in the sentence changes.

**H. Commander target refusal** (`applyCampaignTargetH3` with `allowSea: true`):

```text
no ground unit of yours can reach ${label} by land or by a campaign lift.
```

---

## Phase 0 — Baseline and Prerequisites

**Goal:** Know the starting state, so a later failure can be told apart from one that was already there.

### Steps

1. Run `npm run rebuild:native:node`, then `npm run build:main`, `npm run lint`, `npm run check:circular`, and `npm run check:renderer-types`. Record each result in the Phase 0 Inventory. A failure that exists here is not yours to fix. Record it and continue.
2. Run every existing test file named under **Tests to run** in Phases 1 to 8 once, and record any that already fail. Only these files; no others.
3. Record the line counts of every file named in **Size limits**, plus `src/main/operations/operationTurnFlow.ts`, `seaOperationCandidates.ts`, `liftRules.ts`, `operationCandidates.ts`, `src/main/openRouter/campaignObjectiveFlow.ts`, `campaignTargetOverride.ts`, `briefingSectionsOperations.ts`, `briefingSectionsCampaign.ts`, `briefingSectionsPosture.ts`, and `requestOrdersInjection.ts`.
4. Confirm, by searching, that each quoted anchor below exists exactly once. Record any that does not, and stop if one is missing.
   - `const ready = shipsPresent.length > 0 && (everyonePresent || (timedOut && presentIds.length >= OPERATION_MIN_GROUND_UNITS));` in `seaOperationAdvance.ts`
   - `const running = active.filter((operation) => operation.method === method).length;` in `operationCandidates.ts`
   - `const running = args.operations.filter((operation) => operation.method === args.method).length;` in `operationCommands.ts`
   - `export function resolveCampaignObjective(args: {` in `campaignRules.ts`
   - `or no ground unit can reach it by land.` (twice) in `promptSpec/campaignRuleText.ts`
   - the `campaignBullet` return line ending in `Assaulting.` in `briefingSectionsOperations.ts`
5. Confirm `scripts/circular-deps-baseline.json` is `[]`.

### Verification

The Phase 0 Inventory is filled in.

---

## Phase 1 — Musters Wait for Their Ships

**Goal:** A sea operation sails only when the ships its troops need are at the port, or at the timeout.

**Adds:** `src/main/operations/seaMusterRules.ts`, `src/main/operations/seaMusterRules.test.ts`
**Edits:** `src/main/operations/seaOperationAdvance.ts`, `src/main/operations/seaOperationAdvance.test.ts`

### Steps

1. Create `seaMusterRules.ts` with `seaMusterReady(args)` (Design, Muster ready). The parameter object has the fields `presentUnitTypes: readonly string[]`, `remainingUnitCount: number`, `shipsPresentCount: number`, `remainingShipCount: number`, `timedOut: boolean`, and `minUnitsAtTimeout: number`. Import `shipsNeeded` from `./liftRules`. Log `logTrace` with the counts and the result.
2. In `advanceMuster` (`seaOperationAdvance.ts`), replace the `everyonePresent` and `ready` lines with one call:

   ```ts
   const ready = seaMusterReady({
     presentUnitTypes: presentIds.map((unitId) => facts.unitTypeById.get(unitId) ?? ''),
     remainingUnitCount: unitIds.length,
     shipsPresentCount: shipsPresent.length,
     remainingShipCount: carrierIds.length,
     timedOut,
     minUnitsAtTimeout: OPERATION_MIN_GROUND_UNITS,
   });
   ```

   Keep the `timedOut` line and the abandon line as they are. Remove the `OPERATION_MIN_GROUND_UNITS` import only if lint reports it unused (it is still used here, so it should stay).
3. Update the orienting comments of `advanceMuster` and `loadAndSail` so they say the force boards when the ships its troops need are there, or at the timeout.

### Tests

- `seaMusterRules.test.ts` (copy the structure of `liftRules.test.ts`). It needs one case each for:
  - no ship present → false;
  - every troop present, 3 ships needed, 1 of 3 present, not timed out → false;
  - every troop present and every needed ship present → true;
  - every troop present, 4 ships needed but only 2 remain and both are present → true;
  - timed out with 2 troops present and a minimum of 2 → true;
  - timed out with 1 troop present and a minimum of 2 → false;
  - timed out with 3 present and a minimum of 4 → false.
- `seaOperationAdvance.test.ts`:
  - add `a muster waits while a needed ship is still at sea`: 4 infantry at the port, 2 ships in the operation, 1 at the port, not timed out. The step stays in `muster` and has a march for the ship that is away.
  - add `a muster sails once every needed ship is at the port`: the same with both ships there. It goes to `transit` with all 4 units.
  - If `a complete muster loads two infantry and sails` or `muster timeout abandons one arrival and sails with two` now fails only because a needed ship is absent from the port, add that ship to the port in the case's facts, and record the change.

**Tests to run:** `dist/main/operations/seaMusterRules.test.js`, `dist/main/operations/seaOperationAdvance.test.js`, `dist/main/operations/operationTurnFlow.test.js`

### Verification

Phase Check. `seaOperationAdvance.ts` grew by at most 8 lines.

---

## Phase 2 — Campaign Lifts in the Operation Record

**Goal:** A stored operation can be marked as a campaign lift and carry its minimum force. Campaign lifts do not use the raid slot. Nothing launches one yet.

**Adds:** `src/shared/operationPurpose.ts`, `src/shared/operationPurpose.test.ts`
**Edits:** `src/shared/operationTypes.ts`, `src/main/gameDb/operationMemory.ts`, `src/main/gameDb/operationMemory.test.ts`, `src/main/operations/operationRules.ts`, `src/main/operations/operationCandidates.ts`, `src/main/operations/operationCandidates.test.ts`, `src/main/operations/operationCommands.ts`, `src/main/operations/operationCommands.test.ts`

### Steps

1. `operationTypes.ts`:
   - Add `export type OperationPurpose = 'raid' | 'campaign';` and `export const OPERATION_PURPOSES: readonly OperationPurpose[] = ['raid', 'campaign'];`.
   - Add two optional fields to `Operation`: `readonly purpose?: OperationPurpose;` (absent means `'raid'`) and `readonly minGroundUnits?: number;` (set only on a campaign lift; the troops it needs at the port when the muster times out). Each needs a `Contract:` comment that says what absence means.
2. `operationPurpose.ts` (shared, no logging): `operationPurposeOf(operation: Pick<Operation, 'purpose'>): OperationPurpose` returns `operation.purpose ?? 'raid'`, and `isCampaignLift(operation: Pick<Operation, 'purpose'>): boolean`.
3. `operationMemory.ts`, `parseOperation`:
   - Accept `purpose` when it is absent or in `OPERATION_PURPOSES`. Drop the entry when it is any other value.
   - Accept `minGroundUnits` when it is absent or a positive integer. Drop the entry otherwise.
   - Copy each field onto the returned object **only when present**, so a 3.3.0 row round-trips byte for byte.
4. `operationRules.ts`: add `CAMPAIGN_LIFT_MAX_PER_SIZE = 1`, with an orienting comment.
5. `operationCandidates.ts`:
   - In `methodHasRoom`, count only operations of that method that are **not** campaign lifts. Export it so its slot rule can be tested, and update its comment.
   - Export `campaignLiftSlotsForState(state: GameStateSnapshot): number`, which returns `CAMPAIGN_LIFT_MAX_PER_SIZE * GAME_SIZE_MULTIPLIER[parseGameSize(state.gameSize)]` with a `logTrace`.
   - Export `campaignLiftHasRoom(state, active): boolean`, which compares the count of stored campaign lifts with those slots.
6. `operationCommands.ts`: in the named launch, count `running` the same way, raids only. Update the comment that describes the slot check.

### Tests

- `operationPurpose.test.ts`: absent → `'raid'`, `'campaign'` → campaign lift.
- `operationMemory.test.ts`:
  - a stored campaign lift with `minGroundUnits: 8` reads back equal;
  - a 3.3.0 operation (no new fields) reads back with no `purpose` key;
  - `purpose: 'escort'` drops that entry and keeps a valid one beside it;
  - `minGroundUnits: 0` drops the entry.
- `operationCandidates.test.ts`: on Small, with one stored campaign lift and no raid, `methodHasRoom(state, active, 'sea', settings)` is true and `campaignLiftHasRoom` is false. With one stored raid, `methodHasRoom` is false and `campaignLiftHasRoom` is true. A state with only `gameSize: 'small'` set is enough, cast as that file's other fixtures are.
- `operationCommands.test.ts`: a named sea launch is not refused for slots when the only stored operation is a campaign lift.

**Tests to run:** the two new or changed memory and purpose tests, `dist/main/operations/operationCandidates.test.js`, `dist/main/operations/operationCommands.test.js`, `dist/main/operations/operationTurnFlow.test.js`

### Verification

Phase Check.

---

## Phase 3 — One Sea Force Builder and One Contact Rule

**Goal:** Raids and campaign lifts build their force with the same code, and protect the same units. Behavior does not change.

**Edits:** `src/main/operations/seaOperationCandidates.ts`, `src/main/operations/seaOperationCandidates.test.ts`, `src/main/operations/liftRules.ts`, `src/main/operations/liftRules.test.ts`, `src/main/operations/operationCandidates.ts`

### Steps

1. `seaOperationCandidates.ts`:
   - Export `interface SeaLiftForce` (the existing private `PortForce`, renamed, with the same fields).
   - Export `buildSeaLiftForce(args)`. Move into it, unchanged, the code in `listSeaOperationCandidates` that runs from the `busy` set through `const force = forces[0];`. The parameter object has:
     - `state`, `seatId`, `landMass`, `terrain`, `active`, `protectedUnitIds`;
     - `groundShare: { readonly hasCampaignPlan: boolean; readonly campaignShare?: number }`;
     - an optional `eligibleUnitIds?: ReadonlySet<string>`.
   - When `eligibleUnitIds` is present, `available` keeps only units in that set. `groundUnits`, `committedCount`, and the cap are computed over **all** the seat's ground units, as now.
   - The function returns the best `SeaLiftForce`, or null. On each early null, it logs `logDebug` with the reason (`'no free ship'`, `'too few ground units'`, `'lift cap'`, `'no port force'`).
   - `listSeaOperationCandidates` calls it with `groundShare: { hasCampaignPlan: args.hasCampaignPlan, campaignShare: args.settings?.liftGroundShare }` and no eligibility filter, and calls `finish([])` on null. Its remaining code is unchanged.
2. `liftRules.ts`: export `liftProtectedUnitIds(args)`. The parameter object has `state`, `seatId`, `terrain: Pick<LiftTerrain, 'enemyUnitsWithin'>`, `defenderUnitIds: readonly string[]`, and `withheldIds: ReadonlySet<string>`. It returns a `Set` of:
   - the defenders;
   - the withheld ids;
   - every own infantry or armor unit with `terrain.enemyUnitsWithin(unit.h3Index, CAMPAIGN_CONTACT_RADIUS) > 0`.

   Import `CAMPAIGN_CONTACT_RADIUS` from `../openRouter/campaignRules`. Log `logTrace` with the count.
3. `operationCandidates.ts`: replace the inline `protectedUnitIds` construction in `operationCandidatesForSeat` with a call to `liftProtectedUnitIds`.

### Tests

- `seaOperationCandidates.test.ts`: every existing case must pass **unchanged**. Add one case using that file's fixtures, with four infantry beside a port, one free ship, and `groundShare: { hasCampaignPlan: false }` (cap `floor(4 × 0.5) = 2`). With `eligibleUnitIds` naming one infantry, `buildSeaLiftForce` returns null (fewer than `OPERATION_MIN_GROUND_UNITS`). Naming two returns a force with exactly those two.
- `liftRules.test.ts`: a unit beside an enemy is protected, a unit two hexes away is not, and a withheld id is protected.

**Tests to run:** `dist/main/operations/seaOperationCandidates.test.js`, `dist/main/operations/liftRules.test.js`, `dist/main/operations/operationCandidates.test.js`, `dist/main/operations/operationTurnFlow.test.js`, `dist/main/operations/operationCommands.test.js`

### Verification

Phase Check. Any change to an existing expected value in these tests fails this phase.

---

## Phase 4 — Campaign Sea Rules (Pure)

**Goal:** The required force, sea routes, expiry, and skips exist as pure functions with tests. No caller yet.

**Adds:** `src/main/openRouter/campaignSeaConstants.ts`, `src/main/openRouter/campaignSeaRules.ts`, `src/main/openRouter/campaignSeaRules.test.ts`
**Edits:** `src/shared/campaignTypes.ts`

### Steps

1. `campaignTypes.ts`:
   - Add `export type CampaignApproach = 'land' | 'sea';` and `export const CAMPAIGN_APPROACHES: readonly CampaignApproach[] = ['land', 'sea'];`.
   - Add optional fields to `CampaignObjective`, each with a `Contract:` comment saying what absence means:
     - `approach?: CampaignApproach` (absent is land);
     - `liftLaunchedTurn?: number` (the turn the last campaign lift for this target launched);
     - `skippedTargetH3?: string` and `skippedTurn?: number` (both present or both absent).
   - Add `export function campaignApproachOf(objective: Pick<CampaignObjective, 'approach'>): CampaignApproach` (no logging; it lives in shared).
2. `campaignSeaConstants.ts`: the constants from Design, each with an orienting comment that says why the value was chosen. No imports and no functions.
3. `campaignSeaRules.ts`: these functions, each logging `logTrace`:
   - `campaignLiftRequiredUnits(args: { defenders; reinforcers; friendlyNearby }): number`: the Exact rule.
   - `campaignSeaTargetExpired(args: { objective; turnNumber; landReachable; campaignLiftRunning }): boolean`: the Exact rule.
   - `campaignApproachFor(args: { landSteps: number | undefined; seaSteps: number | undefined }): CampaignApproach`: the Exact approach rule.
   - `campaignSkipFor(args: { stored: CampaignObjective | null; turnNumber; storedLandReachable; campaignLiftRunning }): { readonly targetH3: string; readonly sinceTurn: number } | null`. It returns, in this order:
     - the stored target with `sinceTurn = turnNumber` when the stored objective expired;
     - the stored skip when it is still active;
     - otherwise null.
   - `interface CampaignSeaRoute { cityH3; portH3; landingH3; seaSteps }`.
   - `chooseCampaignSeaRoutes(args): ReadonlyMap<string, CampaignSeaRoute>`. The parameter object has:
     - `cities: readonly CampaignCity[]`, `landStepsFromForce`;
     - `ports: readonly { readonly h3Index: string; readonly landSteps: number }[]` (already sorted and cut to `CAMPAIGN_SEA_PORT_LIMIT` by the caller);
     - `sailTurns(fromH3, toH3): number | null`, `landingHexes(cityH3): readonly string[]`, `hopDistance(a, b): number | null`;
     - `defendersNear(cityH3): number`, `reinforcersFor(cityH3, etaTurns): number`;
     - `liftCapacity: number`, `mustTestH3: string | null`, `skipH3: string | null`.

     Its algorithm:
     1. Return an empty map when `ports` is empty or `liftCapacity < OPERATION_MIN_GROUND_UNITS`.
     2. Candidates are cities that are not `skipH3`, whose land steps are absent or greater than `CAMPAIGN_MAX_LAND_STEPS`, and whose `landingHexes` is non-empty.
     3. Order the candidates by `campaignScoreBeats` with both sides at `ports[0].landSteps + CAMPAIGN_SEA_STEP_PENALTY` steps, with ties broken by lower hex id. Keep the first `CAMPAIGN_SEA_CITY_TEST_LIMIT`, then add `mustTestH3` when it is a candidate that was cut.
     4. For each kept city and each port, take the landings sorted by `hopDistance(port, landing)` (null last), then by id, and keep the first `CAMPAIGN_SEA_LANDING_TEST_LIMIT`. Each landing with a non-null `sailTurns` gives `seaSteps`. The best route is the fewest steps, then the lower port id, then the lower landing id.
     5. Keep the city's best route when `seaSteps <= CAMPAIGN_SEA_REACH_LIMIT_STEPS` and `liftCapacity >= campaignLiftRequiredUnits({ defenders: defendersNear(city), reinforcers: reinforcersFor(city, seaSteps - CAMPAIGN_SEA_STEP_PENALTY + 1), friendlyNearby: 0 })`.
     6. Log `logDebug` once at the end with the tested and kept counts.

### Tests

`campaignSeaRules.test.ts` (copy the structure of `campaignTargetSelection.test.ts`; build cities with a local helper and terrain as plain functions over maps). It needs one case each for:

- the required force: the Design examples (5 defenders → 8, 12 → 18), the minimum of 2, and friendly units subtracted down to the minimum;
- expiry: a sea objective 11 turns after `chosenTurn` with no lift running and not land-reachable → expired; at 10 → not; with a lift running → not; land-reachable → not; a land objective → never;
- approach: land steps 12 → land; land steps 13 with a sea route → sea; land steps 13 with no sea route → land; no land steps and no sea route → land;
- skips: an expired objective returns itself as the skip; an active skip carries; a skip 20 turns old is gone;
- routes:
  - a city within 12 land steps gets no sea route;
  - a sea-only city gets a route whose `seaSteps` is port steps + sail + 4;
  - a city whose cheapest route is 31 steps gets none;
  - a city that needs more than the lift capacity gets none;
  - the skipped city gets none;
  - `mustTestH3` is measured even when 9 better cities exist;
  - no port, or a capacity of 1, returns an empty map.

**Tests to run:** `dist/main/openRouter/campaignSeaRules.test.js`, `dist/main/openRouter/campaignTargetSelection.test.js`

### Verification

Phase Check.

---

## Phase 5 — Objective Resolution in Its Own File

**Goal:** `resolveCampaignObjective` moves out of `campaignRules.ts`, with no change in behavior, so the next phase does not push that file over 600 lines.

**Adds:** `src/main/openRouter/campaignObjectiveResolution.ts`
**Edits:** `src/main/openRouter/campaignRules.ts`, `src/main/openRouter/campaignObjectiveFlow.ts`, `src/main/openRouter/campaignRules.test.ts`

### Steps

1. Move `resolveCampaignObjective` and its orienting comment, unchanged, into `campaignObjectiveResolution.ts`. Import what it needs from `./campaignRules` and `./campaignTargetSelection`. Do not leave a re-export in `campaignRules.ts`.
2. Update the imports in `campaignObjectiveFlow.ts` and `campaignRules.test.ts`.
3. Search `src/` for any other import of `resolveCampaignObjective` from `campaignRules` and update it. Record each in the Completion Log.

### Tests

None new. Every existing case passes unchanged.

**Tests to run:** `dist/main/openRouter/campaignRules.test.js`, `dist/main/openRouter/campaignObjectiveFlow.test.js`, `dist/main/openRouter/campaignTargetOverride.test.js`

### Verification

Phase Check. `campaignRules.ts` is under 600 lines.

---

## Phase 6 — Campaign Objectives by Sea

**Goal:** The campaign may choose, keep, expire, and skip a sea-reachable target, and a commander may name one with `campaignTarget`.

**Adds:** `src/main/openRouter/campaignSeaFlow.ts`, `src/main/openRouter/campaignSeaFlow.test.ts`, `src/main/openRouter/campaignObjectiveResolution.test.ts`
**Edits:** `src/main/gameDb/campaignObjectiveMemory.ts`, `src/main/gameDb/campaignObjectiveMemory.test.ts`, `src/main/openRouter/campaignTargetSelection.ts`, `src/main/openRouter/campaignTargetSelection.test.ts`, `src/main/openRouter/campaignObjectiveResolution.ts`, `src/main/openRouter/campaignObjectiveFlow.ts`, `src/main/openRouter/campaignTargetOverride.ts`, `src/main/openRouter/campaignTargetOverride.test.ts`, `src/main/operations/operationCommands.ts`

### Steps

1. `campaignObjectiveMemory.ts`, `parseCampaignObjective`:
   - Accept `approach` when it is absent or in `CAMPAIGN_APPROACHES`.
   - Accept `liftLaunchedTurn` when it is absent or an integer.
   - Accept `skippedTargetH3` and `skippedTurn` when both are absent, or when they are a non-empty string and an integer.
   - Drop the entry otherwise. Copy each field only when present.
   - Add `writeCampaignLiftLaunchedTurn(ops, seatId, turnNumber)`. It reads the stored objectives, sets `liftLaunchedTurn` on that seat's objective when one exists, and writes. It does nothing when none exists. Log `logDebug`.
2. `campaignTargetSelection.ts`, `chooseCampaignTarget`: add an optional third parameter `seaStepsByH3?: ReadonlyMap<string, number>`. Import `CAMPAIGN_MAX_SEA_STEPS` from `./campaignSeaConstants`.
   - A city's steps are its land steps when they are at most `CAMPAIGN_MAX_LAND_STEPS`.
   - Otherwise they are its sea steps when they are at most `CAMPAIGN_MAX_SEA_STEPS`.
   - Otherwise the city is skipped.
   - The comparison and the tie-breaks are unchanged. Update the comment.
3. `campaignObjectiveResolution.ts`, `resolveCampaignObjective`: add three fields to the parameter object:
   - `seaStepsByH3: ReadonlyMap<string, number>`;
   - `campaignLiftRunning: boolean`;
   - `skip: { readonly targetH3: string; readonly sinceTurn: number } | null` (from `campaignSkipFor`).

   Then (Design, Keeping, expiring, and skipping):
   - `cities` passed to the choice exclude `skip?.targetH3`.
   - Keep the stored objective when it is a candidate, it is reachable (land steps ≤ `CAMPAIGN_REACH_LIMIT_STEPS`, or sea steps ≤ `CAMPAIGN_SEA_REACH_LIMIT_STEPS`), and `campaignSeaTargetExpired` is false.
   - Both a **new** and a **kept** objective get `approach` from `campaignApproachFor`, written only when it is `'sea'`.
   - A **new** objective has no `liftLaunchedTurn`. It has `skippedTargetH3` and `skippedTurn` from `skip` when `skip` is non-null.
   - A **kept** objective keeps `liftLaunchedTurn`, and takes its skip fields from `skip` (omitted when null).
   - The staging and phase logic is unchanged. A sea target normally has no staging hex the force can reach, so it starts in `assault`. Log `approach` and `skip` in the existing `logDebug`.
4. `campaignSeaFlow.ts`: export `campaignSeaRoutesForState(args): ReadonlyMap<string, CampaignSeaRoute>`. The parameter object has `state`, `seatId`, `landMass`, `cities`, `landStepsFromForce`, `mustTestH3: string | null`, and `skipH3: string | null`. Log `logDebug` on entry. Inside a try/catch that logs `logError` and returns an empty map:
   1. Use `units = listUnitsForSnapshot()` and `seen = { ...state, units }`. Build `terrain` with `buildLiftTerrain({ state: seen, seatId, landMass })`.
   2. Return an empty map when the seat has no naval unit.
   3. `ports`: hexes the seat controls with `seaportCount > 0`, `terrain.embarkLegal`, `terrain.shipCanEnter`, and land steps at most `OPERATION_MUSTER_MAX_LAND_STEPS`. Sort by land steps, then id, and keep the first `CAMPAIGN_SEA_PORT_LIMIT`.
   4. `liftCapacity`: the unit count of `buildSeaLiftForce` with:
      - `active` = the seat's stored operations;
      - `protectedUnitIds` = `liftProtectedUnitIds` with no defenders and no withheld ids;
      - `groundShare: { hasCampaignPlan: true, campaignShare: postureSettingsForSeat(seatId).liftGroundShare }`;
      - 0 when it returns null.
   5. Return `chooseCampaignSeaRoutes` with:
      - `sailTurns` and `landingHexes` from `terrain`, and `hopDistance: computeGridDistanceWithPathFallbackPure`;
      - `defendersNear = (h3) => terrain.enemyUnitsWithin(h3, LIFT_OBJECTIVE_CLEAR_RADIUS)`;
      - `reinforcersFor = (h3, eta) => countObjectiveReinforcers({ state: seen, seatId, cityH3: h3, etaTurns: eta })`.
5. `campaignObjectiveFlow.ts`, `resolveCampaignObjectiveForSeat`: after `inputs` and `stored`:
   1. `campaignLiftRunning` = the seat's stored operations include a campaign lift.
   2. `landStepsFromForce` as now (compute it once and reuse it).
   3. `skip = campaignSkipFor({ stored, turnNumber, storedLandReachable, campaignLiftRunning })`, where `storedLandReachable` is true when the stored target's land steps are at most `CAMPAIGN_REACH_LIMIT_STEPS`.
   4. `routes = campaignSeaRoutesForState({ state, seatId, landMass, cities: inputs.cities, landStepsFromForce, mustTestH3: stored?.targetH3 ?? null, skipH3: skip?.targetH3 ?? null })`.
   5. Pass `seaStepsByH3` (each route's `seaSteps`), `campaignLiftRunning`, and `skip` to `resolveCampaignObjective`.
6. `campaignTargetOverride.ts`, `applyCampaignTargetH3`: add `allowSea: boolean` to the parameter object. `applyCampaignTargetOverride` passes `true`.
   - When land steps fail the reach check and `allowSea` is true, compute `campaignSeaRoutesForState` with `mustTestH3` = the target and no skip.
   - When a route exists with `seaSteps <= CAMPAIGN_SEA_REACH_LIMIT_STEPS`, store `{ targetH3, stagingH3: null, phase: 'assault', source: 'commander', chosenTurn, approach: 'sea' }`.
   - Otherwise drop with text H. With `allowSea` false, the existing land-only refusal text is kept.
7. `operationCommands.ts`: the land launch's call to `applyCampaignTargetH3` passes `allowSea: false`.

### Tests

- `campaignObjectiveMemory.test.ts`:
  - a sea objective with all new fields round-trips;
  - a 3.3.0 objective reads back with no new keys;
  - `approach: 'air'` drops the entry;
  - a `skippedTargetH3` without `skippedTurn` drops the entry;
  - `writeCampaignLiftLaunchedTurn` sets the field and leaves another seat's row alone.
- `campaignTargetSelection.test.ts`:
  - a sea-only city at 12 sea steps beats a weaker land city (the worked example: 30 cells home-held at 12 against 10 cells at 5);
  - a near-knockout minor's home city at 8 land steps beats it;
  - a sea city at 17 steps is not chosen;
  - with no `seaStepsByH3`, results match 3.3.0.
- `campaignObjectiveResolution.test.ts` (new; copy the resolve case in `campaignRules.test.ts`):
  - a new sea target stores `approach: 'sea'` and starts in `assault`;
  - a stored sea target is kept while its route exists;
  - it is replaced when the route is gone;
  - it expires at 11 turns with no lift, and the new objective carries the skip;
  - with a lift running it does not expire;
  - a kept target that becomes land-reachable stores no `approach`;
  - `liftLaunchedTurn` survives a kept resolution.
- `campaignSeaFlow.test.ts` (copy `arrange` from `operations/operationTurnFlow.test.ts`; use `withTempGameDb`).
  - Arrange 8 infantry and 2 ships, and write the `maritime` posture with `writePosture`. The lift cap is then `floor(8 × 0.5) = 4`, two ships carry 4, so the capacity is 4.
  - Choose the enemy city with one more condition: `getLandStepDistances` from the infantry hex with `maxDepth: CAMPAIGN_MAX_LAND_STEPS` must not reach it. Fail with `assert.ok` when no such city exists on the test map.
  - Cases:
    - with an enemy infantry on the city (required 2), the city has a route whose `seaSteps` is at least `CAMPAIGN_SEA_STEP_PENALTY`;
    - with 3 enemy units within 2 hexes of it (required 5 > 4), the route is absent;
    - with no naval unit, the map is empty.
- `campaignTargetOverride.test.ts`:
  - a commander's `campaignTarget` naming that sea-reachable city is stored with `approach: 'sea'` and `source: 'commander'`;
  - a land launch naming it is refused with the 3.3.0 text.

**Tests to run:** all tests above, plus `dist/main/openRouter/campaignRules.test.js`, `dist/main/openRouter/campaignObjectiveFlow.test.js`, `dist/main/operations/operationCommands.test.js`, `dist/main/operations/operationCommandsLand.test.js`, `dist/main/operations/landOperationCandidates.test.js`

### Verification

Phase Check.

---

## Phase 7 — Campaign Lifts Launch

**Goal:** The engine ships the ground units that cannot walk to the campaign, lift by lift.

**Adds:** `src/main/operations/campaignLiftLaunch.ts`, `src/main/operations/campaignLiftLaunch.test.ts`
**Edits:** `src/main/operations/operationTurnFlow.ts`, `src/main/operations/seaOperationAdvance.ts`, `src/main/operations/seaOperationAdvance.test.ts`

### Steps

1. `campaignLiftLaunch.ts`:
   - `campaignLiftLandings(args): readonly string[]`. The parameter object has `state`, `seatId`, `landMass`, `terrain`, and `targetH3`. It returns `terrain.landingHexes(targetH3)` plus every hex the seat controls that passes `terrain.debarkLegal` and `terrain.shipCanEnter` and is within `CAMPAIGN_LIFT_LANDING_MAX_STEPS` land steps of the target, from `getLandStepDistances` starting at the target. It is de-duplicated and sorted with `compareCodeUnits`. Log `logTrace`.
   - `campaignLiftForSeat(args): Operation | null`. The parameter object has `state` (the seat snapshot with the full unit list), `seatId`, `landMass`, `active`, and `withheldIds`. Log `logDebug` on entry and on every null, with the reason. Inside a try/catch that logs `logError` and returns null, follow Design, Campaign lift, in this order:
     1. Read the stored objective (`readCampaignObjectives`). Return null when it is absent, when `campaignLiftHasRoom` is false, or when the target is not in `listKnownEnemyCities`.
     2. `terrain = buildLiftTerrain(...)`, `waypoint = campaignWaypoint(objective)`, and `fromWaypoint = getLandStepDistances({ originH3s: [waypoint], hexSet, data: landMass, maxDepth: CAMPAIGN_REACH_LIMIT_STEPS })`.
     3. `protectedIds = liftProtectedUnitIds({ state, seatId, terrain, defenderUnitIds: campaignPlanForState(state)?.defenderUnitIds ?? [], withheldIds })`.
     4. `eligible`: own infantry and armor that are not embarked, not in `active`, not protected, and whose hex is not in `fromWaypoint`. Return null when there are fewer than `OPERATION_MIN_GROUND_UNITS`.
     5. `landings = campaignLiftLandings(...)`. Return null when it is empty.
     6. `force = buildSeaLiftForce({ ..., eligibleUnitIds: eligible, groundShare: { hasCampaignPlan: true, campaignShare: postureSettingsForSeat(seatId).liftGroundShare } })`. Return null when it is null.
     7. The best landing is the lowest non-null `terrain.sailTurns(force.port, landing)`, ties by id. Return null when there is none. `etaTurns = force.musterTurns + sail + 1`.
     8. `required = campaignLiftRequiredUnits({ defenders, reinforcers, friendlyNearby })` (Design, The required force). Return null when `force.units.length < required`.
     9. Return the operation:

        ```ts
        {
          id: nextOperationId(seatId, active, state.turnNumber),
          method: 'sea',
          purpose: 'campaign',
          objectiveH3: objective.targetH3,
          musterH3: force.port,
          landingH3: null,
          unitIds: force.units.map((unit) => unit.id),
          carrierIds: force.ships.map((ship) => ship.id),
          phase: 'muster',
          source: 'engine',
          launchedTurn: state.turnNumber,
          phaseTurn: state.turnNumber,
          minGroundUnits: required,
        }
        ```
2. `operationTurnFlow.ts`:
   - Refactor the private `chooseLanding(terrain, objectiveH3, fromH3)` into `chooseLandingAmong(terrain, hexes, fromH3)`. In `buildOperationFacts`, `chooseLanding` uses `campaignLiftLandings(...)` when `isCampaignLift(args.operation)`, and `terrain.landingHexes(objectiveH3)` otherwise.
   - In `advanceOperationsForSeat`, after the raid `while` loop and before the offer write, call `campaignLiftForSeat({ state, seatId, landMass, active: kept, withheldIds })`. When it returns an operation:
     - build its facts, then advance and apply it exactly as the raid launch does;
     - push `step.next` when it is non-null, and set `seatEvent = true`;
     - call `writeCampaignLiftLaunchedTurn(configOps, seatId, state.turnNumber)`;
     - log `logDebug` `'operationTurnFlow campaign lift launched'` with the id, the muster, the unit count, the carrier count, and `minGroundUnits`.
   - Update the orienting comment of `advanceOperationsForSeat`.
3. `seaOperationAdvance.ts`, `advanceMuster`: `minUnitsAtTimeout: operation.minGroundUnits ?? OPERATION_MIN_GROUND_UNITS`.

### Tests

- `campaignLiftLaunch.test.ts` (copy `arrange` and `coordinates` from `operationTurnFlow.test.ts`; use `withTempGameDb`).
  - Arrange 8 infantry and 2 ships beside the port, write the `maritime` posture (cap `floor(8 × 0.5) = 4`, two ships carry 4), and choose a city the infantry cannot reach by land within `CAMPAIGN_REACH_LIMIT_STEPS`, as in the `campaignSeaFlow` test.
  - Store a campaign objective on that city with `writeCampaignObjectiveForSeat`, then call `advanceOperationsForSeat`.
  - It needs one case each for:
    - an undefended city: one stored operation has `purpose: 'campaign'`, 4 ground units, 2 ships, and `minGroundUnits: 2`, and the objective's `liftLaunchedTurn` is the turn;
    - one enemy unit on the city (required 2): the lift launches;
    - 4 enemy units within 2 hexes (required 6 > 4): no lift is stored;
    - a campaign lift already stored: a second is not launched;
    - no stored objective: no lift;
    - a raid stored beside it: the lift still launches (separate slot);
    - `campaignLiftLandings` includes a coastal hex the seat holds within `CAMPAIGN_LIFT_LANDING_MAX_STEPS` land steps of the target, when the test sets that hex's control to the seat.
- `seaOperationAdvance.test.ts`: add `a campaign lift at the muster timeout needs its minimum`: a campaign lift with `minGroundUnits: 4`, timed out, 3 troops and a ship at the port → abandoned.

**Tests to run:** `dist/main/operations/campaignLiftLaunch.test.js`, `dist/main/operations/seaOperationAdvance.test.js`, `dist/main/operations/operationTurnFlow.test.js`, `dist/main/operations/operationCandidates.test.js`, `dist/main/openRouter/campaignObjectiveFlow.test.js`

### Verification

Phase Check. `seaOperationAdvance.ts` has grown by at most 12 lines since Phase 0.

---

## Phase 8 — What the Commanders Are Told

**Goal:** The briefing and rules describe sea campaigns, campaign lifts, and which posture fits each enemy.

**Adds:** `src/main/openRouter/postureFit.ts`, `src/main/openRouter/postureFit.test.ts`
**Edits:** `src/main/openRouter/promptSpec/campaignRuleText.ts`, `src/main/openRouter/promptSpec/postureRuleText.ts`, `src/main/openRouter/promptSpec/operationRuleText.ts`, `src/main/openRouter/briefingSectionsCampaign.ts`, `src/main/openRouter/briefingSectionsCampaign.test.ts`, `src/main/openRouter/briefingSectionsOperations.ts`, `src/main/openRouter/briefingSectionsOperations.test.ts`, `src/main/openRouter/briefingSectionsPosture.ts`, `src/main/openRouter/briefingSectionsPosture.test.ts`, `src/main/openRouter/requestOrdersInjection.ts`, `src/main/openRouter/promptContracts.test.ts`, `src/main/openRouter/promptSpec/coachingText.test.ts`

### Steps

1. Apply texts A, B, and C exactly. Import the constants they name: the sea constants from `../campaignSeaConstants`, `LIFT_OBJECTIVE_CLEAR_RADIUS` from `../../operations/liftRules`, and `CAMPAIGN_MAX_LAND_STEPS` from `../campaignTargetSelection`. Do not write any number in those texts by hand.
2. `postureFit.ts`:
   - Pure: `postureFitsFor(args: { landReachable; seaReachable; garrison; maritimeCapacity }): readonly Posture[]` (Design, Posture fit). Log `logTrace`.
   - Pure: `postureFitLine(args: { name; pactPartner; landReachable; seaReachable; garrison; maritimeCapacity }): string`, using the Fit templates of text D. Log `logTrace`.
   - Flow: `buildPostureFitLines(state: GameStateSnapshot): readonly string[]`. It returns the Ships line and then one Fit line per active enemy, using `loadCampaignLandMass`, `buildLiftTerrain` on the seat's own snapshot, `getLandStepDistances`, `getMaxUnitsPerType`, and `readActivePactPartnerSeatIds`. It returns `[]` when the scenario is not `region_vs_region`, and `[]` after `logError` on any thrown error. Log `logDebug`.
3. `briefingSectionsPosture.ts`, `buildPostureSection`: add an optional `fitLines?: readonly string[]` to the parameter object, appended one per line after the Effect line.
4. `requestOrdersInjection.ts`: pass `fitLines: buildPostureFitLines(args.state)` to `buildPostureSection`.
5. `briefingSectionsCampaign.ts`: text E.
6. `briefingSectionsOperations.ts`:
   - `campaignBullet` gets `liftId: string | null` in its parameter object. `buildOperationsSection` passes the lowest id among `args.operations` for which `isCampaignLift` is true, or null. Apply text F.
   - `operationBullet` applies text G.
7. Update `promptContracts.test.ts` and `coachingText.test.ts` only where an expected string includes text A, B, or C. Record each change.

### Tests

- `postureFit.test.ts`:
  - all four cases of `postureFitsFor`, plus `blitz` at a garrison of 3 and not at 4;
  - `postureFitLine` produces each template of text D exactly, with `(active pact)` and with `1 ground unit`.
- `briefingSectionsPosture.test.ts`: fit lines appear after the Effect line, and with none the section is unchanged.
- `briefingSectionsCampaign.test.ts`: a sea objective prints the Approach line and no Staging or Phase line. A land objective is unchanged.
- `briefingSectionsOperations.test.ts`:
  - the campaign bullet's two sea sentences, with and without a lift;
  - a campaign lift in muster begins `- <id>: campaign lift by sea to`;
  - a raid's text is unchanged.

**Tests to run:** all tests above, plus `dist/main/openRouter/promptContracts.test.js`, `dist/main/openRouter/promptSpec/coachingText.test.js`, `dist/main/openRouter/requestOrdersFlow.test.js` if it exists

### Verification

Phase Check. `consultPromptParts.ts` is unchanged (compare its line count with Phase 0).

---

## Phase 9 — Docs, Version 3.4.0, Final Checks, and Hand-Off

**Goal:** The docs match the code, the version is 3.4.0, the static checks pass, and the user has a checklist for a live match.

**Adds:** `doc/release-notes/v3.4.0.md`
**Edits:** `doc/hybrid-ai.md`, `doc/ai-commander-prompts/strategic-prompt.md`, `doc/ai-commander-prompts/assembly-contract.md`, `doc/ai-commander-prompts/example-strategic-prompt.md`, `doc/save-files.md`, `README.md`, `doc/README.md`, `package.json`, `package-lock.json`

### Steps

1. `doc/hybrid-ai.md`:
   - **Campaign**:
     - candidate cities may be reached by sea (route, steps, penalty, port and city and landing limits, feasibility, capacity, the fog note);
     - `chooseCampaignTarget` uses `CAMPAIGN_MAX_SEA_STEPS`;
     - the keep rule adds `CAMPAIGN_SEA_REACH_LIMIT_STEPS`, expiry, and skips. Replace "There is no timeout." with the expiry rule;
     - `applyCampaignTargetOverride` accepts a sea route, while a land launch does not.
   - **Operations**:
     - the muster now boards when the ships its troops need are there. Rewrite the `muster` paragraph;
     - add a **Campaign lifts** paragraph: purpose, who boards, the posture share shared with raids, the required force, landings, the muster minimum, slots, no offer clock, the `liftLaunchedTurn` write, and that cancelling one works like any operation;
     - the sea-slot sentence counts raids only.
2. `doc/ai-commander-prompts/strategic-prompt.md`: the Campaign Objective (E), Active Operations (F, G), and Posture (D) content bullets, and the rule-block descriptions for A, B, and C. `assembly-contract.md` and `example-strategic-prompt.md`: replace each copy of a changed sentence with the new text from the Design section, and add the new paragraphs where those files copy that block.
3. `doc/save-files.md`: in the `campaign_objectives` and `operations` sentences, say that the new optional fields are absent in older saves and read as land and as a raid.
4. `npm version 3.4.0 --no-git-tag-version`.
5. `doc/release-notes/v3.4.0.md`: copy `v3.3.0.md` and change the version everywhere. Keep Downloads and Before you play. In **Saves**, say a 3.3.0 save opens and its commanders may pick sea targets from their next consult. Replace What's new with these three bullets under `## What's in 3.4.0`:
   - **Campaigns cross the sea.** A campaign may choose a city across water. The engine sails the ground units that cannot march to it in campaign lifts, as many as the posture's lift share allows, and only with enough force for what is waiting at the target. Later lifts reinforce the landing.
   - **Sea operations sail whole.** A sea operation waits at its port until the ships its troops need have arrived, instead of sailing with the first ship.
   - **Posture fit.** The Posture section lists each enemy, whether its home can be reached by land or only by sea, how many ground units hold it, and which postures fit.
6. `README.md`:
   - Update the executable names under Play it and the version under Status.
   - Leave the test count under What's inside unchanged, and note in the Completion Log that the user updates it after the final pass.
   - Add above the 3.3.0 bullet under Releases After 2.5.0: `- **3.4.0** lets a campaign cross the sea: the engine sails ground units that cannot march to the campaign in campaign lifts, lift by lift. A sea operation now waits for the ships its troops need before it sails. The Posture section tells each commander which postures fit each enemy.`
7. `doc/README.md`: the shipping version, and a `Release **3.4.0** …` paragraph above the 3.3.0 one, with the same text as the README bullet.
8. Run `node scripts/check-doc-links.cjs`.
9. Run the Phase Check with `npm run check:renderer-types`, then `npm run build:renderer` so the bundle matches the source.
10. Run `npm run rebuild:native:electron` last, so the app starts again.
11. Fill in the Completion Log, and give the user the manual checklist below. Say that the companion plan is next.

### Manual checklist for the user

Acceptance is yours (Locked Decision 7). Start a new global match with the same settings as the 3.3.0 match: four AI seats, Small, region versus region, fog off. Play to turn 150 or to a win, and note:

1. **Musters.** In Active Operations, a sea operation's muster line reaches "N of N ground units and M of M ships" before it goes to sea.
2. **Minor powers.** The turns South America and Western Europe are knocked out. In 3.3.0 these were 24 and 26. Sea targets are always available, so a major might sail against another major early; note whether the minors still fall.
3. **Campaign lifts.** After the minors fall, a `campaign lift by sea` operation appears for a major, the Campaign Objective says "Approach: by sea", and later lifts land on the beachhead.
4. **Posture.** The Posture section shows a Ships line and Fit lines. Note whether either commander declares `maritime`.
5. **Home cities.** Watch each major's home city share in the charts. In 3.3.0 neither core changed hands after turn 30, apart from one landing that briefly took 29% of Eastern Asia.
6. **The save.** Keep the save. It can be analyzed the same way as the 3.3.0 match.

### Verification

The Phase Check passes, `check-doc-links` passes, and the Completion Log is complete.

---

## Reliability Checklist

Confirm each before the hand-off:

- [x] No file outside a phase's lists was edited, except those recorded.
- [x] Every new function logs on entry at the named level, and every catch logs `logError`.
- [x] `campaignSeaRoutesForState`, `campaignLiftForSeat`, and `buildPostureFitLines` cannot throw into a consult or a turn: each has its try/catch.
- [x] A 3.3.0 save's rows round-trip unchanged (the memory tests prove it).
- [x] Raids behave as in 3.3.0, apart from the muster rule: `seaOperationCandidates.test.ts` passes unchanged.
- [x] No string in texts A to H was retyped with a literal number.
- [x] `check:circular` prints no cycle.
- [x] `seaOperationAdvance.ts` grew by at most 12 lines, `campaignRules.ts` is under 600, and `consultPromptParts.ts` is unchanged.
- [x] No plan vocabulary in code, tests, or `doc/`.

Reliability Checklist outcome: every item confirmed. Files beyond the phase lists are recorded in the Completion Log (`campaignRules.test.ts` in Phase 6, `promptContracts.ts` in Phase 8, `static/renderer.js` in Phase 9).

## Success Definition

- Every phase's named tests and static checks pass.
- A sea operation waits for the ships its troops need.
- A campaign can hold a sea target, and the engine launches campaign lifts against it under the posture's share and the required-force rule.
- The briefing tells commanders about sea campaigns, campaign lifts, and posture fit, in the exact texts above.
- The docs, the version (3.4.0), and the release notes are updated.
- The user has the manual checklist.

## Phase 0 Inventory

| Item | Value |
| --- | --- |
| Static check results | rebuild:native:node ok (prebuilt binary); build:main ok; lint ok; check:circular ok (none); check:renderer-types ok (5 resolved baseline entries printed, status ok) |
| Pre-existing failures in named tests | None. All named existing test files exit 0. `dist/main/openRouter/requestOrdersFlow.test.js` does not exist (the plan says "if it exists"). |
| Line counts | seaOperationAdvance.ts 709; seaOperationAdvance.test.ts 601; consultPromptParts.ts 602; campaignRules.ts 593; operationTurnFlow.ts 340; seaOperationCandidates.ts 349; liftRules.ts 216; operationCandidates.ts 204; campaignObjectiveFlow.ts 314; campaignTargetOverride.ts 95; briefingSectionsOperations.ts 310; briefingSectionsCampaign.ts 116; briefingSectionsPosture.ts 101; requestOrdersInjection.ts 387 |
| Anchors confirmed | All six exist once (seaOperationAdvance.ts:427, operationCandidates.ts:102, operationCommands.ts:372, campaignRules.ts:394, briefingSectionsOperations.ts:309); the "by land." sentence is in campaignRuleText.ts twice (lines 40, 41). The same sentence also appears in promptContracts.ts:280 (Phase 8 lists promptContracts.test.ts but not promptContracts.ts). scripts/circular-deps-baseline.json is `[]`. |

## Defect Inventory

| Phase | Defect | Fix or reason for stopping |
| --- | --- | --- |

## Completion Log

| Phase | Result | Files changed beyond the lists | Sketch differences | Notes |
| --- | --- | --- | --- | --- |
| 0 | Done. See the Phase 0 Inventory. No pre-existing failures. | None | None | `requestOrdersFlow.test.js` does not exist. |
| 1 | Pass. build:main, lint, check:circular ok. `seaMusterRules`, `seaOperationAdvance`, `operationTurnFlow` tests pass. `seaOperationAdvance.ts` 709 to 716 (+7); `seaOperationAdvance.test.ts` 601 to 627 (+26). | None | The "waits" test asserts a march for the away ship and no embark, not an exact action list, because units at the port also get a gather action. | Existing muster cases passed unchanged. |
| 2 | Pass. build:main, lint, check:circular, check:renderer-types ok. `operationPurpose`, `operationMemory`, `operationCandidates`, `operationCommands`, `operationTurnFlow` tests pass. | None | `parseOperation` drops the whole operation for an unknown purpose or a bad minimum (same as any other bad field). | `methodHasRoom` exported. |
| 3 | Pass. build:main, lint, check:circular ok. `seaOperationCandidates`, `liftRules`, `operationCandidates`, `operationTurnFlow`, `operationCommands` tests pass. No existing expected value changed. `seaOperationCandidates.ts` 349 to 508; `liftRules.ts` 216 to 293; `operationCandidates.ts` 204 to 233. | None (removed the now-unused `isLandUnitType` and `CAMPAIGN_CONTACT_RADIUS` imports from `operationCandidates.ts`) | Added exported `SeaLiftGroundShare` and `SeaLiftForceArgs`, `LiftProtectedUnitArgs` interfaces (field comments) and a private `noForce` logger. `buildSeaLiftForce` also logs a debug line on success. | `liftRules.ts` now imports `CAMPAIGN_CONTACT_RADIUS` from `openRouter/campaignRules` (no cycle). |
| 4 | Pass. build:main, lint, check:circular, check:renderer-types ok. `campaignSeaRules` (10 cases) and `campaignTargetSelection` tests pass. | None | None | The `campaignTypes.ts` backup was taken from `git show HEAD` because the file was edited before its copy was made; the file had no earlier change. |
| 5 | Pass. build:main, lint, check:circular ok. `campaignRules`, `campaignObjectiveFlow`, `campaignTargetOverride` tests pass unchanged. `campaignRules.ts` 593 to 514. | None | The moved function's log label now names `campaignObjectiveResolution`. | Importers updated: `campaignObjectiveFlow.ts`, `campaignRules.test.ts` only. No other `src/` file imported it. |
| 6 | Pass. build:main, lint, check:circular ok (check:renderer-types not needed: no `src/shared` or `src/renderer` file edited). All named tests pass: `campaignSeaFlow` 3, `campaignObjectiveResolution` 5, `campaignTargetSelection` 7, `campaignTargetOverride` 3, `campaignRules` 11, `campaignObjectiveFlow` 3, `campaignObjectiveMemory` 4, `operationCommands` 21, `operationCommandsLand` 3, `landOperationCandidates` 2. | `src/main/openRouter/campaignRules.test.ts` (the resolve case failed to compile because `resolveCampaignObjective` now requires `seaStepsByH3`, `campaignLiftRunning`, and `skip`; added a local wrapper that passes empty values, so every existing case is unchanged) | `campaignSeaFlow` takes the seat's stored operations with `readOperations` and gets port land steps from the caller's `landStepsFromForce`. `campaignObjectiveFlow.ts` computes `storedLandReachable` as land steps at most `CAMPAIGN_REACH_LIMIT_STEPS`. The override test copies the sea-only city arrangement from the `campaignSeaFlow` test, since test files cannot import each other. | `campaignObjectiveFlow.ts` 314 to 339 lines; `consultPromptParts.ts` still 602; `seaOperationAdvance.ts` 716 (+7 since Phase 0). |
| 7 | Pass. build:main, lint, check:circular ok. `campaignLiftLaunch` (7 cases), `seaOperationAdvance` (31), `operationTurnFlow` (5), `operationCandidates` (8), `campaignObjectiveFlow` (3) tests pass. `seaOperationAdvance.ts` 709 to 716 (+7 since Phase 0); `seaOperationAdvance.test.ts` 601 to 639; `operationTurnFlow.ts` 340 to 365; new `campaignLiftLaunch.ts` 182 and its test 372 lines. | None | `campaignLiftForSeat` computes land-step reach from the stored waypoint and the friendly count with its own `getLandStepDistances` calls, and takes eligible units from every own infantry and armor not embarked, busy, protected, or within reach of the waypoint. The raid-beside-it case stores a raid at its muster with its own units and ship. | The first lift lands on whichever of the target landing hexes or held beachhead hexes sails soonest. |
| 8 | Pass. build:main, lint, check:circular ok. `postureFit` (5), `briefingSectionsPosture` (4), `briefingSectionsCampaign` (6), `briefingSectionsOperations` (23), `promptContracts`, `coachingText` (17) tests pass; `requestOrdersFlow.test.js` does not exist. `consultPromptParts.ts` still 602 lines. | `src/main/openRouter/promptContracts.ts`: its response-field text for `campaignTarget` carried the same sentence ending `by land.`, so it now ends `by land or by a campaign lift.` to match text A (no test pinned it; `promptContracts.test.ts` and `coachingText.test.ts` needed no change). | The text-B paragraph and text-C paragraph are module constants. The fit paragraph is left out without a campaign. `campaignBullet` and `buildOperationsSection` comments updated. | The doc copy of that `campaignTarget` field sentence in `strategic-prompt.md`, `assembly-contract.md`, and `example-strategic-prompt.md` was updated in the docs step. |
| 9 | Pass. `npm version 3.4.0 --no-git-tag-version`; build:main, lint, check:circular, check:renderer-types ok (5 resolved baseline entries, same as the start); `check-doc-links` ok; `build:renderer` ok (`static/renderer.js` regenerated); `rebuild:native:electron` ok last. | `static/renderer.js` (regenerated by `build:renderer`) | `doc/README.md` also lists the new constants in the symbols paragraph. The example prompt gains the rule-text paragraphs only; its sample briefing has no Ships or Fit lines because the sample match data does not support computing them. | README test count left for the user to update after the final pass. The companion plan is next. |
