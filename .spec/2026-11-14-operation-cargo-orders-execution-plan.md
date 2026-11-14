# Operation Cargo Orders: Execution Plan

> **For agentic workers:** Work the phases in order and finish each phase's verification before you start the next. Steps use checkbox (`- [x]`) syntax for tracking. **Do not commit or push at any point** (`.cursor/rules/11-no-commit-or-push.mdc`). The user reviews every change first.

**Goal:** Sea and air operations must carry their ground units to the landing. Today the briefing tells the commander to order the units an operation has just loaded, and the engine treats that order as the commander taking them out. Make the briefing stop asking for those orders, name the units an operation holds, and have the engine refuse any order on a unit aboard an operation's ship or air unit.

**Architecture:** One new module, `src/main/operations/operationForce.ts`. It answers two questions from the stored operations: which units an operation holds, and which operation is carrying a given unit. The order parser, the Active Operations section, the orderless table, the briefing counts, and the attention flags all read those answers. No operation phase rule changes.

**Tech stack:** TypeScript, `node:test`. There are no new dependencies.

## What the Logs Show

Evidence is from `debug.log` in the repo root, a v2.25.0 AI-only match played on 2026-11-14:

- Five sea operations loaded their units (`seaOperationAdvance advanceSeaOperation` with `"reason":"muster-loaded"`). All five ended on the next tick with `"reason":"transit-empty"`. None landed.
- In each case, the commander's reply between those two ticks gave every embarked unit a standing order (`openRouter processV3OrdersArray: assign_order`). That covers `a3-i3`, `a3-i2`, `a2-i1`, `a2-t1`, `a4-i4`, `a4-i5`, `a3-i13`, `a3-i6`, `a3-t3`, `a1-i11` and `a1-i5`. During transit a carried unit may hold no order (`ordersAssigned` in `src/main/operations/seaOperationAdvance.ts`), so each order released its unit and left the ships empty.
- The engine cancels a unit's order before loading it (`loadAndSail`). In `debug-last-user-prompt-1.txt`, the air operation's cargo `a1-i23` (aboard `a1-a2` in `opponent-op9`) is counted in "12 unit(s) have no standing order and may need orders this turn". It also has a row in the Units Without Standing Orders table. The consult then closes with "Give the units in the orderless table standing orders."
- Against those three pushes, the system prompt gives one general sentence ("Leave them alone and they carry on"). The Active Operations transit line counts the cargo but does not name it. Air operations use the same cargo assignment, so their cargo gets the same pushes.

## Decisions (made by the user; do not reopen)

| Question | Decision |
| --- | --- |
| A commander order on a unit aboard an operation's ship or air unit | Refused, whatever the action: `assign_order`, `cancel_order`, `explicit_move`, `disembark`, `embark`, and `transport_move` when its `unitId` is that unit. The next briefing says why. A unit the commander loaded outside an operation is unaffected. |
| Units left out of the "no standing order" count, the Units Without Standing Orders table, and the orderless attention | Every ground unit and ship in the seat's stored operations, in every phase. |
| How the briefing marks operation units | Every Active Operations bullet names its units and ships, including cargo at sea, followed by one sentence telling the commander to leave them alone. Unit Status tables keep their columns. |
| Other nudges | Operation units leave the "face a critical threat" count. Best Options rows and the legal-attack bullet keep them. |
| Aircraft | Air operations get every remedy above. Their cargo uses the same assignment table as ships. |

## Rules for the Implementing Agent

- Never commit or push.
- Give every new or changed function, field, and constant an orienting comment in the file's existing style (`Purpose / When to use / Expected outcome / Exceptions`). When you change behavior a comment describes, update that comment (`04-orienting-comments.mdc`).
- A new public function logs at `logDebug` or `logTrace`, matching its neighbours. An updated public function keeps its current log level and adds the new argument to that log (`02-backend-logging.mdc`).
- Never write "Phase", "Step", or any identifier from this plan in code, comments, or `doc/` (`12-no-plan-identifiers.mdc`).
- Functions take at most 6 arguments (`10-argument-limits.mdc`).
- `src/main/briefingFormatter.ts` is 964 lines and may not pass 1000 (`09-file-size-limits.mdc`). Count lines with `node -e "const fs=require('fs'); console.log(fs.readFileSync('src/main/briefingFormatter.ts','utf8').split(/\n/).length)"`. If the file would pass 999 lines, move `orderlessMissionCount` and `missionActionNeeded` into a new camelCase file under `src/main/` and leave the briefing behavior in place. Do not stop at 989 and report.
- Tests cover contracts only (`03-testing-standards.mdc`). Add exactly the tests each step lists. Run each new test **before** the change and confirm it fails. Then make the change and confirm it passes. If a new test passes before the change, stop and report: it is not testing the behavior.
- Text in quotation marks in this plan is final wording. If a test or a doc contract forces different wording, stop and report.
- The engine's own operation orders go through `applyOperationActions` (`src/main/operations/operationActions.ts`), not the order parser. Do not change `operationActions.ts` or any `*OperationAdvance.ts` file.
- Human player orders do not pass through `processV3OrdersArray`. Do not touch the human order path.
- Do not edit files under `.spec/completed/` or `doc/ai-commander-prompts/example-tactical-prompt.md`. Do not edit the historical documents that `AGENTS.md` lists.
- Update `doc/` in the phase that changes the behavior, as each step says.

## Test Commands

`FILE` is the compiled test named in the step:

```text
npm run build:main
node dist/main/FILE.test.js
```

`build:main` must succeed before a test result means anything. A TypeScript error counts as a failed step. Files under `src/main/` compile to `dist/main/` with the same relative path.

Tests that need a database use `withTempGameDb` from `src/main/testSupport/withTempGameDb.ts`. `src/main/gameActions/airDropResolution.test.ts` is the pattern: it inserts units with `insertUnitRow` and cargo with `INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)`. Store operations with `writeOperationsForSeat({ getOne: dbGetOne, run: dbRun }, seatId, operations)` from `src/main/gameDb/operationMemory.ts`.

---

## Phase 1: Who an Operation Holds

Add one place that answers both questions. Every later phase reads it.

### Step 1: Pure helpers

- [x] Create `src/main/operations/operationForce.ts`, with a file-level orienting comment that says it answers which units the seat's operations hold. Export:

  ```ts
  export interface OperationCargo {
    readonly operationId: string;
    readonly method: OperationMethod;
    readonly carrierId: string;
  }

  export function operationForceIds(operations: readonly Operation[]): ReadonlySet<string>;

  export function operationCarryingUnit(
    operations: readonly Operation[],
    unitId: string,
    carrierId: string | null,
  ): OperationCargo | null;
  ```

  Import `Operation` and `OperationMethod` from `src/shared/operationTypes.ts`.

  - `operationForceIds` returns every id in every operation's `unitIds` and `carrierIds`. An empty list returns an empty set.
  - `operationCarryingUnit` returns the first operation, in list order, whose `unitIds` contains `unitId` and whose `carrierIds` contains `carrierId`. It returns `null` when `carrierId` is `null` or nothing matches.

  Both are pure. Each logs at `logTrace`: the force helper logs how many operations it read and how many ids it returned, and the carrying helper logs the unit id, the carrier id, and whether it found an operation. Give `OperationCargo` and each of its fields an orienting comment. For `carrierId`, the comment says it is the ship or air unit the cargo is aboard.

- [x] Create `src/main/operations/operationForce.test.ts`:
  - `operationForceIds` over one sea operation (units `u1`, `u2`, ships `s1`) and one air operation (unit `u3`, carrier `a1`) returns exactly `{u1, u2, s1, u3, a1}`.
  - `operationCarryingUnit(ops, 'u1', 's1')` returns that sea operation's id, `'sea'`, and `'s1'`.
  - `operationCarryingUnit(ops, 'u3', 'a1')` returns the air operation with `'air'`.
  - `operationCarryingUnit(ops, 'u1', 'other-ship')` returns `null`. So does `operationCarryingUnit(ops, 'u9', 's1')`, and so does `operationCarryingUnit(ops, 'u1', null)`.

  Build the `Operation` objects with every required field of the type, copying field shapes from an existing test such as `src/main/operations/seaOperationAdvance.test.ts`.

### Step 2: Database lookups

- [x] In the same file, export one reader. Do not add `readOperationForceIds`. Later phases already hold the operation list and call `operationForceIds`.

  ```ts
  export function createOperationCargoLookup(seatId: string): (unitId: string) => OperationCargo | null;
  ```

  - `createOperationCargoLookup` logs at `logDebug` with the seat id and returns a function. On its first call that function reads the seat's operations with `readOperations({ getOne: dbGetOne }).get(seatId) ?? []` and keeps the list for later calls. Copy the read from `operationUnitIdsForSeat` in `src/main/gameDb/operationMemory.ts`. Each call gets the unit's carrier with `getEmbarkedNavalForLandUnit(unitId)` from `src/main/gameActions/sealift.ts` and returns `operationCarryingUnit(list, unitId, carrier)`. The returned function logs at `logTrace` with the unit id and whether cargo was found. A thrown operations read is logged with `logError` and the seat id, is not cached, and that call returns `null`, so the next row can try again. A thrown carrier read is logged with `logError` and returns `null` for that unit only. The order then goes through as it does today. The comment states that this fallback is deliberate. Reading once per reply keeps a reply with many rows to one operations read.

- [x] Tests in `operationForce.test.ts`, inside `withTempGameDb`:
  - Store one sea operation for `opponent` (units `u1`, `u2`, ship `s1`) and insert the cargo row `u1 → s1`. `createOperationCargoLookup('opponent')('u1')` returns `operationId` and `carrierId: 's1'`. The same lookup returns `null` for `u2`, which is not aboard.
  - Insert the cargo row `u5 → s1` for a unit that is not in the operation. The lookup returns `null` for `u5`.
  - `createOperationCargoLookup('opponent2')('u1')` returns `null`.

### Phase 1 verification

- [x] Run `npm run build:main`, then `operations/operationForce.test.js`. Expected: all pass.

---

## Phase 2: The Engine Refuses Orders on Operation Cargo

### Step 1: Refuse the row before it runs

`processV3OrdersArray` (`src/main/openRouter/envelopeOrderRows.ts`) runs `assign_order` and `cancel_order` the moment it reads them. It collects the other actions for later. The refusal must come before both.

- [x] Add a private helper in `envelopeOrderRows.ts`:

  ```ts
  const CARGO_REFUSED_ACTIONS: ReadonlySet<string> = new Set([
    'assign_order', 'cancel_order', 'explicit_move', 'disembark', 'embark', 'transport_move',
  ]);

  function operationCargoRefusal(cargo: OperationCargo, unitId: string): string
  ```

  It returns, for a sea operation:

  `` `operations order dropped: ${unitId} is aboard ${cargo.carrierId} in ${cargo.operationId} and takes no order. To take it out, give ${cargo.carrierId} a standing order of your own.` ``

  and for an air operation:

  `` `operations order dropped: ${unitId} is aboard ${cargo.carrierId} in ${cargo.operationId} and takes no order. To take it out, cancel ${cargo.operationId}.` ``

  The `operations ` prefix is required. `writeOperationRefusal` (`src/main/gameDb/operationMemory.ts`) keeps only reasons with that prefix, and the next briefing shows them under Active Operations as "Last turn: …".

- [x] In `processV3OrdersArray`:
  - After `result` is built and before the loop, add: `const cargoOf = context.mode === 'tactical' ? null : createOperationCargoLookup(coordinateContextSeatId(context));`
  - Inside the loop, after the `if (!unitId)` check and before the `assign_order` branch, add:

    ```ts
    if (cargoOf !== null && typeof action === 'string' && CARGO_REFUSED_ACTIONS.has(action)) {
      const cargo = cargoOf(unitId);
      if (cargo !== null) {
        dropRow(dropReasons, operationCargoRefusal(cargo, unitId));
        continue;
      }
    }
    ```

  - Update the function's orienting comment: in strategic mode, a row of those actions for a unit aboard one of the seat's operation ships or air units is dropped with a reason.

  Tactical mode is skipped because tactical rows use sub-unit ids and battle prompts have no operations. `transport_move` is refused only when `unitId` is the embarked unit. The parser moves `navalUnitId`. An order whose `unitId` is the ship or air unit still runs. Do not add a `writeOperationRefusal` test. The `operations ` prefix is the existing contract.

- [x] Tests: create `src/main/openRouter/envelopeOrderRowsOperationCargo.test.ts`. Use `withTempGameDb`, a snapshot from `getGameState()` after inserting the units, and the context `{ mode: 'strategic', seatId: 'opponent' }`. Copy the `latLngByH3` and `resolveToH3` set-up from `orderResponseParsing.test.ts`. Seed:
  - one sea operation for `opponent` holding infantry `u1` and ship `s1`, with the cargo row `u1 → s1`;
  - one air operation holding infantry `u3` and air unit `a1`, with `u3 → a1`.

  Cases:
  1. `assign_order` for `u1` with a march order. Expect one drop reason that starts with `operations order dropped: u1 is aboard s1 in`, `appliedStandingOrderCount` 0, and no `standing_orders` row for `u1`.
  2. `explicit_move` for `u1` to any valid hex code. Expect that reason, `movementOrders` empty, and the cargo row for `u1` still present.
  3. `disembark` for `u3`. Expect a reason that ends with `To take it out, cancel <the air operation id>.`, and the cargo row still present.
  4. Insert ship `s2` and infantry `u4` with the cargo row `u4 → s2`, with `u4` in no operation. `explicit_move` for `u4`: no reason starts with `operations order dropped`.
  5. The same row as case 1 with `{ mode: 'tactical', seatId: 'opponent' }`: no reason starts with `operations order dropped`.
  6. `cancel_order`, `embark`, and `transport_move` for `u1` each drop with the sea sentence, leave the `u1 → s1` cargo row, and add no standing order and no movement or embark order.

### Step 2: Docs

- [x] In `doc/hybrid-ai.md`, find the sea operation paragraph that ends "Those units stay embarked, and later advances do not unload them." (`rg -n "later advances do not unload them" doc/hybrid-ai.md`). After that sentence, add: "The engine refuses any order the commander gives to a unit aboard one of an operation's ships or air units, and says so in the next briefing. To take that unit out, the commander gives its ship a standing order, or cancels an air operation." Name `processV3OrdersArray` and `createOperationCargoLookup` as the source.

### Phase 2 verification

- [x] Run `npm run build:main`, then:
  - `openRouter/envelopeOrderRowsOperationCargo.test.js`
  - `openRouter/orderResponseParsing.test.js`
  - `operations/operationForce.test.js`

  Expected: all pass.

---

## Phase 3: Active Operations Names Every Unit

### Step 1: Name the cargo

The changes are in `src/main/openRouter/briefingSectionsOperations.ts`.

- [x] Replace the private `cargoAboard(state, operation): number` with `cargoAboardIds(state, operation): readonly string[]`. It returns the ids of the operation's `unitIds` whose `embarkedOnCarrierUnitId` is one of its `carrierIds`, in `unitIds` order. Update its comment.

- [x] In `operationBullet`, change the sea transit sentence:
  - With cargo: `` `- ${operation.id}: by sea to ${objective}, ${city}. At sea, heading for ${landing}, with ${cargo.length} ${noun(cargo.length, 'ground unit')} aboard: ${cargo.join(', ')}. Ships: ${ships}.` ``
  - With no cargo, keep the current sentence with `0 ground units aboard` and no list.

- [x] Change the sea return sentence. With cargo: `` `- ${operation.id}: turned back from ${objective}. Returning to ${muster} with ${cargo.join(', ')} aboard. Units: ${units}. Ships: ${ships}.` `` With no cargo: `` `- ${operation.id}: turned back from ${objective}. Returning to ${muster}. Units: ${units}. Ships: ${ships}.` `` Cargo ids stay in `unitIds` order.

- [x] The sea muster and assault sentences already name their units. The air muster, transit, and assault sentences already name the infantry and the air unit. Leave those. The air return bullet does not name anyone. Change it to `` `- ${operation.id}: by air, turned back from ${objective}. ${infantry} is with ${carrierId}.` ``

### Step 2: Tell the commander to leave them alone

- [x] In `buildOperationsSection`, when `ordered.length > 0`, append this paragraph after the bullets and before the options table:

  `Give the units and ships named in these operations no orders unless you mean to take them out. A standing order takes out a unit that is not aboard, or a ship. A unit aboard one of their ships or air units takes no order.`

  Do not add it when the only bullet is the campaign. Update the function's comment.

- [x] Tests in `src/main/openRouter/briefingSectionsOperations.test.ts`:
  - A sea transit with `u1` and `u2` both aboard `s1`: the bullet contains `with 2 ground units aboard: u1, u2.`
  - A sea transit with no cargo aboard still contains `with 0 ground units aboard. Ships:`.
  - A return phase with `u1` aboard contains `with u1 aboard.` and `Units:`.
  - A return phase with no cargo contains `Units:` and `Ships:`.
  - An air return names the infantry id and the air-unit id.
  - Any one stored operation: the section contains the new paragraph.
  - A campaign plan and no operation: the section does not contain it.

  Update existing expected strings that change because of the new paragraph, the cargo lists, the return unit names, or the air return sentence. Change no other expected text.

### Step 3: Docs

- [x] In `doc/ai-commander-prompts/strategic-prompt.md`, under the Active Operations entry, update the content bullets: a sea transit lists the cargo ids, a sea return names units and ships, and an air return names the infantry and the air unit. Add the exact closing sentence, and say it is omitted when the only bullet is the campaign.
- [x] In `doc/ai-commander-prompts/information-decision-model.md`, update the `ACTIVE_OPERATIONS` row the same way.
- [x] In `doc/ai-commander-prompts/example-strategic-prompt.md`, the only operation bullet is the muster line for `opponent-op38`, which already names its units. Insert the closing paragraph after that bullet and before `## Operation Options`. Do not invent a transit bullet.

### Phase 3 verification

- [x] Run `npm run build:main`, then `openRouter/briefingSectionsOperations.test.js`, `openRouter/promptContracts.test.js`, and `openRouter/promptSpec/variantConformance.test.js`. Expected: all pass.

---

## Phase 4: The Briefing Stops Asking for Their Orders

One set, the seat's operation force ids, removes operation units from every place that asks the commander to order an idle unit.

### Step 1: Build the set once and pass it on

- [x] In `src/main/openRouter/requestOrdersInjection.ts`:
  - After `activeOperations` is read (about line 291), add `const operationHeldUnitIds = operationForceIds(activeOperations);`. When `showOperations` is false the list is empty, so the set is too.
  - If the `getStandingOrderInjectionText(...)` call (about line 279) comes before that line, move it after.
  - Pass the set as a new fifth argument to `getStandingOrderInjectionText`.
  - Add `operationHeldUnitIds` to the returned injection object, with an orienting comment on its interface field: empty when orders are off or the mode is tactical.

- [x] In `src/main/openRouter/requestOrdersFlow.ts`, where `formatBriefing` gets its shared context (about line 292), add `operationHeldUnitIds: injection.operationHeldUnitIds`.

- [x] In `src/main/tools/standingOrdersInjectionText.ts`, give `getInjectionText` a fifth parameter, `operationHeldUnitIds?: ReadonlySet<string>`, with an inline orienting comment in the style of `campaignPlan`. The parameter stays optional. The function is re-exported from `src/main/tools/standingOrders.ts`; there is no second wrapper. Build `unitIdsWithoutOrders` without those ids. That removes them from the Units Without Standing Orders table and from `collectOrderlessMissionContext`. Add the set's size to the function's existing `logDebug`. Nothing between the current standing-order call and the return of `buildStatusInjectionTexts` reads `standingOrderText`, so moving that call to just after `activeOperations` is assigned is safe.

### Step 2: The briefing counts and attention

The changes are in `src/main/briefingFormatter.ts`. `buildAttentionFlags` already has five parameters. The sixth optional `held` argument is the last parameter that function may take.

- [x] Add `operationHeldUnitIds?: ReadonlySet<string>;` to `FormatBriefingSharedContext`, with an orienting comment: these are units an operation holds, and they are left out of the orderless count, the critical count, the threat and mission attention, and the orderless mission sets. Omitted is the same as empty.
- [x] In `formatBriefing`, set `const held = sharedContext?.operationHeldUnitIds ?? new Set<string>();`. Then:
  - Add `held` as a fourth argument of `buildStrategicNarrative`, with a default of an empty set. There, `noOrder` and `critical` skip assessments whose `unitId` is in `held`. `inContact` is unchanged.
  - In the `collectOrderlessMissionContext` call, the `orderlessUnitIds` filter also drops ids in `held`.
  - Add `held` as a sixth argument of `buildAttentionFlags`, with a default of an empty set. In its per-unit loop, right after the `armedUnitRefs.push(...)` block, add `if (held.has(a.unitId)) continue;` with the comment "An operation already orders this unit. It may still shoot, so it stays in the armed list." That continue also skips warning and receding bullets. Pass `held` to `orderlessMissionCount` and skip those ids there.
  - Update the comments of `buildStrategicNarrative`, `buildAttentionFlags`, and `orderlessMissionCount`.
- [x] Do not pass `held` to `buildUnitStatusTable`. Its rows keep their columns. An Action needed cell can change only because the orderless sets no longer name operation units.
- [x] Count the lines of `src/main/briefingFormatter.ts` with the `node` command in the rules above. Expected: at most 999. If it would pass 999, move `orderlessMissionCount` and `missionActionNeeded` out as that rule says.

### Step 3: Tests

- [x] In `src/main/briefingFormatter.test.ts`, build an assessment list with two orderless units, `u1` and `u2`, both facing a critical threat. Pass `operationHeldUnitIds: new Set(['u1'])`. Expect:
  - the narrative says `1 unit(s) have no standing order` and `1 unit(s) face a critical threat`;
  - the fixture has no legal shot. `buildAttentionFlags` with `held = {u1}` does not contain `u1`, and it still has `u2`'s threat bullet. Do not assert that every held id is absent from every briefing: a held unit that can shoot stays on the legal-attack bullet because the `continue` is after `armedUnitRefs.push`.

  Without the set, the same input says `2 unit(s)` for both. That shows the default is unchanged.

- [x] In `src/main/tools/standingOrdersInjectionMission.test.ts`, which already opens a database, add a case: a unit with no standing order, passed in `operationHeldUnitIds`, has no row in Units Without Standing Orders. A second orderless unit still has its row.

### Step 4: Docs

- [x] In `doc/ai-commander-prompts/strategic-prompt.md`:
  - The `### Units Without Standing Orders` entry: units held by an operation are not listed.
  - The narrative entry: they are left out of the no-order and critical-threat counts.
  - The Attention Flags entry: they get no threat or mission bullet, but may still appear in the legal-attack bullet.
- [x] In `doc/ai-commander-prompts/source-inventory.md`, next to the embarked-units row (about line 248), add a row: units held by an operation are left out of Units Without Standing Orders. Name `getInjectionText` and `operationForceIds`.
- [x] In `doc/ai-commander-prompts/information-decision-model.md`, add the same exclusion to the `ORDERLESS_UNITS` row.

### Phase 4 verification

- [x] Run `npm run build:main`, then:
  - `briefingFormatter.test.js`
  - `tools/standingOrdersInjectionMission.test.js`
  - `tools/standingOrders.test.js`
  - `openRouter/promptContracts.test.js`
  - `openRouter/promptSpec/variantConformance.test.js`

  Expected: all pass.

---

## Phase 5: The System Prompt Matches the Engine

### Step 1: Rule text

The change is in `buildOperationRuleBlock` (`src/main/openRouter/promptSpec/operationRuleText.ts`).

- [x] Replace the paragraph that starts `Units and ships in an operation already have their orders.` with: `Units and ships in an operation already have their orders. Leave them alone and they carry on, including on turns you are not consulted. To take out a unit that is not aboard, or a ship, give it any standing order of your own; it keeps that order and the operation goes on without it. A unit aboard one of an operation's ships or air units takes no order of its own: the engine refuses it and says so next turn. A standing order on a loaded ship takes that ship and the units aboard it out together. The operation does not unload those units. An air unit in an operation does not strike; cancel the operation to get it back.`
- [x] Replace the paragraph `A unit aboard a ship takes no order. An explicit_move or a disembark unloads it where the ship is.` with: `Outside an operation, a unit aboard a ship takes no standing order. An explicit_move or a disembark unloads it where the ship is.`
- [x] Update the function's orienting comment if it describes those paragraphs.

### Step 2: Tests and docs

- [x] Run `rg -n "A unit aboard a ship takes no order" src` and update every test assertion it finds to the new wording.
- [x] In `src/main/openRouter/promptSpec/coachingText.test.ts`, assert that the operation rule block contains `takes no order of its own` and `takes no standing order`.
- [x] In `doc/ai-commander-prompts/strategic-prompt.md`, replace the old paragraphs in the Active Operations model-use text, the `buildOperationRuleBlock` summary, and any system-prompt quotation. In `doc/ai-commander-prompts/example-strategic-prompt.md` (about line 206), replace the old paragraphs with the two new texts. In `doc/ai-commander-prompts/information-decision-model.md`, update the `OPERATION_RULES` row the same way.
- [x] Run `rg -n "A unit aboard a ship takes no order" doc src`. Expected: no hits outside `.spec`. Also expect no remaining `To take a unit or a ship out of an operation, give it any standing order of your own` outside `.spec`.

### Phase 5 verification

- [x] Run `npm run build:main`, then:
  - `openRouter/promptSpec/coachingText.test.js`
  - `openRouter/promptContracts.test.js`
  - `openRouter/promptSpec/variantConformance.test.js`

  Expected: all pass.

---

## Phase 6: Whole-Change Verification

- [x] Run `npm test`. Expected: it exits with code 0, with lint, naming check, and notices check passing.
- [x] Run `rg -n "Phase|Step [0-9]" src/main/operations/operationForce.ts src/main/openRouter/envelopeOrderRows.ts`. Expected: no new hits.
- [x] Run `git status`. Expected: changes only in the files this plan names, including `doc/ai-commander-prompts/information-decision-model.md`.
- [x] In the final summary, list the documents updated in `doc/`.

### The user's verification run

These checks need a live match. They are for the user. The agent lists them in the final summary and does not run them.

Play a 20-turn AI-only match on the global map with operations on. Then:

- [ ] Every `advanceSeaOperation` line with `"reason":"muster-loaded"` is followed, for the same id, by `transit-assault`, a landing, or a turn-back, not `transit-empty`. Expected: at least one sea operation reaches `"phase":"assault"` or an end with `"outcome":"completed"`.
- [ ] Search for `operations order dropped`. Each hit names a unit that was aboard an operation ship or air unit. Expect few or none: the briefing no longer asks for those orders.
- [ ] In one `debug-last-user-prompt-N.txt` with a transit operation, the Active Operations bullet lists the cargo ids. None of those ids appears in the Units Without Standing Orders table.

## Accepted Limits

- **Best Options and the legal-attack bullet still list operation units.** That is the user's decision, so the commander can still use them in an emergency. An air strike by an operation's air unit is already removed by `mergeOperationTurnOrders`.
- **The refusal fails open.** If the operations or cargo read throws, the order runs as it does today, and the error is logged.
- **Unit Status rows keep their Attention value**, apart from the orderless sets no longer naming operation units.

## Out of Scope

- Changing how a phase decides that a unit was released (`ordersAssigned`, `hasForeignOrder`).
- Air operation end reasons such as `carrier-missing`.
- The tactical prompt. Battles have no operations.
