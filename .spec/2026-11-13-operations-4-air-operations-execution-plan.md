# Operations 4 of 6, Air Operations and Named Objectives: Execution Plan

## Where This Plan Sits

| Order | File | What it delivers |
|-------|------|------------------|
| 0 | `2026-11-13-logistics-commander-execution-plan.md` | Goals, tools, production priorities, mercenaries, missiles |
| 1 | `2026-11-13-operations-1-lift-foundations-execution-plan.md` | Embarked units stay aboard; shared lift rules and terrain helpers |
| 2 | `2026-11-13-operations-2-sea-operations-execution-plan.md` | Stored operations; the engine runs sea landings end to end |
| 3 | `2026-11-13-operations-3-operation-menu-execution-plan.md` | The commander sees a menu and can launch and cancel |
| 4 | this file | Air landings; objectives the commander names itself |
| 5 | `2026-11-13-operations-5-land-campaign-execution-plan.md` | The land campaign shown and chosen as an operation |
| 6 | `2026-11-13-operations-6-posture-execution-plan.md` | A posture the commander declares, which shifts the engine's settings |

Plans 0 through 3 must be complete before this plan starts.

## Why This Change

Two things are still missing after plan 3.

Airlift has never been seen in a match. An air unit can carry one infantry unit between airports and drop it within strike range, including onto an enemy city. Used on an empty city, that takes production without a fight. Nothing proposes it, and each air unit has one action a turn that the coaching spends on strikes.

The commander can pick only from the engine's list. The user wants the commander to be able to name a larger or more distant objective and have the engine work out whether and how it can be done, and say why when it cannot.

## How an Air Operation Runs

One air unit and one infantry unit.

| Phase | What the engine does each turn | Leaves the phase when |
|-------|--------------------------------|-----------------------|
| `muster` | Marches the infantry to the air unit's airport. Puts the air unit on `hold_fire` so it stops striking. | Both are on the airport hex. The engine loads the infantry. |
| `transit` | When the air unit is not at the launch airport, orders a ferry to it. When it is, orders the drop onto the objective. | The infantry is no longer aboard. On the objective: `assault`. Anywhere else: the operation ends. |
| `assault` | Nothing. The infantry holds the city. | The seat controls the objective (done), the infantry is gone (lost), or the timeout passes. |

The air unit goes back to `defend` on its hex whenever the operation ends.

Ferries and drops are turn orders, not standing orders. The engine adds them to the seat's orders when the turn is resolved, consulted or not.

## Requirements

| Id | Requirement |
|----|-------------|
| R1 | `OperationMethod` gains `air`. A seat may run one air operation at a time, times the game-size multiplier, beside its sea operations. |
| R2 | The engine proposes an air operation only against a known enemy city that holds no enemy unit and no known fortification and lies within drop range of an airport the air unit can use. |
| R3 | The engine runs an air operation end to end, including on turns the commander is not consulted. |
| R4 | While an air unit is in an operation, its ferry or drop replaces any strike, ferry, or drop the commander or the tempo rule ordered for it that turn. |
| R5 | Air candidates appear in Operation Options and can be launched and cancelled like sea ones. |
| R6 | The commander may launch against an objective it names: `{"action":"launch","objective":"<hex code>","method":"sea"}` or `"air"`. The engine builds the operation if it can. |
| R7 | When a command is refused, the next briefing says which command and why. |
| R8 | A cancelled or failed air operation never leaves infantry aboard. |
| R9 | The tactical prompt and the tactical reply contract are unchanged. |
| R10 | Living docs match the builders in the same change. |

## Decisions Already Made

Do not reopen these.

- An air operation is one air unit and one infantry unit. Several drops are several operations.
- The infantry marches to the aircraft. The aircraft does not ferry to the infantry.
- An occupied or fortified city is never an air objective, whoever asks. One infantry unit dropped onto defenders is lost.
- A named sea objective may be defended. That is the commander's risk to take.
- The engine's order wins for an air unit in an operation. The commander takes the unit back with `cancel`, not by ordering a strike.
- Sea and air slots are separate. A full sea slot does not hide air options.
- The menu holds at most `OPERATION_MENU_SIZE` rows: sea first, with the last `OPERATION_MENU_AIR_ROWS` kept for air when air candidates exist.
- A refusal is stored as one note per seat and shown on the following turn only.

## Constants

| Name | File | Value | Status |
|------|------|-------|--------|
| `OPERATION_MAX_AIR_PER_SIZE` | `src/main/operations/operationRules.ts` | 1 | new |
| `OPERATION_MENU_AIR_ROWS` | same | 2 | new |
| `OPERATION_AIR_TRANSIT_TIMEOUT_TURNS` | same | 6 | new |
| `OPERATION_NOTES_CONFIG_KEY` | `src/main/gameDb/operationMemory.ts` | `'operation_notes'` | new |

Existing values used, never retyped: `AIR_STRIKE_RANGE_HEXES`, `AIRLIFT_INFANTRY_CAPACITY`, `OPERATION_MUSTER_MAX_LAND_STEPS`, `OPERATION_MUSTER_TIMEOUT_TURNS`, `OPERATION_ASSAULT_TIMEOUT_TURNS`, `GAME_SIZE_MULTIPLIER`.

## Rules for the Implementing Agent

Read these before Phase 1. They apply to every phase.

- Never commit or push.
- Source files under `src/` use CRLF line endings. Keep CRLF. `.spec` files may stay LF.
- Do not put plan words in code, comments, test names, or docs: no "Phase", "Step", "R1", "Operations 4", and so on. The game's own words `phase`, `muster`, `transit`, `assault`, and `return` are product terms and are allowed.
- Every new or changed function, constant, and interface field needs an orienting comment block with at least 5 non-empty lines: a summary line, then `Purpose:` (or `Contract:` on interface fields), `When to use:`, `Expected outcome:`, `Exceptions:`.
- Logging: every new exported function logs its call. Use `logDebug` when it changes state or makes a per-turn or per-consult decision, `logTrace` when it only reads and returns, and `logError` for every caught exception. Use the existing `../logger` import of each file.
- Documentation follows `AGENTS.md`. In the documentation phase, also read `doc/README.md`: add every new exported constant this plan introduces to the engine-constants section there, beside the campaign constants, naming its file. Search `doc/` for any sentence the change makes wrong. End your final summary with the list of documents you updated.
- Mark every new binding `const` and every new interface field `readonly`.
- No function takes more than 6 named arguments. Use one `args` object.
- No source file passes 600 lines. Air code goes in its own files beside the sea files.
- Tests cover happy paths and essential failure cases only. Never delete a content assertion. Never replace an assertion with `assert.ok(true)`.
- PowerShell does not support `&&`. Chain commands with `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`.
- When a step says "replace", replace exactly the quoted text. If it is not found, stop and report.
- When a step says "read first", open the named function before editing. If it does not do what this plan says, stop and report.
- Distances between hexes use `computeGridDistanceWithPathFallbackPure` or `isWithinGridRangePure`.
- Sort unit ids and hex ids with `<` on the strings.
- Numbers in prompt text come from the named constant or helper.

## Phase 1: Method, Dispatch, and Air Candidates

Goal: R1, R2. Nothing launches an air operation yet.

### Step 1: The method

- [ ] `src/shared/operationTypes.ts`: `export type OperationMethod = 'sea' | 'air';` and `OPERATION_METHODS` becomes `['sea', 'air']`.
- [ ] Add the three constants to `operationRules.ts`.
- [ ] Run `npm run build:main`. Every place that assumed `'sea'` now fails to compile or needs a branch. Fix only what the compiler names; the later steps cover the rest.

### Step 2: New file `src/main/operations/airOperationCandidates.ts`

- [ ] Function:

```ts
export function listAirOperationCandidates(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly landMass: LandMassByH3;
  readonly terrain: LiftTerrain;
  readonly active: readonly Operation[];
  readonly protectedUnitIds: ReadonlySet<string>;
  readonly onlyObjectiveH3?: string;
}): OperationCandidate[]
```

- [ ] Rules:
  1. `busy` as in the sea builder.
  2. Free air units: the seat's air units not in `busy`, carrying nothing, standing on a hex the seat controls whose `airportCount > 0`. Sorted by id. None: `[]`.
  3. Take the first free air unit for which an infantry unit and an objective both exist. Stop at the first.
  4. Infantry: the seat's infantry that are not embarked, not in `busy`, not in `protectedUnitIds`, and whose hex is in `getLandStepDistances({ originH3s: [airUnit.h3Index], hexSet, data: landMass, maxDepth: OPERATION_MUSTER_MAX_LAND_STEPS })`. Take the fewest steps, then the lowest id.
  5. Launch airports: the air unit's own hex, plus every hex returned by `findReachableAirportFerryDestinations` for that unit. Read `nearestFerryAirportCodes` in `src/main/openRouter/briefingSectionsAirOps.ts` first and build the request the same way.
  6. Cities: `rankLiftCities(listKnownEnemyCities(state, seatId))`. When `onlyObjectiveH3` is given, keep only that city. Keep a city when `terrain.enemyUnitsWithin(city, 0) === 0`, `knownFortifiedCount === 0`, `landUnitCanOccupyHex(city, landMass)`, and some launch airport is within `AIR_STRIKE_RANGE_HEXES` of it. The launch airport for a city is the air unit's own hex when that is in range, otherwise the in-range airport with the lowest id.
  7. One candidate per kept city, up to `OPERATION_MENU_AIR_ROWS`: `method: 'air'`, `musterH3` the air unit's hex, `landingH3` the launch airport, `unitIds: [infantry]`, `carrierIds: [airUnit]`, `etaTurns` the infantry's steps plus 1 for the drop plus 1 more when the launch airport is not the air unit's hex, `clear: true`, `defenders` and `reinforcers` computed as the sea builder does.
- [ ] Tests in `airOperationCandidates.test.ts`: an air unit on a controlled airport, an infantry unit two steps away, and an empty unfortified enemy city in range give one candidate with `landingH3` equal to `musterH3`; a city in range only of a second controlled airport gives `landingH3` that airport and one more turn; an occupied city and a fortified city are never listed; no infantry in reach gives `[]`; `onlyObjectiveH3` restricts the list.

### Step 3: Sea builder accepts a named objective

- [ ] `listSeaOperationCandidates` gains `readonly onlyObjectiveH3?: string`. When given, rule 10 of plan 2 tests only that city, clear or not, and the test limit does not apply.
- [ ] One test: a defended city named this way is returned with `clear: false`.

### Step 4: One list for both methods

In `src/main/operations/operationCandidates.ts`:

- [ ] `operationSlotsForState` becomes `operationSlotsForState(state, method)`: `OPERATION_MAX_SEA_PER_SIZE` or `OPERATION_MAX_AIR_PER_SIZE`, times the multiplier.
- [ ] `operationCandidatesForSeat` gains an optional `readonly only?: { readonly objectiveH3: string; readonly method: OperationMethod }`. It builds sea candidates when the active sea operations number fewer than the sea slots, and air candidates the same way. Without `only`, it returns the sea candidates cut to `OPERATION_MENU_SIZE - Math.min(OPERATION_MENU_AIR_ROWS, air.length)`, followed by the air candidates. With `only`, it builds for that method alone with `onlyObjectiveH3` and returns what it gets.
- [ ] Tests: three sea and two air candidates give three sea rows then two air rows; six sea and one air give four sea then one air; a full air slot gives sea rows only.

### Phase 1 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/airOperationCandidates.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/seaOperationCandidates.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationCandidates.test.js`

## Phase 2: The Air Advance Decision

Goal: R3, R8. New file `src/main/operations/airOperationAdvance.ts`. Pure.

### Step 1: Shared types

In `seaOperationAdvance.ts`:

- [ ] Add `| { readonly kind: 'holdFire'; readonly unitId: string }` to `OperationAction`.
- [ ] Add `readonly objectiveHasEnemyUnit: boolean;` to `OperationFacts`. `buildOperationFacts` sets it from `terrain.enemyUnitsWithin(objective, 0) > 0`.
- [ ] `applyOperationActions` handles `holdFire` with `executeStandingOrderActionForPlayer(seatId, 'assign_order', { unitId, order: { type: 'hold_fire' } }, ...)`.

### Step 2: `advanceAirOperation(operation, facts): OperationStep`

`infantry` is `unitIds[0]`. `carrier` is `carrierIds[0]`. "End" below means `next: null` with the named outcome and, when the carrier still exists, a `defend` action for it on its current hex.

- [ ] Any phase: carrier missing from `unitHexById`: end `lost`; when the infantry exists and is in `muster`, also a `cancelOrder` for it.
- [ ] `muster`:
  - Infantry missing: end `abandoned`.
  - Carrier not on the muster hex: `next: null`, `outcome: 'abandoned'`, with a `cancelOrder` for the infantry and no action for the carrier. The carrier's stored order is not a reason to end: an air unit normally holds a `defend` on its base when the operation starts, and the first `holdFire` action replaces it.
  - Infantry's stored order is present and is not a `march` or `defend` on the muster hex: `next: null`, `outcome: 'abandoned'`, `releasedIds: [infantry]`, and a `defend` for the carrier.
  - `facts.turnNumber - phaseTurn >= OPERATION_MUSTER_TIMEOUT_TURNS`: end `abandoned`, with a `cancelOrder` for the infantry.
  - Infantry on the muster hex: a `holdFire` for the carrier unless it already has one, a `cancelOrder` then an `embark` for the infantry; `phase: 'transit'`.
  - Otherwise: a `holdFire` for the carrier unless it already has one, and a `march` to the muster hex for the infantry unless it already has one.
- [ ] `transit`:
  - Infantry missing: end `lost`.
  - Infantry not carried by the carrier: on the objective hex, `phase: 'assault'` with a `defend` for the infantry there; anywhere else, end `abandoned`.
  - `!facts.objectiveIsEnemyCity && !facts.objectiveIsOwn`, or `facts.objectiveHasEnemyUnit`, or `facts.turnNumber - phaseTurn > OPERATION_AIR_TRANSIT_TIMEOUT_TURNS`: an `unload` for the infantry, a `defend` for it on the carrier's hex, and end `abandoned`.
  - Otherwise no action. The ferry or drop is a turn order, built in Phase 3.
- [ ] `assault`:
  - Infantry missing: end `lost`.
  - `facts.objectiveIsOwn`: end `completed`.
  - `facts.turnNumber - phaseTurn > OPERATION_ASSAULT_TIMEOUT_TURNS`: end `abandoned`.
  - Otherwise no action.
- [ ] `export function cancelAirOperation(operation, facts): OperationStep`: in `muster`, a `cancelOrder` for the infantry and end `abandoned`; in `transit`, an `unload` and a `defend` for the infantry on the carrier's hex and end `abandoned`; in `assault`, end `abandoned`.

### Step 3: Dispatch, new file `src/main/operations/operationAdvance.ts`

- [ ] `export function advanceOperation(operation, facts): OperationStep` calls `advanceSeaOperation` or `advanceAirOperation` by `operation.method`.
- [ ] `export function cancelOperation(operation, facts): OperationStep` calls `cancelSeaOperation(operation, facts)` or `cancelAirOperation(operation, facts)`.
- [ ] `operationTurnFlow.ts` and `operationCommands.ts` call these two instead of the sea functions. The engine's launch step is otherwise unchanged: it still takes the first `clear` candidate from `operationCandidatesForSeat`, which now returns both methods and already respects each method's slots.

### Step 4: Tests in `airOperationAdvance.test.ts`

One test per bullet of Step 2, plus: a carrier that holds `defend` on the muster hex at the first advance gets a `holdFire` action and the operation keeps running; and: `advanceOperation` routes an air operation to the air function and a sea operation to the sea function.

### Phase 2 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/airOperationAdvance.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/seaOperationAdvance.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationTurnFlow.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationCommands.test.js`

## Phase 3: Ferry and Drop Orders

Goal: R3, R4.

### Step 1: New file `src/main/operations/operationTurnOrders.ts`

- [ ] Function:

```ts
export function operationTurnOrders(seatId: string, state: GameStateSnapshot): {
  readonly ferryOrders: readonly FerryOrder[];
  readonly airDropOrders: readonly AirDropOrder[];
  readonly carrierIds: ReadonlySet<string>;
}
```

  - For each stored air operation of the seat in `transit` whose carrier exists and carries its infantry: when the carrier's hex is not `landingH3`, a ferry order for the carrier to `landingH3`; otherwise an air drop order for the carrier onto `objectiveH3`.
  - `carrierIds` holds the carrier of every stored air operation of the seat, in any phase.
  - Read `FerryOrder` in `src/shared/ipc/ordersTypes.ts` and `AirDropOrder` in `src/shared/ipc/airDropTypes.ts` first and use their field names.
  - On a thrown error, log with `logError` and return three empty values.
  - `logDebug('operationTurnOrders', { seatId, ferryCount, dropCount })` on every call that returns at least one order.
- [ ] `export function mergeOperationTurnOrders(base: OwnerTurnOrders, extra: ReturnType<typeof operationTurnOrders>): OwnerTurnOrders` returns `base` with every air strike, ferry, and air drop whose `unitId` is in `extra.carrierIds` removed, and `extra.ferryOrders` and `extra.airDropOrders` appended. Every other list is returned as it was. `base.airDropOrders` may be undefined; treat that as an empty list.

### Step 2: Merge when the turn is gathered

Read `gatherCommanderOrdersForReady` in `src/main/openRouter/commanderReadyGather.ts` first. It sets `orders.set(seatId, ...)` in three places.

- [ ] Directly before `return orders;`, add:

```ts
  for (const [seatId, seatOrders] of orders) {
    orders.set(
      seatId,
      mergeOperationTurnOrders(seatOrders, operationTurnOrders(seatId, args.getGameStateForPlayer(seatId)))
    );
  }
```

### Step 3: Tests

- [ ] New `operationTurnOrders.test.ts`: an air operation in `transit` with the carrier on the launch airport gives one drop; on another airport gives one ferry; in `muster` gives neither but lists the carrier. `mergeOperationTurnOrders` removes a strike for a carrier, keeps a strike for another air unit, and appends the drop.
- [ ] `commanderReadyGather.test.ts`: a seat with a stored air operation in `transit` ends with the drop order and without its tempo strike for that carrier.

### Phase 3 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationTurnOrders.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/commanderReadyGather.test.js`
- [ ] `npm run check:circular` reports no new cycle.

## Phase 4: Briefing Rows

Goal: R5.

In `src/main/openRouter/briefingSectionsOperations.ts`:

- [ ] `buildOperationsSection` bullets for an air operation:

| Phase | Bullet |
|-------|--------|
| `muster` | `- ${id}: by air to ${objective}, an enemy city with ${urban} city cells. ${infantry} is marching to ${muster} to board ${carrier}.` |
| `transit` | `- ${id}: by air to ${objective}, an enemy city with ${urban} city cells. ${infantry} is aboard ${carrier}, which ${step}.` |
| `assault` | `- ${id}: by air to ${objective}. ${infantry} has landed and holds it until control passes to you.` |

  `step` is `drops it this turn` when the carrier is on `landingH3`, otherwise `ferries to ${landing} this turn`.
- [ ] `buildOperationOptionsSection`: Method prints `candidate.method`. For an air candidate, Plan is `1 infantry unit musters at ${muster}; ${carrier} ${carries}; drops on ${objective}`, where `carries` is `carries it` when `landingH3 === musterH3`, otherwise `ferries it to ${landing}`. Cost is `1 of ${groundTotal} ground units, 1 of ${airTotal} air units, about ${etaTurns} turns`. Impact and Risk are unchanged.
- [ ] Tests in `briefingSectionsOperations.test.ts`: one per bullet and one air option row.

### Phase 4 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsOperations.test.js`

## Phase 5: Named Objectives and Refusal Notes

Goal: R6, R7.

### Step 1: The note store, in `src/main/gameDb/operationMemory.ts`

- [ ] `export interface OperationNote { readonly turn: number; readonly text: string }`.
- [ ] `readOperationNote(ops, seatId): OperationNote | null` and `writeOperationNote(ops, seatId, note: OperationNote | null)`, with the shared private reader and writer of plan 3. A stored value that is not `{ turn: integer, text: non-empty string }` reads as `null`.
- [ ] Clear `OPERATION_NOTES_CONFIG_KEY` where the other operation keys are cleared.

### Step 2: Parse

In `src/main/openRouter/operationCommandParsing.ts`:

- [ ] `OperationCommand` gains `| { readonly action: 'launch'; readonly objective: string; readonly method: OperationMethod }`.
- [ ] A `launch` entry with no `option` is accepted when `objective` is a string that, trimmed, matches `HEX_CODE_PATTERN` from `../briefing/map/coordinateContext`, and `method` is in `OPERATION_METHODS`. An entry with both `option` and `objective` uses `option`. The one-launch limit counts both forms together.
- [ ] The dropped-entry reason becomes `operations entry dropped: expected {"action":"launch","option":"<letter>"}, {"action":"launch","objective":"<hex code>","method":"sea"|"air"}, or {"action":"cancel","id":"<operation id>"}.`
- [ ] Tests: the new form parses; a bad hex code and an unknown method are dropped; the tactical parser still ignores the field.

### Step 3: Apply

In `src/main/operations/operationCommands.ts`:

- [ ] For a named launch: translate the code with `codeToH3(objective, { mode: 'strategic' })` from `../briefing/map/hexCodeTranslator` inside a `try`/`catch`. A throw gives `operations launch dropped: ${objective} is not a hex code on this map.`
- [ ] The hex is not in `listKnownEnemyCities(state, seatId)`: `operations launch dropped: ${objective} is not a known enemy city.`
- [ ] The method's slots are full: `operations launch dropped: you already have as many ${method} operations as you can run.`
- [ ] `candidates = operationCandidatesForSeat({ state, seatId, active, only: { objectiveH3, method } })`. Empty: `operations launch dropped: ${objective} cannot be reached by ${method} with the units you have free.` For `air`, when the city holds an enemy unit or a known fortification, use instead `operations launch dropped: ${objective} is defended, and an air drop needs an empty, unfortified city.`
- [ ] Otherwise launch `candidates[0]` as an option launch does.
- [ ] After every command is handled: when `dropReasons` is not empty, `writeOperationNote(..., { turn: state.turnNumber, text: dropReasons.join(' ') })`; otherwise `writeOperationNote(..., null)`.
- [ ] Tests in `operationCommands.test.ts`: a named sea launch against a defended reachable city stores an operation; each refusal above stores a note with its text; a reply with no refusal clears an old note.

### Step 4: Show the note

- [ ] `buildOperationsSection` gains an optional `readonly note?: string`. When it is not empty, the section starts, after the heading, with `- Last turn: ${note}` and a blank line. A note alone is enough to print the section.
- [ ] `requestOrdersInjection.ts`: read the seat's note and pass its text when `note.turn === args.state.turnNumber - 1`.
- [ ] Test: the note prints for the following turn and not for the turn after.

### Step 5: Contract and prompt text

- [ ] `promptSpec/envelopeJsonSchema.ts`: the `operations` item schema gains a third alternative: `action` const `launch`, `objective` a string, `method` an enum of `OPERATION_METHODS`.
- [ ] `promptContracts.ts`: in the `operations` paragraph, after the launch-by-letter sentence, add: `To launch against a city that is not listed, add {"action":"launch","objective":"<hex code>","method":"sea"} or "air"; the engine builds the operation if your free units can reach it, and the next briefing says why if they cannot.`
- [ ] `promptSpec/operationRuleText.ts`: the first paragraph becomes:

```text
The engine runs operations: several turns of orders that carry ground units to an enemy city by sea or by air. By sea, it musters units and ships at a port, loads them, sails to a landing beside the city, unloads, and marches onto it. By air, it marches one infantry unit to an air unit's airport, loads it, ferries to an airport in range when it must, and drops it onto a city that holds no enemy unit. The Active Operations section of the briefing lists each one and how far it has got.
```

  The paragraph about units already having their orders gains this sentence at its end: `An air unit in an operation does not strike; cancel the operation to get it back.` The commands paragraph gains, after the launch sentence: `You may also name a city that is not listed, with "objective" and "method" in place of "option".`
- [ ] Update `promptSpec/coachingText.test.ts`, `promptContracts.test.ts`, and `envelopeJsonSchema.test.ts` for the new text and the third schema alternative.

### Phase 5 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/gameDb/operationMemory.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/operationCommandParsing.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationCommands.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsOperations.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptContracts.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/envelopeJsonSchema.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/coachingText.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/variantConformance.test.js`

## Phase 6: Documentation and Final Verification

- [ ] `doc/hybrid-ai.md`: air operations, the turn-order merge, named objectives, and refusal notes, in the Operations section.
- [ ] `doc/ai-commander-prompts/strategic-prompt.md`, `assembly-contract.md`, `information-decision-model.md`, `variants.md`, `source-inventory.md`, `crosswalk.md`: the air rows, the third command form, and the note line.
- [ ] `doc/ai-commander-prompts/example-strategic-prompt.md`: one air row in Operation Options.
- [ ] `doc/combat-rules-v3.md`: in the airlift section, one paragraph that an AI seat's air operation supplies its own ferry and drop orders and replaces other air orders for that unit.
- [ ] `node scripts/check-doc-links.cjs` passes.
- [ ] `npm test` passes. `npm run check:circular` reports no new cycle.
- [ ] `rg -n "Phase [0-9]|Step [0-9]|\bR[0-9]+\b" src doc` shows no hit introduced by this change.
- [ ] No file touched here crossed 600 lines that was under it before, and none is over 1000.

## Phase 7: Verification Run

This phase is for the user, not the implementing agent. The agent stops after the previous phase and reports. The run needs the game window and a model key.

- [ ] Set `AGENT_WARS_LOG_LEVEL=debug` and `AGENT_WARS_LOG_FULL_PROMPTS=1`. Run 40 turns on the global map, no fog, no tactical battles, balanced doctrine. Repeat on one regional map.
- [ ] From `debug.log`, per seat: the phase sequence of every air operation; the `ferryCount` and `dropCount` totals from the `operationTurnOrders` lines; the number of named launches and the text of each refusal. The `orders applied` line does not count these ferries and drops, because the engine adds them after it.
- [ ] Pass when at least one air operation ends `completed` on either map and no air operation ends with infantry still aboard.
- [ ] Report the sequences, counts, and refusal texts whether or not the run passes.

## Out of Scope

- More than one infantry unit per air operation, and armor by air. The game's capacity is one infantry unit.
- An air unit ferrying to collect infantry.
- A named objective reached by land. Plan 5.
- Any change to the game's interface.
