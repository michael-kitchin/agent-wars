# Logistics and Operations Review Fixes: Execution Plan

> **For agentic workers:** Work the phases in order and finish each phase's verification before starting the next. Steps use checkbox (`- [x]`) syntax for tracking. **Do not commit or push at any point** (`.cursor/rules/11-no-commit-or-push.mdc`). The user reviews all changes first.

**Goal:** Fix the defects, missing pieces, and documentation drift that a review found in the implementation of seven plans:

- `2026-11-13-logistics-commander-execution-plan.md` (commit `78588e6`)
- `2026-11-13-operations-1-lift-foundations-execution-plan.md` (`727bff7`)
- `2026-11-13-operations-2-sea-operations-execution-plan.md` (`a947cf4`)
- `2026-11-13-operations-3-operation-menu-execution-plan.md` (`24e6928`)
- `2026-11-13-operations-4-air-operations-execution-plan.md` (`322d452`)
- `2026-11-13-operations-5-land-campaign-execution-plan.md` (`3ffce29`)
- `2026-11-13-operations-6-posture-execution-plan.md` (`6693baa`)

**Architecture:** No new feature and no new module. Each fix is a small change inside the function that is wrong, plus a contract test that fails before the fix and passes after it.

**Tech stack:** TypeScript, `node:test`. There are no new dependencies.

## How the Review Was Judged

These rules were set by the user. Do not reopen them.

- **Later plan wins.** When a later plan deliberately changed what an earlier one specified, the later behavior is the target and is not a defect.
- **Behavior only.** Orienting-comment completeness, the 600-line guideline, argument counts, and plan identifiers in code are out of scope here. The repository rules still apply to the code you write.
- **Deviations case by case.** A difference that keeps the requirement and is sound is accepted, and only its documentation is corrected. A difference that breaks a requirement, a contract, or correctness is fixed in code.

## What the Review Found

| Plan | Result |
| --- | --- |
| Logistics | No code defect. One wording edge case, one weak test, three documentation drifts. The 23-turn match in `debug.log` met all three pass criteria: every seat queued a missile and a ship, all four seats launched missiles, and raises were placed outside home regions. |
| Operations 1 | No code defect. One stale sentence in `doc/README.md`. |
| Operations 2 | An empty ship keeps sailing to the enemy coast. Four tests pass without testing their rule. Three documentation drifts. One wording error. |
| Operations 3 | The repair-schema example launches row A. Cancelling an operation erases orders given in the same reply. An operation id can repeat within a turn. Two missing tests. |
| Operations 4 | **An air operation usually ends on the tick it launches.** A tempo-strike test proves nothing. The Ready gather can fail every seat on one state read. Weather is ignored in the ferry range. One example-doc error. Two missing tests. |
| Operations 5 | No engine defect. One prompt sentence and one doc condition are out of date. |
| Operations 6 | **The system prompt contradicts the engine under `blitz`.** `strangle` keeps naming missile cities past the cap. Refusals are logged as `applied`. Two documentation drifts. |

## Rules for the Implementing Agent

- Never commit or push.
- Every new or changed function, field, and constant gets an orienting comment in the file's existing style (`Purpose / When to use / Expected outcome / Exceptions`). Update a comment whose stated behavior you change (`04-orienting-comments.mdc`).
- An updated public function keeps its current log level and includes the new argument in that log. Private helpers stay unlogged unless the file already logs that kind of helper (`02-backend-logging.mdc`).
- Never write "Phase", "Step", or any identifier from this plan in code, comments, or `doc/` (`12-no-plan-identifiers.mdc`).
- Functions take at most 6 arguments. Pass an object when you would need more (`10-argument-limits.mdc`).
- `src/main/operations/seaOperationAdvance.ts` is 880 lines and `src/main/openRouter/requestOrdersApplyParsed.ts` is 757. Neither may pass 1000. If an edit would take one past 950, stop and report.
- Tests cover contracts only (`03-testing-standards.mdc`). Add exactly the tests each step lists. For each code fix, run the new test **before** the fix and confirm it fails, then make the fix and confirm it passes. If a new test passes before the fix, stop and report. The test is not testing the defect.
- Text in quotation marks in this plan is final wording. If a test or a doc contract forces different wording, stop and report.
- Do not edit files under `.spec/completed/`, the seven plans above, or `doc/ai-commander-prompts/example-tactical-prompt.md`.
- Update `doc/` in the phase that changes the behavior, as each step says. Phase 7 covers drift that no code change causes.

## Test Commands

`FILE` is the compiled test named in the step:

```text
npm run build:main
node dist/main/FILE.test.js
```

`build:main` must succeed before a test result means anything. A TypeScript error counts as a failed step. Paths under `src/main/` compile to `dist/main/` with the same relative path. For example, `src/main/operations/airOperationAdvance.test.ts` runs as `node dist/main/operations/airOperationAdvance.test.js`.

---

## Phase 1: Prompt Text That Misleads the Model

Text-only fixes in builders. Each one is checked by a builder test.

### Step 1: One launch sentence that is true under every posture

- [x] In `buildOperationRuleBlock` (`src/main/openRouter/promptSpec/operationRuleText.ts`, the `commandsEnabled` paragraph), replace the opening and the two engine sentences. Keep everything else in the paragraph unchanged, including `${OPERATION_MENU_SIZE}` and the launch and cancel JSON.

  | Now | Replace with |
  | --- | --- |
  | `When you have room for another operation, Operation Options lists up to ${OPERATION_MENU_SIZE} you could launch, with what each would gain, what it would tie up, and what stands in its way.` | `Operation Options lists up to ${OPERATION_MENU_SIZE} operations you could launch, with what each would gain, what it would tie up, and what stands in its way. A sea or air row is listed only while you have room for another operation by that method.` |
  | `The engine launches the first undefended sea or air row on the turn after that row was offered. It never launches a land row, and it never launches a defended row.` | `On the turn after a sea or air row was offered, the engine launches the first one it counts as clear: an undefended row, or a lightly held one when your posture allows it. It never launches a land row.` |

  Why: under `blitz` the engine launches a row with one defender (`engineMayLaunch` in `src/main/operations/operationTurnFlow.ts`, `engineLaunchMaxDefenders`). And with the campaign on, land rows print even when no slot is free (`operationCandidatesForSeat`). The old text contradicted both.

- [x] In `src/main/openRouter/promptSpec/coachingText.test.ts`:
  - The assertion for `'Operation Options lists up to 5 you could launch'` becomes `'Operation Options lists up to 5 operations you could launch'`.
  - The assertion for `'it never launches a defended row'` becomes two assertions: the text includes `'or a lightly held one when your posture allows it'`, and it does not include `'never launches a defended row'`.
  - The `buildOperationRuleBlock(false)` assertion (about line 366) must still pass. Update only its search string if it names the old opening.

- [x] Docs, same change:
  - `doc/ai-commander-prompts/example-strategic-prompt.md` line 162: apply the same two replacements, with the number 5.
  - `doc/ai-commander-prompts/strategic-prompt.md` has two sentences. Line 138 says `it never launches a defended sea row` and the next sentence already states the blitz case. Line 236 says `never launches a defended sea row` with no blitz exception. In both, replace that "never" clause with: the engine launches only a row it counts as clear, which is an undefended one, or a lightly held one under a posture that allows it. Keep line 138's following blitz sentence.
  - `doc/ai-commander-prompts/information-decision-model.md` line 148 (`OPERATION_RULES` row) says `a defended sea row is never launched by the engine`. Replace that clause with the same clear-row wording. A search for `defended row` does not match it.
  - Search `doc/` for `defended row` and `defended sea row`. Fix any other sentence that says the engine never launches one. Leave a sentence that already limits that refusal to `overland` and then states the blitz case, except for the clause swap above.

### Step 2: "1 ground unit is"

- [x] In `src/main/openRouter/briefingSectionsOperations.ts`, the `assault` bullet (about line 126) always writes `are`. Add `const verb = operation.unitIds.length === 1 ? 'is' : 'are';` and write `${verb} marching on it`.
- [x] Test in `src/main/openRouter/briefingSectionsOperations.test.ts`: a sea operation in `assault` with one unit id prints `1 ground unit is marching on it`.

### Step 3: The missile attention never says "0 city cells"

- [x] In `formatMissileLaunchAttention` (`src/main/openRouter/briefingSectionsMissiles.ts`, about line 253), the target list keeps airport-only and seaport-only hexes (`enemyInfrastructureHexes`, line 173). `first[2]` is already `String(urbanHexCount)`, so the check is `first[2] === '0'`. When that is true, return `Missiles: ${ids} can launch. Best target: ${first[0]}, a ${first[1]} airport or seaport. Add a missileLaunches entry.` Keep the existing text, unchanged, for every other count.
- [x] Test in `src/main/openRouter/briefingSectionsMissiles.test.ts`: the only reachable enemy target has 0 urban cells and 1 airport. The line contains `airport or seaport` and does not contain `0 city cells`.

### Step 4: The repair example must not launch anything

- [x] In `buildRepairSchemaText` (`src/main/openRouter/promptSpec/envelopeContract.ts`, line 440), replace `example.operations = [{ action: 'launch', option: 'A' }];` with `example.operations = [];`.

  Why: every other value in that example is harmless if copied. Option `A` is a real row whenever a menu was printed, so a model that copies the example launches it. An empty array means "no command" to the parser.

- [x] Test in `src/main/openRouter/promptSpec/envelopeContract.test.ts`: `buildRepairSchemaText` called for a strategic reply with operations included contains `"operations":[]` and does not contain `"launch"`. Copy the argument shape from the nearest existing `buildRepairSchemaText` test.
- [x] Docs: search `doc/ai-commander-prompts/` for `"option":"A"` inside a repair example. Change any you find to `"operations":[]`. Leave the main reply examples alone.

### Phase 1 verification

- [x] Run `npm run build:main`, then:
  - `promptSpec/coachingText.test.js`
  - `briefingSectionsOperations.test.js`
  - `briefingSectionsMissiles.test.js`
  - `promptSpec/envelopeContract.test.js`
  - `promptContracts.test.js`
  - `promptSpec/variantConformance.test.js`

  All under `dist/main/openRouter/`. Expected: all pass. If `promptContracts.test.js` or `variantConformance.test.js` fails on a tactical case, stop. The tactical prompt must not change.

---

## Phase 2: Operations That End or Sail Wrongly

Pure engine logic. Each fix is tested with the existing fact builders in the same test file.

### Step 1: An air operation survives its own launch tick

- [x] In `advanceMuster` (`src/main/operations/airOperationAdvance.ts`, about lines 171–184), the infantry-order check ends the operation `abandoned` with reason `infantry-order` whenever the infantry has any stored order that is not a march or defend on the muster hex. On the launch tick that stored order is the one the launch is about to replace, so commander and engine air launches usually end at once. The commander also gets no drop reason.

  Change the condition to:

  ```ts
  const launchTick = operation.launchedTurn === facts.turnNumber;
  if (!launchTick && stored !== undefined && !onMuster) {
  ```

  This mirrors `claimedThisTurn` in `remainingForce` (`seaOperationAdvance.ts`, line 400). Update the function's comment to say that the launch tick replaces the infantry's earlier order.

  First confirm that `Operation` has `launchedTurn` and that `facts.turnNumber` is the tick's turn. Both are read in `seaOperationAdvance.ts`. If either is missing, stop and report.

- [x] Tests in `src/main/operations/airOperationAdvance.test.ts`:
  1. The infantry has a stored `{ type: 'defend', h3Index: <a hex that is not the muster> }`, with `launchedTurn: 1` and `turnNumber: 1`. Expect `outcome: 'running'`, and an action that moves the infantry toward the muster airport. Use the same action kind the file's existing "muster" test expects.
  2. The same stored order with `turnNumber: 2`. Expect `outcome: 'abandoned'` and `releasedIds` equal to `[<infantry id>]`.

### Step 2: A ship whose cargo is all gone stops sailing

- [x] In `advanceTransit` (`src/main/operations/seaOperationAdvance.ts`, line 677), a transit with ships left and no ground unit falls through to `unloadAtLanding`. It sails the empty ship to the enemy coast, enters `assault` with no units, and ends `lost` on the next tick.

  Add a private helper beside `departuresWereReleases`:

  ```ts
  function departureOutcome(operation: Operation, releasedIds: readonly string[], facts: OperationFacts): 'abandoned' | 'lost' {
    const released = new Set(releasedIds);
    const gone = [...operation.unitIds, ...operation.carrierIds]
      .filter((id) => !released.has(id))
      .some((id) => !facts.unitHexById.has(id));
    return gone ? 'lost' : 'abandoned';
  }
  ```

  Its comment says: lost only when a unit or ship that was not released is missing from the map. That matches `doc/hybrid-ai.md` ("lost when one of those units is gone from the map"). On the both-empty return this keeps today's result: lost when any named unit or ship is missing and was not released, abandoned when every departure was a release. The existing test `transit is lost when the ship and its cargo are gone` must still pass without edits.

- [x] In `advanceTransit`:
  - Replace `departuresWereReleases(operation, releasedIds) ? 'abandoned' : 'lost'` with `departureOutcome(operation, releasedIds, facts)`. That is the only call to replace.
  - `unitIds` here is the list after `remainingForce` and `dropUncarried`. Insert the empty-cargo return after the both-empty block and before the no-ship assault transition. A landed wave still in `unitIds` must not end the voyage. `cancelAll` stops the remaining ships. Do not turn them home.

    ```ts
    if (unitIds.length === 0) {
      const outcome = departureOutcome(operation, releasedIds, facts);
      return ended(outcome, 'transit-empty', cancelAll(carrierIds), releasedIds);
    }
    ```

  - If `departuresWereReleases` then has no caller, delete it.

- [x] Tests in `src/main/operations/seaOperationAdvance.test.ts`:
  1. Transit with one ship at sea. Its only cargo unit has a stored order of its own, so it is released, and it is still on the map. Expect `next === null`, a `cancelOrder` for the ship, and outcome `abandoned`.
  2. Transit with one ship at sea and its only cargo unit missing from `unitHexById`. Expect `next === null` and outcome `lost`.

- [x] Docs: in `doc/hybrid-ai.md`, the transit paragraph, add after the sentence that starts `During transit, if nothing remains`: "A transit whose ground units have all left ends there. Its ships get no further order from it." Make sure that paragraph's "lost" sentence still matches `departureOutcome`. Do not edit the loading sentence here. Phase 7 replaces that sentence in full.

### Step 3: An operation id is never reused within a turn

- [x] In `resolveCommands` (`src/main/operations/operationCommands.ts`, about line 182), `operations` is the list after cancels are merged. `acceptCandidate` (line 390) builds the new id from it. A cancel plus a launch in one reply can therefore give the new operation the id that was just cancelled.

  Pass the stored list as well. Add `readonly stored: readonly Operation[]` to the argument objects of `resolveLaunch`, `resolveNamedLaunch`, and `acceptCandidate`. In `acceptCandidate`, build the id with `nextOperationId(args.seatId, [...args.stored, ...args.operations], args.state.turnNumber)`. Keep `args.operations` as the list the new operation is added to. `nextOperationId` already puts ids in a `Set`, so a duplicate in that combined list is harmless. Do not dedupe. The suffix walk stops at `z` and would repeat that id, which the slot limits cannot reach.

- [x] Test in `src/main/operations/operationCommands.test.ts`:
  - Store one sea operation with id `<seat>-op6` in `muster` on turn 6.
  - Apply `[{ action: 'cancel', id: '<seat>-op6' }, { action: 'launch', option: 'A' }]` with one candidate.
  - Expect the stored operation after the call to have id `<seat>-op6b`. Copy the exact seat id from the file's existing launch test. The second suffix `nextOperationId` uses is `b`.

### Phase 2 verification

- [x] Run `npm run build:main`, then `operations/airOperationAdvance.test.js`, `operations/seaOperationAdvance.test.js`, `operations/operationCommands.test.js`, `operations/operationCommandsLand.test.js`, and `operations/operationTurnFlow.test.js` under `dist/main/`. Expected: all pass.

---

## Phase 3: A Cancel Keeps Orders Given in the Same Reply

The system prompt says: "To take a unit or a ship out of an operation, give it any standing order of your own; it keeps that order." A reply that cancels a mustering operation and reassigns its units breaks that today:

- The reply's `assign_order` rows are written while the reply is parsed (`processV3OrdersArray`, `src/main/openRouter/envelopeOrderRows.ts`, line 199).
- `applyOperationCommands` runs after that (`requestOrdersApplyParsed.ts`, line 295).
- A muster cancel then sends `cancelOrder` to every unit and ship (`cancelSeaOperation`, `seaOperationAdvance.ts`, line 811), so the new orders are erased.

A transit cancel can also overwrite an order given to a ship that turn.

### Step 1: Pass the ids that already have a new order

- [x] Add `readonly keepOrderIds?: ReadonlySet<string>` to the argument object of `applyOperationCommands` (`src/main/operations/operationCommands.ts`, line 119). Its comment says: units and ships that this reply already gave a standing order to, or cancelled one for. A cancel does not touch their orders. Absent or empty means the filter drops nothing. Add the set's size to the existing `applyOperationCommands` debug log.
- [x] In `resolveCommands`, in the cancel loop, before `actions.push(...outcome.step.actions)`, drop every action whose `kind` is `'cancelOrder'`, `'march'`, or `'defend'` and whose `unitId` is in `args.keepOrderIds`. Those are the standing-order writes on the cancel paths:
  - Sea muster: `cancelOrder` for every unit and ship (`cancelSeaOperation`).
  - Sea transit: `march` home for each ship (`turnSeaOperationBack`). The ashore `defend` added later is on that same function, and a transit cancel calls it.
  - Air cancel: `cancelOrder` for infantry still on the ground, `defend` for the air unit (`endAirOperation`), and `unload` plus `defend` when the infantry is aboard (`detachInfantry`).
  Leave `unload`, `embark`, and `holdFire` in place. `OperationAction` is declared in `seaOperationAdvance.ts`. Every one of those kinds carries `unitId`.
- [x] Apply the filter to cancels only. Launch actions keep replacing orders, as `doc/hybrid-ai.md` says ("The tick an operation is launched replaces the standing orders its units and ships already have").
- [x] In `src/main/openRouter/requestOrdersApplyParsed.ts`, at the `applyOperationCommands` call (line 296), pass `keepOrderIds: new Set(parsed.standingOrderUnitIds ?? [])`. The same set is already built for `skipUnitIds` at line 501. Do not move that code. The `requestOrdersApplyParsed` debug log for that call, if one exists beside it, includes the set size. If that call has no log of its own, the `applyOperationCommands` log is enough.

### Step 2: Test

- [x] In `src/main/operations/operationCommands.test.ts`. Run each new test before the filter and confirm it fails.
  - Launch row A so that a sea operation is stored in `muster` with two units. Write a `defend` standing order for one of its units, the way the file's other tests write orders. Apply `[{ action: 'cancel', id: <that id> }]` with `keepOrderIds` holding that unit. Expect the unit to still have its `defend` row, and the other unit to have no standing order.
  - A transit cancel whose ship is in `keepOrderIds`: no `march` for that ship, and the stored operation is in `return`.
  - An air muster cancel whose infantry is in `keepOrderIds`: no `cancelOrder` for that infantry. A second call with the air unit in the set: no `defend` for that air unit.

### Step 3: Docs

- [x] In `doc/hybrid-ai.md`, the Operations paragraph that describes cancel, add: "A cancel leaves alone any unit or ship that the same reply gave a standing order to."

### Phase 3 verification

- [x] Run `npm run build:main`, then `operations/operationCommands.test.js`, `operations/operationCommandsLand.test.js`. Expected: all pass. Then run `npm test`, because the wiring in `requestOrdersApplyParsed.ts` has no test file of its own. Expected: exit code 0.

---

## Phase 4: Production, Ready, and Logging

Independent small fixes.

### Step 1: `strangle` stops at the missile cap

- [x] In `buildProductionPriorityLines` (`src/main/openRouter/productionPriorities.ts`, line 180), `counts.missile` counts only built missiles. Under `strangle`, `missilePriorityEveryCity` removes the "already queued" gate, so missiles queued in other cities stack past the cap. The Postures block promises "until you are at the missile cap".

  When `missileEveryCity` is true, compare built plus queued missiles with the cap: `counts.missile + queuedMissileCount(args.queues) < caps.missile`. Add a private `queuedMissileCount(queues)` helper that counts entries whose `unitType` is `missile`, read the same way `typeIsQueued` reads them. Leave the comparison unchanged when `missileEveryCity` is false. The per-city skip that stops `strangle` from naming a city which already has a missile queued stays as it is.

- [x] Test in `src/main/openRouter/productionPriorities.test.ts`, with `strangle` settings: one missile owned, one missile queued in another city, cap 2. Expect no missile line. Reuse the file's existing `strangle` test setup.

### Step 2: One bad state read does not fail the whole Ready

- [x] In `gatherCommanderOrdersForReady` (`src/main/openRouter/commanderReadyGather.ts`), the standing-order `try` already logs and omits a seat. The merge loop (lines 152–157) calls `args.getGameStateForPlayer(seatId)` with no `try`, and that throw fails the whole Ready.

  Wrap only each seat's merge in `try`/`catch`. On a throw, call `logError('commanderReadyGather could not add operation orders', { seatId }, err)` and leave that seat's orders as they already are. The logger accepts that shape. Do not copy the two-argument `logError` in the standing-order catch, which drops the seat id. Rewrite the file comment and the function comment so the two paths stay distinct: a throw while building standing orders logs and omits the seat; a throw while adding operation orders logs and leaves that seat's orders unchanged.

- [x] Test in `src/main/openRouter/commanderReadyGather.test.ts`. The file exists, and `getGameStateForPlayer` is injected. Do not skip. Give two seats stored pending orders, then a getter that throws for one of them. Expect both seats in the result, and the throwing seat still holding its pending orders.

### Step 3: Weather shortens the air candidate's ferry hop

- [x] In `launchAirports` (`src/main/operations/airOperationCandidates.ts`, line 95), `strategicFerryRangeOnState(args.air, ...)` reads `args.air.weatherTags`. `listUnitsForSnapshot` copies `birth_h3_index` onto `origin` and does not set `weatherTags`. The engine ferry reads the tags with `weatherTagsForBirthHex` (`src/main/gameActions/airFerryRoute.ts`).

  When `args.state.weatherBonusEnabled === true`, pass `{ weatherTags: weatherTagsForBirthHex(args.air.origin?.birthH3Index) }`. Do not call `dbGetOne`. When the flag is not true, pass `args.air` unchanged. An absent origin yields empty tags, the same as a unit with no birth hex.

- [x] Test in `src/main/operations/airOperationCandidates.test.ts`. The file builds its own snapshot, so do not skip. `strategicFerryRangeHexes` returns 2 only when the flag is on, the destination is snow, and the unit lacks the snow tag. With the flag on and no snow tag (no origin), an airport 3 or 4 hexes away in snow is absent. The same call with the flag omitted lists it. A birth hex whose `weatherTagsForBirthHex` result includes `snow` still lists that airport when the flag is on. If the climate pack cannot supply a snow destination or a snow-tagged birth hex, stop and report.

### Step 4: Log what actually happened to a posture

- [x] In `applyPostureChoice` (`src/main/operations/postureChoice.ts`):
  - Change the echo log (line 37) to `'postureChoice unchanged'`.
  - Change the refusal log (line 42) to `'postureChoice refused'`.
  - Keep `'postureChoice applied'` only after `writePosture`.

  Phase 8 of the posture plan counts `postureChoice applied` lines to reconstruct posture changes, so a refusal must not use that message. No test: log text is not a contract (`03-testing-standards.mdc`).

### Phase 4 verification

- [x] Run `npm run build:main`, then `openRouter/productionPriorities.test.js`, `openRouter/commanderReadyGather.test.js` (if present), `operations/airOperationCandidates.test.js`, and `operations/postureChoice.test.js`. Expected: all pass.

---

## Phase 5: What the Commander Is Steered Toward

These five fixes follow the plans' intent, but not their wording. The user decided each one. Do not reopen them:

- Name a mercenary count.
- Keep the credits treasury ceiling unchanged.
- Units ashore defend where they are.
- Paused queues do not count.
- Posture text drops campaign clauses when there is no campaign.

### Step 1: The mercenary attention names a count

The 23-turn log shows commanders copying the attention line literally: one infantry unit per turn while treasuries grew to 1,000–2,500 credits. The line will name the largest count the treasury can carry.

- [x] In `formatMercenaryRaiseAttention` (`src/main/openRouter/mercenaryRaiseAttention.ts`), keep how the hex and the option are chosen. Add a private helper:

  ```ts
  function affordableRaiseCount(credits: number, row: RaiseOptionRow, option: HireRaiseOption): number {
    const byCredits = Math.floor(credits / (option.fee + MERCENARY_UPKEEP_RESERVE_TURNS * option.upkeep));
    const byCapacity = Math.floor(row.capacityLeft / option.unitCost);
    return Math.max(0, Math.min(byCredits, byCapacity, HIRE_COUNT_MAX));
  }
  ```

  Import `HIRE_COUNT_MAX` from `../../shared/mercenaryRules`. Its comment says that each unit reserves its fee plus `MERCENARY_UPKEEP_RESERVE_TURNS` turns of its own upkeep, the same rule as `optionIsAffordable`, and that the hex's unused capacity and the raise-order limit cap the count. The chosen option is affordable, so the result is at least 1. If it is 0, return `null` as if no option were affordable.

- [x] Replace the text with:

  ```ts
  `Mercenaries: your treasury of ${economy.credits} credits can raise ${count} ${option.unitType} at ${args.format(chosen.h3Index)} for ${count * option.fee}, keeping ${MERCENARY_UPKEEP_RESERVE_TURNS} turns of their upkeep. ` +
    `Add a raise_mercenaries row with "count": ${count} to productionOrders.`
  ```

  Add `count` to the `logDebug` fields.

- [x] Tests in `src/main/openRouter/mercenaryRaiseAttention.test.ts`:
  - Update the existing expected strings to the new template.
  - Add one case where credits allow 6 units but the row's `capacityLeft` allows only 4. Expect `can raise 4`.
  - Add one case where capacity allows 10 but credits allow 3. Expect `can raise 3`, and the fee total equals 3 × the option fee.

- [x] Docs: search `doc/` for `raise_mercenaries row to productionOrders` and `can raise`. Update every quoted attention line to the new template. Phase 7 handles the example prompt.

### Step 2: Paused queues do not count as producing

`creditsNext` and the "missile already queued" check read every queue row, including rows paused by occupation. In the log, about 20 paused rows with credits next hid the credits line, even if no city was really producing credits.

- [x] In `src/main/openRouter/productionPriorities.ts`, add a private `rowIsPaused(row: ControlledHexQueueSnapshot): boolean`, which returns `Array.isArray(row.pausedReasons) && row.pausedReasons.length > 0`. Use it in:
  - the existing `pausedReasons` check inside `builderFor` (line 69), so behavior there is unchanged. Keep the `buildPaused === true` check above it;
  - `typeIsQueued`: skip paused rows;
  - the `creditsNext` scan (about line 256): skip paused rows;
  - `queuedMissileCount` from Phase 4, Step 1: skip paused rows. That skip does not replace the per-city check that stops `strangle` from naming a city which already has a missile queued.

  Update the comments of `typeIsQueued` and `buildProductionPriorityLines` to say that a paused row does not count.

- [x] Tests in `src/main/openRouter/productionPriorities.test.ts`:
  - The only credits entry is in a paused row. Expect a credits line, given a city that qualifies and a treasury below the ceiling.
  - The only queued missile is in a paused row. Expect a missile line.

- [x] Docs: where `doc/hybrid-ai.md` or `doc/ai-commander-prompts/strategic-prompt.md` describes when a Production Priorities line prints, add that paused queues do not count.

The credits treasury ceiling (`CREDITS_TREASURY_CEILING_TURNS`) stays as it is.

### Step 3: Units ashore leave a turned-back operation and defend

`turnSeaOperationBack` (`src/main/operations/seaOperationAdvance.ts`, line 828) keeps every present ground unit in `unitIds`. Units already ashore get no `return` order, so on the next tick they count as released, as if the commander had pulled them out.

- [x] In `turnSeaOperationBack`, split the present units with the existing `isCarried(unitId, facts, ships)`:
  - Carried units stay in `next.unitIds`.
  - Each unit ashore leaves the operation and gets `{ kind: 'defend', unitId, atH3: <its hex from facts.unitHexById> }` in `actions`.
  - Do not add the units ashore to `releasedIds`. That list means the commander released them.

  Update the function's comment.

- [x] Test in `src/main/operations/seaOperationAdvance.test.ts`: a transit whose objective is gone (so it turns back), with one carried unit and one unit ashore at a hex. Expect:
  - `next.unitIds` equals `[<carried unit>]`;
  - `actions` contains a `defend` for the ashore unit at its hex;
  - `releasedIds` is empty.

  Then advance the returned operation one more tick, with the ashore unit holding that defend order. Expect `releasedIds` to not contain it.

- [x] Docs: in `doc/hybrid-ai.md`, the sentence on turning back, add: "Units already ashore leave the operation and defend where they stand."

### Step 4: Posture text names only effects the match has

The campaign and land rows exist only in `region_vs_region`. On a global match the Postures block still says "Land options come first", and blitz still promises "assault with half the usual mass". The briefing's effect line also names a campaign threshold.

- [x] Make the campaign an explicit argument with no default, so every caller decides:
  - `buildPostureRuleBlock(campaignEnabled: boolean)` in `src/main/openRouter/promptSpec/postureRuleText.ts`.
  - `postureEffectLine(posture: Posture, campaignEnabled: boolean)` and `buildPostureSection({ stored, turnNumber, campaignEnabled })` in `src/main/openRouter/briefingSectionsPosture.ts`.

- [x] When `campaignEnabled` is true, every string stays exactly as it is now. When it is false:

  | Text | Change |
  | --- | --- |
  | Postures opening | `leans production, operations, and the campaign the same way` becomes `leans production and operations the same way`. |
  | overland bullet | Drop the sentence `Land options come first.` and the space after it. Keep the rest. |
  | blitz bullet | `- blitz: run twice the air operations, and let the engine launch against a lightly held objective.` followed by the unchanged "Like the 1940 campaign…" sentence. |
  | overland effect line | `The engine launches only against undefended objectives.` |
  | blitz effect line | `` `Air options are listed first and you may run ${settings.airOperationSlotFactor} times as many, and the engine launches against an objective with ${settings.engineLaunchMaxDefenders} defender.` `` |

  maritime and strangle do not change.

- [x] Call sites. `buildPostureRuleBlock()` is called with no argument from `promptSpec/coachingText.test.ts` (about lines 391–394) as well as from `buildStrategicContextCoaching`. Every current call passes `true`, or the build fails.
  - `buildStrategicContextCoaching` (`promptSpec/coachingTextStrategic.ts`, line 59) passes `gates.campaignEnabled === true`.
  - The `buildPostureSection` call in `src/main/openRouter/requestOrdersInjection.ts` (line 317) passes `campaignEnabled: args.state.scenarioId === 'region_vs_region'`. That is the same scenario test as `campaignEnabled` in `consultPromptParts.ts` (line 238). The orders and tactical tests are already in `showOperations`.
  - Add `campaignEnabled` to the existing trace log in `buildPostureRuleBlock`, `postureEffectLine`, and `buildPostureSection`.

- [x] Tests:
  - In `promptSpec/coachingText.test.ts`, the existing `buildPostureRuleBlock()` assertions (about lines 391–394) pass `true`. Add: `buildPostureRuleBlock(false)` does not include `half the usual mass` or `Land options come first`, and includes `twice the air operations`.
  - In `briefingSectionsPosture.test.ts`, existing calls pass `campaignEnabled: true`. Add: blitz with `false` does not include `campaign assaults`.

- [x] Docs: in `doc/hybrid-ai.md` (Posture section) and `doc/ai-commander-prompts/strategic-prompt.md` (Postures and Posture entries), add that without a campaign the block and the effect line omit the campaign and land clauses. If `doc/ai-commander-prompts/variants.md` lists prompt variants by scenario, add the same note there.

### Phase 5 verification

- [x] Run `npm run build:main`, then:
  - `openRouter/mercenaryRaiseAttention.test.js`
  - `openRouter/productionPriorities.test.js`
  - `operations/seaOperationAdvance.test.js`
  - `openRouter/promptSpec/coachingText.test.js`
  - `openRouter/briefingSectionsPosture.test.js`
  - `openRouter/promptContracts.test.js`
  - `openRouter/promptSpec/variantConformance.test.js`

  Expected: all pass, and no tactical expected string changed.

---

## Phase 6: Tests That Do Not Test Their Rule

The code these tests name is correct. The tests would pass without it. Strengthen each one. Do not change code in this phase. Confirm that each corrected test still passes. Then, for the first three only, check that it would fail if the rule were removed: temporarily comment out the guarding line, run the test, see it fail, and restore the line. Run `git diff` on that file to confirm the restore.

- [x] **Inland sea** (`src/main/operations/seaOperationCandidates.test.ts`, about lines 294–315). Use four infantry instead of two, so the lift cap allows the force. Add an assertion that the same setup with a reachable coastal city gives exactly one candidate.
- [x] **Campaign lift cap** (same file, about lines 317–328). Add a reachable clear city. Assert one candidate with `active: []`, and `[]` with an active operation that already holds the cap's units.
- [x] **Two infantry and the cap.** In the `'a clear coastal city across water is one candidate'` test, add the case: two infantry alone, with the city present, give `[]`.
- [x] **Unknown phase** (`src/main/gameDb/operationMemory.test.ts`, about lines 66–74). Build the bad entry as `{ ...sampleOperation('bad'), phase: 'flying' }`, so only the phase is invalid.
- [x] **No candidate clears a stored offer** (`src/main/operations/operationTurnFlow.test.ts`). After a tick stores an offer, remove the only ship and advance one turn. Expect `readOperationOffer` to return null turns.
- [x] **Missing land mass** (`src/main/operations/operationCandidates.test.ts`). Add "a missing land mass gives `[]`" if the terrain cache can be made unavailable in a test without new production code. If it cannot, leave the existing throw test as the substitute and say so in your report.
- [x] **Slot separation** (`src/main/operations/operationCandidates.test.ts`). Using `placeMixedForce`:
  - With one stored sea operation as `active`, the result has an `air` row and no `sea` row.
  - With one stored air operation, the result has no `air` row.

  Confirm first that one slot of each method is the limit in that setup. If it is not, store as many as the limit.
- [x] **Tempo strike replaced by the drop** (`src/main/openRouter/commanderReadyGather.test.ts`, test "an air operation in transit replaces that carrier tempo strike with a drop"). Place an enemy unit within `AIR_STRIKE_RANGE_HEXES` of the air unit, and do not put that air unit on hold fire. First assert that `buildUnconsultedCommanderOrders` for that seat includes a strike for the air unit. Then assert that the gathered orders do not. If the unconsulted orders still have no strike, stop and report the reason from `appendNearestLegalEngagement`. Do not weaken the assertion.
- [x] **Zero-credit raise table** (`src/main/openRouter/briefingSectionsMercenaries.test.ts`, about lines 139–158). Also assert that the block contains the Raise Options header line that starts with `| Hex | To Campaign Target |`.

### Phase 6 verification

- [x] Run `npm run build:main`, then each changed test file. Expected: all pass. `git diff --stat` shows only test files changed in this phase.

---

## Phase 7: Documentation Drift

No code. Take every number from the builder or constant named beside it.

- [x] **`doc/README.md` line 120:** delete the sentence "The consult does not read them." The briefing prints `LIFT_OBJECTIVE_CLEAR_RADIUS` (`briefingSectionsOperations.ts`, line 201), and the candidate search uses all three constants.
- [x] **`doc/hybrid-ai.md` loading sentence:** replace "When the ships and every ground unit are there, or when `OPERATION_MUSTER_TIMEOUT_TURNS` (10) have elapsed and at least the minimum are there, the engine loads the ships and marches them to a landing beside the city." with: "When at least one ship and every ground unit are there, or when `OPERATION_MUSTER_TIMEOUT_TURNS` turns have passed and at least one ship and `OPERATION_MIN_GROUND_UNITS` ground units are there, the engine loads the ships that are there. Ships and units left over leave the operation." Both constants are in `src/main/operations/operationRules.ts`: `OPERATION_MUSTER_TIMEOUT_TURNS` is 10 and `OPERATION_MIN_GROUND_UNITS` is 2. Write the numbers the way the paragraph already writes constants. Leave the following sentence, "Fewer than the minimum at that timeout abandons the operation.", in place. Do not repeat the timeout clause.
- [x] **`doc/hybrid-ai.md` line 119, Writes vs reads:** add optional `posture` to the JSON envelope row, after `operations`, with "on a strategic consult with standing orders on".
- [x] **`doc/ai-commander-prompts/information-decision-model.md`:**
  - The `ACTIVE_OPERATIONS` condition: add "an Operation Options row". `buildOperationsSection` prints the section for options alone.
  - The line-20 "Needs" clause: add "a campaign plan exists".
  - Add rows for the missile launch attention (`formatMissileLaunchAttention`), the mercenary raise attention (`formatMercenaryRaiseAttention`, `MERCENARY_UPKEEP_RESERVE_TURNS`), the tools block (`buildStrategicToolsBlock`), and the new Raise Options columns. Use the table's existing columns, next to `PRODUCTION_CAP_QUEUE_RULE`.
- [x] **`doc/ai-commander-prompts/example-strategic-prompt.md`.** Make the example consistent with itself. Each item names the builder that decides it.
  1. Add a `## Missiles` subsection between `## Air Units` and `## Fortifications`. Its text is what `buildMissileEmploymentRule` (`promptSpec/gameRuleMissileText.ts`) returns for a seat that can build a missile and owns none. Copy the template and fill in the example's values: range from the missile rules, urban minimum `buildMinimumUrbanCells('missile')` on the global map, and air attack.
  2. In Attention Flags, add the mercenary bullet that `formatMercenaryRaiseAttention` produces, using the Phase 5 template, for the example's Treasury (40) and its E3 row (fee 3, upkeep 3). Compute the count as that function does: credits allow `floor(40 / (3 + 3 × 3)) = 3`, then cap by E3's Capacity (after item 4) divided by the infantry unit cost. Write the resulting count and fee total.
  3. Make the Production bullet's type lists match Controlled Hex Queues, which includes `missile`.
  4. Make E3's Raise Options Capacity match `raiseCapacityForHex` (`src/shared/mercenaryRules.ts`) for its urban count. Either change Capacity to 54, or change E3's urban count so that 40 is right. Pick the smaller edit.
  5. The muster bullet `Mustering at FH: 2 of 2 ground units and 1 of 1 ship are there.` cannot happen, because a full muster loads on the tick before the briefing. Change it to `1 of 2 ground units and 1 of 1 ship are there`.
  6. The air row D: `a1-a1` is at G9 and the example has six air units. Make the row read `musters at G9` and `1 of 6 air units`, as `listAirOperationCandidates` and the air Cost text would print it.
  7. Response Format block: add `"posture": "<optional posture>"` after `"operations": [...]`, as `headerSlots` in `promptContracts.ts` emits it.

### Phase 7 verification

- [x] Run `rg -n "consult does not read them|every ground unit are there|never launches a defended|defended sea row is never launched|raise_mercenaries row to productionOrders" doc`. Expected: no hits for the first four. Every hit for the last one uses the template with `"count"`.

---

## Phase 8: Whole-Change Verification

- [x] `npm test`. Expected: exit code 0.
- [x] `npm run check:circular`. Expected: the same cycles as before this change, and no new one.
- [x] `rg -n "Phase [0-9]|Step [0-9]" src doc`. Expected: no hit introduced by this change.
- [x] `git status --short`. Expected: only files named in this plan, plus `dist/` output if it is tracked. Report anything else and do not revert it without checking what produced it.
- [x] Report, per phase, what changed and which tests were added. Name each test that you skipped as the plan allows, and give the reason.

### Verification run (for the user, not the agent)

The agent stops after the checks above. This run needs the game window and a model key. Set `AGENT_WARS_LOG_LEVEL=debug` and `AGENT_WARS_LOG_FULL_PROMPTS=1`, then run 40 turns on the global map with home regions on different continents, no fog, no tactical battles, and balanced doctrine. From `debug.log`:

- [ ] Count `airOperationAdvance` end lines with reason `infantry-order` on the same turn as the launch. Expected: none.
- [ ] Count air operations that reach transit. Expected: at least one if any air operation was launched.
- [ ] Count `postureChoice applied`, `postureChoice refused`, and `postureChoice unchanged` lines per seat.
- [ ] Read one `debug-last-strategic-prompt-N.txt`. The Operations paragraph contains "a lightly held one when your posture allows it". On the global map, the Postures block does not contain "half the usual mass".
- [ ] Count `mercenaryTools executeMercenaryTools` raise orders per seat and their unit counts. Expected: some raises of more than one unit. Compare each seat's treasury on the last turn with the 1,000–2,500 credits of the earlier run.
- [ ] Count `buildProductionPriorityLines` lines with `lineCount > 0` after turn 1. Expected: more than the earlier run's 22 of 92, if any city's queue was paused.

Optionally repeat 40 turns on one regional map, to check the posture text with the campaign on.

## Accepted Deviations (no action)

Each of these keeps its requirement. Docs already match unless the row says otherwise.

| Plan | Deviation |
| --- | --- |
| Operations 1 | Tests live in `standingOrdersEmbarkedCases.ts` and `possibleUnitActionsEmbarked.test.ts`, not the files the plan named. |
| Operations 1 | `doc/hybrid-ai.md` and other prompt docs were also edited. The edits are correct. |
| Operations 1 | The adjacent-cells fallback is gated for naval cargo only, through `canManualDebarkAtHex`. |
| Operations 2 | `cancel_order` with no standing order counts as success, because muster loads cancel units that may have none. |
| Operations 2 | `buildOperationFacts` runs once per operation rather than once per seat. Same result, more work. |
| Operations 5 | The land command tests are in `operationCommandsLand.test.ts`. |
| Operations 5 | Two extra guards refuse a `land` candidate on the engine path. |
| Operations 5 | `buildOperationRuleBlock` has a defaulted second parameter. |
| Operations 6 | `postureSettingsForSeat` resolves its database reader lazily to avoid an import cycle. |

## Decisions Behind Phase 5

These items followed the plans as written. The user chose to change them:

| Item | Decision |
| --- | --- |
| Posture text on a global match | Drop the campaign and land clauses when there is no campaign. |
| Units ashore when a transit turns back | They leave the operation and defend where they stand. They are not counted as released. |
| One mercenary per turn while treasuries grow | The attention line names the largest count the treasury and the hex can carry. |
| Credits line silent above the treasury ceiling | Keep the ceiling. Spending, not banking, is the problem. |
| Paused queues counted as producing | They no longer count, for credits or for missiles. |

## Out of Scope

- Orienting-comment completeness, file-length guidelines, argument counts, and plan identifiers in existing code, per the user's review scope.
- Unit costs, caps, and ranges.
- New logging beyond the renamed posture lines.
