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

The air unit goes back to `defend` on its current hex whenever the operation ends, including a cancel, a timeout, and a muster that ends because the air unit left the airport. A branch that ends the operation does not leave the air unit on `hold_fire`.

When the infantry is already on the objective and the seat already controls it, the operation ends `completed` instead of spending an assault turn. `resolveStrategicControlAfterCombatAndMovement` gives an empty unfortified hex to the unit standing on it at the end of the Ready that dropped the infantry, and that Ready finishes before the next operation tick.

Ferries and drops are turn orders, not standing orders. The engine adds them to the seat's orders when the turn is resolved, consulted or not. One ferry order uses `destinationH3Index` and may hop several of the seat's airports in that turn. The drop uses `targetH3Index` and is ordered only once the air unit is already at `landingH3`. A drop the resolver rejects leaves the infantry aboard; the next tick tries again, and the transit timeout unloads it.

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
- A refusal is stored as one note per seat and shown on the following turn only. The note row is cleared with the offer and the event: a new match deletes the key, a knockout clears that seat, and a seat that has left loses its note even when it stored no operation. Do not bump `EXPECTED_USER_VERSION`. A missing row reads as no note.
- An air row is always `clear`. It starts the one-turn window, and the engine may launch it on a later turn, including when every sea row is defended. Sea rows stay first, so a clear sea row is launched before an air row. A defended sea row is never launched. One launch per tick still applies.
- Air phase timeouts use the same comparison as sea: `facts.turnNumber - phaseTurn >=` the named constant. On the launch tick the difference is `0`.
- The reply schema stays one closed object of optional strings. `objective` and `method` are added beside `action`, `option`, and `id`. There is no `anyOf`, no `const`, and no enum. A bad method is a drop reason and does not fail the consult. The repair example stays a letter launch.
- Candidate search counts enemy units from `listUnitsForSnapshot()`, the same unmasked list `advanceOperationsForSeat` already uses. A defender hidden from the seat still blocks an air city and still keeps a sea city from counting as clear. Which cities are "known" stays on the caller's snapshot.

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
- [ ] Run `npm run build:main`. Do not expect it to fail. The sea filters are `method === 'sea'` comparisons, and a literal `method: 'sea'` stays valid. `operationMemory.ts` accepts a stored method only when it is listed in `OPERATION_METHODS`, so an air row can round-trip after this step. Leave those filters for the later steps. Fix a compiler error only when it names a call that must keep asking for sea.

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
  5. Launch airports: the air unit's own hex when the seat controls it and `airportCount > 0`, plus every hex `findReachableAirportFerryDestinations` returns. Read `findReachableAirportFerryDestinations` in `src/shared/airportFerryRoute.ts` first. Pass only hexes the seat controls with `airportCount > 0`, each node `owner` set to the seat, `intact: true`, and `neutralBorder` from the same border check the ferry route uses. Do not pass an enemy airport with the seat's owner. The finder already drops a neutral-border hop. The unit's own controlled airport remains a launch airport.
  6. Cities: `rankLiftCities(listKnownEnemyCities(state, seatId))`. When `onlyObjectiveH3` is given, keep only that city and do not stop at `OPERATION_MENU_AIR_ROWS` before testing it. Keep a city when it is not the air unit's hex, `terrain.enemyUnitsWithin(city, 0) === 0`, `knownFortifiedCount === 0`, `landUnitCanOccupyHex(city, landMass)`, and some launch airport is within `AIR_STRIKE_RANGE_HEXES` of it. `validateAirDropOrder` rejects a drop onto the air unit's own hex, so that city is not an objective. The launch airport for a city is the air unit's own hex when that is in range, otherwise the in-range airport with the lowest id. Measure the range with `isWithinGridRangePure`.
  7. One candidate per kept city, up to `OPERATION_MENU_AIR_ROWS`: `method: 'air'`, `musterH3` the air unit's hex, `landingH3` the launch airport, `unitIds` the one infantry id, `carrierIds: [airUnit]`, `etaTurns` the infantry's steps plus 1 for the drop plus 1 more when the launch airport is not the air unit's hex, `clear: true`, `defenders` and `reinforcers` computed as the sea builder does. `unitIds.length` must not exceed `AIRLIFT_INFANTRY_CAPACITY`. One menu names one aircraft. A larger match may run more than one air operation, and the next aircraft is offered after the first is busy.
- [ ] Tests in `airOperationCandidates.test.ts`: an air unit on a controlled airport, an infantry unit two steps away, and an empty unfortified enemy city in range give one candidate with `landingH3` equal to `musterH3`; a city in range only of a second controlled airport gives `landingH3` that airport and one more turn; an occupied city and a fortified city are never listed; no infantry in reach gives `[]`; `onlyObjectiveH3` restricts the list.

### Step 3: Sea builder accepts a named objective

- [ ] `listSeaOperationCandidates` gains `readonly onlyObjectiveH3?: string`. When given, the city loop tests only that city, clear or not. It does not stop for `OPERATION_OBJECTIVE_TEST_LIMIT` or `OPERATION_MENU_SIZE`. It still requires a free ship, the ground-unit minimum, a reachable port, and a sail landing. No landing returns `[]`. A defended city with a landing is returned with `clear: false`.
- [ ] One test: a defended city named this way is returned with `clear: false`. One test: a named city with no sail landing returns `[]`.

### Step 4: One list for both methods

In `src/main/operations/operationCandidates.ts`:

- [ ] `operationSlotsForState` becomes `operationSlotsForState(state, method)`. Its callers are this file and `operationTurnFlow.ts`. Sea keeps `OPERATION_MAX_SEA_PER_SIZE` times the multiplier. Air uses `OPERATION_MAX_AIR_PER_SIZE` the same way. Until phase 2 replaces the launch loop, `operationTurnFlow.ts` passes `'sea'`.
- [ ] `operationCandidatesForSeat` gains an optional `readonly only?: { readonly objectiveH3: string; readonly method: OperationMethod }`. Inside the existing `try`, copy the snapshot with `units` replaced by `listUnitsForSnapshot()` and pass that copy to `buildLiftTerrain` and to both candidate builders. Keep the caller's snapshot for `listKnownEnemyCities`. Do not return before the air search just because the sea slots are full. Build sea candidates when the active sea operations number fewer than the sea slots, and air candidates the same way. Pass every active operation into the sea builder, as it does now, so a unit in an air operation stays busy. Without `only`, return the sea candidates cut to `OPERATION_MENU_SIZE - Math.min(OPERATION_MENU_AIR_ROWS, air.length)`, then the air candidates. With `only`, build that method alone with `onlyObjectiveH3` and return what it gets, or `[]` when that method's slots are full.
- [ ] Tests: three sea and two air candidates give three sea rows then two air rows; six sea and one air give four sea then one air; five sea and two air give three sea then two air; no sea and two air give the two air rows; a full air slot gives sea rows only; a full sea slot with an air candidate still returns that air row. The existing "full sea slots give no candidates" assertion stays for its fixture, which has no air unit. The land-mass early return in `advanceOperationsForSeat` stays where it is.

### Phase 1 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/airOperationCandidates.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/seaOperationCandidates.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationCandidates.test.js`

## Phase 2: The Air Advance Decision

Goal: R3, R8. New file `src/main/operations/airOperationAdvance.ts`. Pure.

### Step 1: Shared types

In `seaOperationAdvance.ts`:

- [ ] Add `| { readonly kind: 'holdFire'; readonly unitId: string }` to `OperationAction`.
- [ ] Add `readonly objectiveHasEnemyUnit: boolean;` to `OperationFacts`. `buildOperationFacts` sets it from `terrain.enemyUnitsWithin(objective, 0) > 0`, using the unmasked terrain the sea advance already builds.
- [ ] `applyOne` handles `holdFire` through the existing `applyStandingOrder` helper: `assign_order` with `{ unitId, order: { type: 'hold_fire' } }`. `hold_fire` is already a legal order for an air unit. Do not add a second call shape.
- [ ] `seaOperationAdvance.ts` is already past the 600-line target and under 1000. Add only this action member and this fact field. The air decision stays in the new file.

### Step 2: `advanceAirOperation(operation, facts): OperationStep`

`infantry` is `unitIds[0]`. `carrier` is `carrierIds[0]`. "End" below means `next: null` with the named outcome and, when the carrier still exists, a `defend` action for it on its current hex.

- [ ] Any phase: carrier missing from `unitHexById`: end `lost`. When the infantry exists and the phase is `muster`, also a `cancelOrder` for it. Do not invent an unload for a destroyed carrier. Cargo lost with the air unit is already removed by the airlift loss rule.
- [ ] `muster`:
  - Infantry missing: end `abandoned`.
  - Carrier not on the muster hex: end `abandoned`, with a `cancelOrder` for the infantry when it exists and is not aboard. A carrier that still holds `defend` on the muster hex is the normal first tick, not this branch. The first `holdFire` replaces that `defend`.
  - Infantry's stored order is present and is not a `march` or `defend` on the muster hex: `next: null`, `outcome: 'abandoned'`, `releasedIds: [infantry]`, and a `defend` for the carrier.
  - `facts.turnNumber - phaseTurn >= OPERATION_MUSTER_TIMEOUT_TURNS`: end `abandoned`, with a `cancelOrder` for the infantry when it is not aboard.
  - Infantry on the muster hex: a `holdFire` for the carrier unless it already has one, a `cancelOrder` then an `embark` for the infantry. Embark uses the existing action, whose `carrierId` may be an air unit; `applyEmbarkOrdersForPlayer` already accepts that when both units share the hex. `phase: 'transit'`.
  - Otherwise: a `holdFire` for the carrier unless it already has one, and a `march` to the muster hex for the infantry unless it already has one.
- [ ] `transit`:
  - Infantry missing: end `lost`.
  - Infantry not carried by the carrier. On the objective hex, when `objectiveIsOwn` is already true, end `completed`. On the objective hex otherwise, `phase: 'assault'` with a `defend` for the infantry there. The carrier stays on `hold_fire` through the assault; entering assault is not an end. Anywhere else, end `abandoned` and `defend` the infantry on its hex.
  - While the infantry is still aboard: `!facts.objectiveIsEnemyCity && !facts.objectiveIsOwn`, or `facts.objectiveHasEnemyUnit`, or `facts.turnNumber - phaseTurn >= OPERATION_AIR_TRANSIT_TIMEOUT_TURNS` unloads the infantry, `defend`s it on the carrier's hex, and ends `abandoned`. Do not take this branch after the infantry has already left the carrier.
  - Otherwise no action. The ferry or drop is a turn order, built in Phase 3.
- [ ] `assault`:
  - Infantry missing: end `lost`.
  - `facts.objectiveIsOwn`: end `completed`.
  - `facts.turnNumber - phaseTurn >= OPERATION_ASSAULT_TIMEOUT_TURNS`: end `abandoned`. The infantry keeps the `defend` it was given on the way in.
  - Otherwise no action. The carrier stays on `hold_fire` until the operation ends.
- [ ] `export function cancelAirOperation(operation, facts): OperationStep`. `muster`: `cancelOrder` the infantry when it exists and is not aboard, and end `abandoned`. `transit`: when the carrier exists, unload the infantry when it is still aboard, `defend` it on the carrier's hex, and end `abandoned`; when the carrier is missing, end `lost` and do not invent an unload. `assault`: leave the infantry's `defend` in place and end `abandoned`. `return`: no actions, and the operation stays, with reason `already returning`. Air has no return phase; this arm keeps a bad stored phase from deleting the row.

### Step 3: Dispatch, new file `src/main/operations/operationAdvance.ts`

- [ ] `export function advanceOperation(operation, facts): OperationStep` calls `advanceSeaOperation` or `advanceAirOperation` by `operation.method`.
- [ ] `export function cancelOperation(operation, facts): OperationStep` calls `cancelSeaOperation(operation, facts)` or `cancelAirOperation(operation, facts)`.
- [ ] `operationTurnFlow.ts` and `operationCommands.ts` call these two instead of the sea functions. `resolveLaunch` in `operationCommands.ts` currently stores `method: 'sea'`, `landingH3: null`, and calls `advanceSeaOperation`. Copy `candidate.method`. For `air`, store `candidate.landingH3`. For `sea`, keep `landingH3: null`, because the sea advance still chooses the landing. Call `advanceOperation` for the first step.
- [ ] Replace the launch loop in `advanceOperationsForSeat`. Today, when `seaRunning() >= operationSlotsForState(state)`, the loop is skipped and the offer is set to `EMPTY_OPERATION_OFFER`. Left that way, a full sea slot hides every air row and clears an air window. Do not clear the offer only because the sea slots are full. Call `operationCandidatesForSeat` while either method has a free slot. The stored launch copies `candidate.method`, uses `candidate.landingH3` for air and `null` for sea, and calls `advanceOperation`. `decideOperationOffer` still launches at most one row, and only when `clearOfferTurn` is set and earlier than this turn. After that launch it nulls `clearOfferTurn`, so the next call only opens a window. Sea rows stay ahead of air rows.
- [ ] One command test: a passed air candidate launched by its letter stores `method: 'air'` and that candidate's `landingH3`. The existing sea letter tests still store `method: 'sea'` and `landingH3: null`.

### Step 4: Tests in `airOperationAdvance.test.ts`

Essential cases only. A carrier that holds `defend` on the muster hex at the first advance gets a `holdFire` and the operation keeps running, and the infantry gets a `march` when it is elsewhere. Infantry already on the airport embarks and the phase becomes `transit`. The carrier leaving the airport ends `abandoned`, `defend`s the carrier, and `cancelOrder`s the infantry. Transit with the infantry still aboard and the city still a legal objective returns no action. Infantry on the objective ends `completed` when `objectiveIsOwn`, and otherwise enters `assault` with a `defend` for the infantry and no `defend` for the carrier. A transit timeout unloads, `defend`s both, and ends `abandoned`. An assault the seat already owns ends `completed` and `defend`s the carrier. An assault timeout ends `abandoned`, leaves the infantry's `defend`, and `defend`s the carrier. Cancel from `muster` and from `transit` leaves nobody aboard and `defend`s the carrier. A missing carrier ends `lost` with no unload. `advanceOperation` routes air to the air function and sea to the sea function.

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

  - Read the seat's operations with `readOperations`. They are not on the snapshot. For each stored air operation in `transit` whose carrier exists on the snapshot and carries its infantry: when the carrier's hex is not `landingH3`, one `FerryOrder` whose `destinationH3Index` is `landingH3`; otherwise one `AirDropOrder` whose `targetH3Index` is `objectiveH3`. Do not emit both on the same turn.
  - `carrierIds` holds the carrier of every stored air operation of the seat, in any phase.
  - Read `FerryOrder` in `src/shared/ipc/ordersTypes.ts` and `AirDropOrder` in `src/shared/ipc/airDropTypes.ts` first and use their field names.
  - On a thrown error, log with `logError` and return three empty values.
  - `logDebug` the seat, the ferry count, and the drop count on every call, including a call that returns nothing.
- [ ] `export function mergeOperationTurnOrders(base: OwnerTurnOrders, extra: ReturnType<typeof operationTurnOrders>): OwnerTurnOrders` returns `base` with every `airStrikeOrders`, `ferryOrders`, and `airDropOrders` entry whose `unitId` is in `extra.carrierIds` removed, then appends `extra.ferryOrders` and `extra.airDropOrders`. Those are the field names on `OwnerTurnOrders` in `src/main/gameActions/ownerTurnOrders.ts`. Every other list is returned as it was. `base.airDropOrders` may be undefined; treat that as an empty list. Log the call.

### Step 2: Merge when the turn is gathered

Read `gatherCommanderOrdersForReady` in `src/main/openRouter/commanderReadyGather.ts` first. It sets `orders` in three places and then returns that map. Tempo strikes are already inside a stored plan and inside the unconsulted builder, on `airStrikeOrders`. Stripping at this one return covers both. Do not also strip inside `applyParsedRequestOrders`.

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
- [ ] `npm run check:circular` reports no new cycle. It already exits 1 for four cycles that do not involve the operation modules. Fail this step only when the report names a new cycle. `operationTurnOrders.ts` imports the memory reader and the order types. It does not import `commanderReadyGather`, `requestOrdersFlow`, or `operationTurnFlow`.

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
- [ ] `buildOperationOptionsSection`: a sea candidate keeps the plan and cost sentences it has now. Method already prints `candidate.method`. For an air candidate, Plan is `1 infantry unit musters at ${muster}; ${carrier} ${carries}; drops on ${objective}`, where `carries` is `carries it` when `landingH3 === musterH3`, otherwise `ferries it to ${landing}`. Cost uses the existing `ofTotal` helper: one ground unit out of `groundTotal`, and one air unit out of `airTotal`, then `about ${etaTurns} turns`. `airTotal` counts the seat's `unitType === 'air'` units. When the count and the total are both 1, `ofTotal` returns `1 air unit`, not `1 of 1 air units`. Impact and Risk are unchanged.
- [ ] Tests in `briefingSectionsOperations.test.ts`: one per bullet and one air option row.

### Phase 4 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsOperations.test.js`

## Phase 5: Named Objectives and Refusal Notes

Goal: R6, R7.

### Step 1: The note store, in `src/main/gameDb/operationMemory.ts`

- [ ] `export interface OperationNote { readonly turn: number; readonly text: string }`.
- [ ] `readOperationNote(ops, seatId): OperationNote | null` and `writeOperationNote(ops, seatId, note: OperationNote | null)`, with the shared private reader and writer of plan 3. A stored value that is not `{ turn: integer, text: non-empty string }` reads as `null`.
- [ ] Clear the note where the other operation keys are cleared. `resetGame.ts` deletes the key beside `OPERATIONS_CONFIG_KEY`. `knockoutConsequences.ts` clears that seat only, and does not delete the shared row. `operationMemorySeatIds` adds the note map to the union it already builds from operations, offers, and events, so `advanceOperationsAfterTurn` clears a seat that left with only a note. `writeOperationsForSeat([], seat)` already returns without inventing an operations row when the seat is absent.
- [ ] One memory test: a note round-trips, a malformed value reads as null, and clearing the seat leaves the other seats.

### Step 2: Parse

In `src/main/openRouter/operationCommandParsing.ts`:

- [ ] `OperationCommand` gains `| { readonly action: 'launch'; readonly objective: string; readonly method: OperationMethod }`.
- [ ] A `launch` entry with no `option` is accepted when `objective` is a string that, trimmed and uppercased, matches `HEX_CODE_PATTERN` from `../briefing/map/coordinateContext` (`/^[A-Z0-9]{2}$/`), and `method` is in `OPERATION_METHODS`. Store the uppercased code. An entry with both `option` and `objective` uses `option`. The one-launch limit counts both forms together. A bad code or a bad method is that entry's drop reason, not a second-launch reason, and it does not fail the consult.
- [ ] The dropped-entry reason becomes `operations entry dropped: expected {"action":"launch","option":"<letter>"}, {"action":"launch","objective":"<hex code>","method":"sea"|"air"}, or {"action":"cancel","id":"<operation id>"}.`
- [ ] Tests: the new form parses; a bad hex code and an unknown method are dropped; the tactical parser still ignores the field.

### Step 3: Apply

In `src/main/operations/operationCommands.ts`:

- [ ] For a named launch: translate the code with `codeToH3(objective, { mode: 'strategic' })` from `../briefing/map/hexCodeTranslator` inside a `try`/`catch`. `codeToH3` throws on a bad or unknown code and logs that throw itself. The catch adds `operations launch dropped: ${objective} is not a hex code on this map.` Expect that translator log in the test.
- [ ] The hex is not in `listKnownEnemyCities(state, seatId)`: `operations launch dropped: ${objective} is not a known enemy city.`
- [ ] The method's slots are full: `operations launch dropped: you already have as many ${method} operations as you can run.`
- [ ] For `air`, before the candidate search, when the unmasked terrain reports an enemy unit on the hex or `knownFortifiedCount` is greater than 0: `operations launch dropped: ${objective} is defended, and an air drop needs an empty, unfortified city.` Use the same unmasked unit list as `operationCandidatesForSeat`. A sea city may be defended.
- [ ] `candidates = operationCandidatesForSeat({ state, seatId, active, only: { objectiveH3, method } })`. Empty: `operations launch dropped: ${objective} cannot be reached by ${method} with the units you have free.`
- [ ] Otherwise launch `candidates[0]` through the same builder as a letter launch. Do not copy a literal `method: 'sea'` or a literal `landingH3: null`.
- [ ] Add `writeOperationRefusal(ops, seatId, turn, reasons)` in `operationMemory.ts`. It keeps the reasons that start with `operations `, joins them into one note for `turn`, and clears the note when none remain. `applyOperationCommands` does not call it. A malformed entry never becomes a command, and `applyParsedRequestOrders` calls apply only when `parsed.operationCommands` is set, so the note has to be written from the combined list. Call `writeOperationRefusal` once from `requestOrdersApplyParsed.ts`, after the operation block, on a strategic apply with orders enabled, passing the drop reasons collected so far. A tactical apply does not call it. A consult that never applies leaves the previous note; the following-turn check still shows a note only once.
- [ ] Tests in `operationCommands.test.ts`: a named sea launch against a defended reachable city stores an operation with `method: 'sea'`; a named air launch against an empty reachable city stores `method: 'air'` and the candidate's `landingH3`; each refusal above is the drop reason named in this step. One memory test: `writeOperationRefusal` stores those reasons and a call with none clears the note. One parse test: a bad entry and no command still produces a drop reason that starts with `operations `.

### Step 4: Show the note

- [ ] `buildOperationsSection` gains an optional `readonly note?: string`. When it is not empty, the section starts, after the heading, with `- Last turn: ${note}` and a blank line. A note alone is enough to print the section.
- [ ] `requestOrdersInjection.ts`: read the seat's note and pass its text when `note.turn === args.state.turnNumber - 1`.
- [ ] Test: the note prints for the following turn and not for the turn after.

### Step 5: Contract and prompt text

- [ ] `promptSpec/envelopeJsonSchema.ts`: keep the one closed object for an `operations` item. Add `objective` and `method` as optional strings beside `action`, `option`, and `id`, with nothing required. Do not add `anyOf`, `const`, or an enum. A sibling `anyOf` is ignored by Gemini, and a method enum would reject the consult instead of becoming a drop reason. The repair example stays `operations: [{ action: 'launch', option: 'A' }]`. Do not add `objective` or `campaignTarget` to it.
- [ ] `promptContracts.ts`: in the `operations` paragraph, after the launch-by-letter sentence, add: `To launch against a city that is not listed, add {"action":"launch","objective":"<hex code>","method":"sea"} or "air"; the engine builds the operation if your free units can reach it, and the next briefing says why if they cannot.`
- [ ] `promptSpec/operationRuleText.ts`: the first paragraph becomes:

```text
The engine runs operations: several turns of orders that carry ground units to an enemy city by sea or by air. By sea, it musters units and ships at a port, loads them, sails to a landing beside the city, unloads, and marches onto it. By air, it marches one infantry unit to an air unit's airport, loads it, ferries to an airport in range when it must, and drops it onto a city that holds no enemy unit. The Active Operations section of the briefing lists each one and how far it has got.
```

  The paragraph about units already having their orders gains this sentence at its end: `An air unit in an operation does not strike; cancel the operation to get it back.` The commands paragraph gains, after the launch sentence: `You may also name a city that is not listed, with "objective" and "method" in place of "option".`
- [ ] Update `promptSpec/coachingText.test.ts`, `promptContracts.test.ts`, and `envelopeJsonSchema.test.ts` for the new text. The schema test expects the same closed object with the two new optional strings, not a third alternative.

### Phase 5 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/gameDb/operationMemory.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/operationCommandParsing.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationCommands.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsOperations.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptContracts.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/envelopeJsonSchema.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/coachingText.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/variantConformance.test.js`

## Phase 6: Documentation and Final Verification

- [ ] `doc/hybrid-ai.md`: air operations, the turn-order merge, named objectives, and refusal notes, in the Operations section. Say that an air row counts as clear for the one-turn window, and that a full sea slot does not clear the offer while an air row remains.
- [ ] `doc/README.md`: add `OPERATION_MAX_AIR_PER_SIZE`, `OPERATION_MENU_AIR_ROWS`, `OPERATION_AIR_TRANSIT_TIMEOUT_TURNS`, and `OPERATION_NOTES_CONFIG_KEY` to the engine-constants section, beside the operation constants already listed, each with its file.
- [ ] `doc/save-files.md`: `operation_notes` stays in the file, is not a machine-local key, and a missing row reads as no note (`readOperationNote`). The version stays 26.
- [ ] `doc/ai-commander-prompts/strategic-prompt.md`, `assembly-contract.md`, `information-decision-model.md`, `variants.md`, `source-inventory.md`, `crosswalk.md`: the air rows, the named command form, and the note line. `information-decision-model.md` job 8 and the `OPERATION_OPTIONS` and `OPERATION_RULES` rows currently say the menu is sea landings. Update those sentences so an air row is part of the same menu. The field schema stays optional strings, including `objective` and `method`.
- [ ] `doc/ai-commander-prompts/example-strategic-prompt.md`: one air row in Operation Options. Leave the example response on its letter launch.
- [ ] `doc/combat-rules-v3.md`: in the airlift section, one paragraph that an AI seat's air operation supplies its own ferry and drop orders and replaces other air orders for that unit. Leave the sea embark paragraph as it is.
- [ ] Search `doc/` for `sea landing` and `by sea` and update each sentence this change makes wrong. Do not edit the historical documents named in `AGENTS.md`.
- [ ] `node scripts/check-doc-links.cjs` passes.
- [ ] `npm test` passes. `npm run check:circular` reports no new cycle. The four cycles already in the report are not a failure.
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
