# Operations 2 of 6, Sea Operations: Execution Plan

## Where This Plan Sits

| Order | File | What it delivers |
|-------|------|------------------|
| 0 | `2026-11-13-logistics-commander-execution-plan.md` | Goals, tools, production priorities, mercenaries, missiles |
| 1 | `2026-11-13-operations-1-lift-foundations-execution-plan.md` | Embarked units stay aboard; shared lift rules and terrain helpers |
| 2 | this file | Stored operations; the engine runs sea landings end to end |
| 3 | `2026-11-13-operations-3-operation-menu-execution-plan.md` | The commander sees a menu and can launch and cancel |
| 4 | `2026-11-13-operations-4-air-operations-execution-plan.md` | Air landings; objectives the commander names itself |
| 5 | `2026-11-13-operations-5-land-campaign-execution-plan.md` | The land campaign shown and chosen as an operation |
| 6 | `2026-11-13-operations-6-posture-execution-plan.md` | A posture the commander declares, which shifts the engine's settings |

Plans 0 and 1 must be complete before this plan starts.

## Why This Change

Nothing in the game moves an AI seat's ground units across water. A landing takes several turns and several kinds of order, and a commander that is consulted once a turn, or not at all on a quiet turn, does not carry such a sequence through.

In this plan the engine carries it. An operation is a stored record: an objective, the units and ships assigned, a muster port, and a phase. Once a turn, when a new planning phase begins, the engine advances every operation one step and writes the standing orders, the embarkations, and the unloadings itself. The commander is told what is running and may pull any unit out by giving it an order.

In this plan the engine also chooses which operation to launch. The user accepted that as a shipped interim state. Plan 3 gives the choice to the commander.

## How an Operation Runs

| Phase | What the engine does each turn | Leaves the phase when |
|-------|--------------------------------|-----------------------|
| `muster` | Marches each assigned ground unit and each assigned ship to the muster port. A unit already there defends it. | Every ground unit and at least one ship is at the port, or the muster timeout passes with enough units there. The engine then loads the ships, picks a landing hex, and sends the ships to it. |
| `transit` | Keeps each ship marching to the landing hex. | A ship reaches the landing hex: the engine unloads its cargo and marches the cargo onto the objective. When no ship is still carrying cargo, the phase ends. |
| `assault` | Keeps each ground unit marching onto the objective. | The seat controls the objective (done), no ground unit is left (lost), or the assault timeout passes. |
| `return` | Marches loaded ships to the nearest port the seat controls. | A ship reaches the port and unloads. Used when the objective stops being an enemy city while ships are at sea. There is no timeout: the operation stays until its cargo is ashore or its ships are gone. |

## Requirements

| Id | Requirement |
|----|-------------|
| R1 | An operation is stored per seat in the game database and survives save, load, and restart. It is cleared when a new match starts and when its seat is knocked out. |
| R2 | Once per turn, when a new planning phase begins, the engine advances every operation of every active AI seat. It does this whether or not the commander is consulted that turn. |
| R3 | The decision of what an operation does next is a pure function of the operation and a set of facts. The code that changes the database is separate and small. |
| R4 | When a seat has a free slot and a clear, reachable enemy city exists, the engine launches a sea operation against it. |
| R5 | A unit or ship whose standing order the commander has changed is released from its operation and keeps the commander's order. |
| R6 | Units in an operation are not counted as campaign units and get no Campaign Orders row. |
| R7 | The briefing lists active operations. The system prompt explains that the engine runs them and how to pull a unit out. |
| R8 | An operation never leaves cargo stranded: every path out of `transit` either lands the cargo or sends it home. |
| R9 | A failure inside operation code never stops a turn from resolving or a consult from running. |
| R10 | It works on the global map and on every regional map, with fog on or off, with two or more seats, and with or without a campaign plan. |
| R11 | The tactical prompt is unchanged, character for character. |

## Decisions Already Made

Do not reopen these.

- Operations advance in `finalizeReadyTurnAfterMelee`, directly after the turn number increments and fog is refreshed. That is the one point every turn passes through. Consults and unconsulted turns both see the result.
- Operations are stored as JSON under one `game_config` key, the way campaign objectives are. No table is added and the schema version does not change.
- Embarking and unloading are done by the engine when it advances, with the same functions the turn resolution uses (`applyEmbarkOrdersForPlayer`, `clearEmbarkAssignmentForLandUnit`). Embark resolves first in a turn in any case, so doing it at the start of planning changes no outcome.
- One sea operation per seat at a time, times the game-size multiplier.
- Ships go to the troops' port. The muster port is a seaport hex the seat controls.
- The engine launches only against a clear objective: no enemy unit within `LIFT_OBJECTIVE_CLEAR_RADIUS`.
- A released unit keeps whatever standing order it has. The engine does not try to win it back.
- The engine code lives in `src/main/operations/`. The briefing and prompt text live under `src/main/openRouter/`.
- No unit, range, capacity, or movement rule changes.

## Constants

New, in `src/main/operations/operationRules.ts`.

| Name | Value | Meaning |
|------|-------|---------|
| `OPERATION_MAX_SEA_PER_SIZE` | 1 | Active sea operations per seat, times `GAME_SIZE_MULTIPLIER`. |
| `OPERATION_MIN_GROUND_UNITS` | 2 | Fewest ground units worth a landing. |
| `OPERATION_MUSTER_CANDIDATE_LIMIT` | 6 | Seaports tested as a muster port. Bounds the search. |
| `OPERATION_MUSTER_MAX_LAND_STEPS` | 8 | Farthest a ground unit marches to a muster port. |
| `OPERATION_OBJECTIVE_TEST_LIMIT` | 8 | Cities tested for a sea route. Bounds pathfinding. |
| `OPERATION_MENU_SIZE` | 5 | Most candidates returned. |
| `OPERATION_MUSTER_TIMEOUT_TURNS` | 10 | Turns in `muster` before going with what is there, or giving up. |
| `OPERATION_TRANSIT_TIMEOUT_TURNS` | 20 | Turns in `transit` before turning back. |
| `OPERATION_ASSAULT_TIMEOUT_TURNS` | 6 | Turns in `assault` before the operation ends. |

## Rules for the Implementing Agent

Read these before Phase 1. They apply to every phase.

- Never commit or push.
- Source files under `src/` use CRLF line endings. Keep CRLF. `.spec` files may stay LF.
- Do not put plan words in code, comments, test names, or docs: no "Phase", "Step", "R1", "Operations 2", and so on. The game's own words `phase`, `muster`, `transit`, `assault`, and `return` are product terms and are allowed.
- Every new or changed function, constant, and interface field needs an orienting comment block with at least 5 non-empty lines: a summary line, then `Purpose:` (or `Contract:` on interface fields), `When to use:`, `Expected outcome:`, `Exceptions:`. ESLint rule `orienting-comments/require-orienting-block` enforces this.
- Logging: every new exported function logs its call. Use `logDebug` when it changes state or makes a per-turn or per-consult decision, `logTrace` when it only reads and returns, and `logError` for every caught exception. Use the existing `../logger` import of each file.
- Documentation follows `AGENTS.md`. In the documentation phase, also read `doc/README.md`: add every new exported constant this plan introduces to the engine-constants section there, beside the campaign constants, naming its file. Search `doc/` for any sentence the change makes wrong. End your final summary with the list of documents you updated.
- Mark every new binding `const` and every new interface field `readonly`.
- No function takes more than 6 named arguments. Use one `args` object.
- No source file passes 600 lines. Split by the file names this plan gives.
- Tests cover happy paths and essential failure cases only. Never delete a content assertion. Never replace an assertion with `assert.ok(true)`.
- PowerShell does not support `&&`. Chain commands with `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`.
- If a database test fails with a `NODE_MODULE_VERSION` error, run `npm run rebuild:native:node` once, then rerun it.
- When a step says "replace", replace exactly the quoted text. If it is not found, stop and report.
- When a step says "read first", open the named function before editing. If it does not do what this plan says, stop and report.
- Distances between hexes use `computeGridDistanceWithPathFallbackPure` or `isWithinGridRangePure`. Never call `gridDistance` from `h3-js` directly.
- Sort unit ids and hex ids with `<` on the strings, not with `localeCompare`.
- Numbers in prompt text come from the named constant or helper.

## Phase 1: Types and Storage

Goal: R1. Nothing reads the store yet.

### Step 1: New file `src/shared/operationTypes.ts`

- [ ] Add:

```ts
export type OperationMethod = 'sea';
export type OperationPhase = 'muster' | 'transit' | 'assault' | 'return';
export type OperationSource = 'engine' | 'commander';

export const OPERATION_METHODS: readonly OperationMethod[] = ['sea'];
export const OPERATION_PHASES: readonly OperationPhase[] = ['muster', 'transit', 'assault', 'return'];
export const OPERATION_SOURCES: readonly OperationSource[] = ['engine', 'commander'];

export interface Operation {
  readonly id: string;
  readonly method: OperationMethod;
  readonly objectiveH3: string;
  readonly musterH3: string;
  readonly landingH3: string | null;
  readonly unitIds: readonly string[];
  readonly carrierIds: readonly string[];
  readonly phase: OperationPhase;
  readonly source: OperationSource;
  readonly launchedTurn: number;
  readonly phaseTurn: number;
}
```

  - `unitIds` are ground units. `carrierIds` are ships. `phaseTurn` is the turn the current phase began. `landingH3` is `null` until the ships are loaded.

### Step 2: New file `src/main/gameDb/operationMemory.ts`

Read `src/main/gameDb/campaignObjectiveMemory.ts` first and copy its shape: one config key, a strict parser, a reader that drops bad entries with a log line, and a writer that sorts seats.

- [ ] `export const OPERATIONS_CONFIG_KEY = 'operations';`
- [ ] `export function readOperations(ops: Pick<GameConfigKvDbOps, 'getOne'>): Map<string, Operation[]>`. The stored value is an object whose keys are seat ids and whose values are arrays. An entry that fails the parser is dropped and logged with `logDebug`. A value that is not valid JSON, or not an object, logs with `logError` and returns an empty map.
- [ ] The parser rejects an entry unless: `id`, `objectiveH3`, and `musterH3` are non-empty strings; `landingH3` is `null` or a non-empty string; `unitIds` and `carrierIds` are arrays of strings; `method`, `phase`, and `source` are in the three exported lists; `launchedTurn` and `phaseTurn` are integers.
- [ ] `export function writeOperationsForSeat(ops: Pick<GameConfigKvDbOps, 'getOne' | 'run'>, seatId: string, operations: readonly Operation[]): void`. An empty array removes the seat's key. Operations are written sorted by `id`.
- [ ] `export function nextOperationId(seatId: string, existing: readonly Operation[], turnNumber: number): string` returns `${seatId}-op${turnNumber}` when no existing operation has that id, otherwise `${seatId}-op${turnNumber}b`, then `c`, and so on.

### Step 3: Clear on reset and on knockout

- [ ] `src/main/gameDb/resetGame.ts`: directly after `deleteGameConfigRow({ run }, CAMPAIGN_OBJECTIVES_CONFIG_KEY);` add `deleteGameConfigRow({ run }, OPERATIONS_CONFIG_KEY);` and import the constant.
- [ ] `src/main/gameActions/knockoutConsequences.ts`: in `deleteSeatPrivateRows`, after the `fog_new_contacts` line, add `writeOperationsForSeat({ getOne: dbGetOne, run: dbRun }, seatId, []);`. Import what is missing from `../gameDb`. If `dbGetOne` is not already imported in that file, add it to the existing `../gameDb` import.

### Step 4: Tests in `src/main/gameDb/operationMemory.test.ts`

Read `campaignObjectiveMemory` tests first (`rg -l "readCampaignObjectives" src --glob "*.test.ts"`) and reuse their fake `ops`.

- [ ] Write then read returns the same operations for the same seat.
- [ ] Writing an empty array removes the seat and leaves another seat's operations.
- [ ] A stored entry with an unknown phase is dropped; a valid one beside it is kept.
- [ ] A stored value that is not JSON returns an empty map.
- [ ] `nextOperationId` returns the plain id, then the `b` id when the plain one is taken.

### Phase 1 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/gameDb/operationMemory.test.js`
- [ ] Run the reset and knockout tests: `rg -l "resetGameForNewMatch|applyKnockout" src --glob "*.test.ts"`, then run each compiled file. None may need a change.

## Phase 2: Candidates

Goal: the part of R4 that decides what could be launched. New files `src/main/operations/operationRules.ts` (constants) and `src/main/operations/seaOperationCandidates.ts`.

### Step 1: Constants

- [ ] Create `operationRules.ts` with the nine constants from the Constants table.

### Step 2: Candidate type and builder

- [ ] In `src/shared/operationTypes.ts`, add the candidate type. In `seaOperationCandidates.ts`, add the builder:

```ts
export interface OperationCandidate {
  readonly method: OperationMethod;
  readonly objectiveH3: string;
  readonly musterH3: string;
  readonly landingH3: string;
  readonly unitIds: readonly string[];
  readonly carrierIds: readonly string[];
  readonly etaTurns: number;
  readonly urbanHexCount: number;
  readonly inEnemyHome: boolean;
  readonly knownFortifiedCount: number;
  readonly defenders: number;
  readonly reinforcers: number;
  readonly clear: boolean;
}

export function listSeaOperationCandidates(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly landMass: LandMassByH3;
  readonly terrain: LiftTerrain;
  readonly active: readonly Operation[];
  readonly protectedUnitIds: ReadonlySet<string>;
  readonly hasCampaignPlan: boolean;
}): OperationCandidate[]
```

- [ ] Rules, in this order. Return `[]` at the first rule that says so.
  1. `busy` is every id in `unitIds` and `carrierIds` of `args.active`.
  2. Free ships: the seat's naval units that are not in `busy`, carry no cargo (no unit's `embarkedOnCarrierUnitId` names them), and have `terrain.enemyUnitsWithin(ship.h3Index, getRange('naval')) === 0`. Sorted by id. None: `[]`.
  3. Available ground units: the seat's infantry and armor that are not embarked, not in `busy`, and not in `protectedUnitIds`. Fewer than `OPERATION_MIN_GROUND_UNITS`: `[]`.
  4. `cap = liftGroundCap({ groundUnitCount, committedCount, hasCampaignPlan })` from plan 1, where `groundUnitCount` is every infantry and armor unit of the seat and `committedCount` is those embarked plus those in `busy`. Below `OPERATION_MIN_GROUND_UNITS`: `[]`.
  5. Muster port. Candidates are hexes the seat controls with `seaportCount > 0` for which `terrain.embarkLegal` and `terrain.shipCanEnter` are true. Keep the `OPERATION_MUSTER_CANDIDATE_LIMIT` nearest to the first free ship by `computeGridDistanceWithPathFallbackPure`, ties by hex id. For each, compute `steps = getLandStepDistances({ originH3s: [port], hexSet, data: args.landMass, maxDepth: OPERATION_MUSTER_MAX_LAND_STEPS })` from `src/shared/landTraversalStrategic.ts`. The units that can muster there are the available units whose hex is in `steps`. The ships that can muster there are the free ships with a non-null `terrain.sailTurns(ship.h3Index, port)`.
  6. For each port, the force is built like this: take the units that can muster, nearest first (fewer steps, then infantry before armor, then id); keep at most `cap`; then drop units from the end until `shipsNeeded(types)` from plan 1 is at most the number of ships that can muster there. The ships are the first `shipsNeeded` of those, fewest sail turns first, then id.
  7. Choose the port whose force has the most ground units, then the lowest total steps, then the lowest hex id. If its force has fewer than `OPERATION_MIN_GROUND_UNITS`: `[]`.
  8. `musterTurns` is the larger of: the largest step count of a chosen unit (use the step count as turns for infantry and for armor), and the largest sail turns of a chosen ship.
  9. Cities: add and export `listKnownEnemyCities(state: GameStateSnapshot, seatId: string): LiftCity[]` in this file. It calls `knownCampaignCities(...)` from `src/main/openRouter/campaignTargetSelection.ts`. Read `campaignInputsFromState` in `campaignObjectiveFlow.ts` first and build that function's five arguments the same way. Map each result to a `LiftCity`. The builder calls it and then `rankLiftCities`.
  10. Order to test: clear cities first in rank order, then the rest in rank order. A city is clear when `terrain.enemyUnitsWithin(city.h3Index, LIFT_OBJECTIVE_CLEAR_RADIUS) === 0`.
  11. For each city, until `OPERATION_MENU_SIZE` candidates are found or `OPERATION_OBJECTIVE_TEST_LIMIT` cities have been tested: among `terrain.landingHexes(city.h3Index)`, take the one with the fewest non-null `terrain.sailTurns(port, hex)`, then the lowest hex id. No landing with a route: skip the city.
  12. A candidate's `etaTurns` is `musterTurns + sailTurns + 1`. `defenders` is `terrain.enemyUnitsWithin(city, LIFT_OBJECTIVE_CLEAR_RADIUS)`. `reinforcers` is the number of enemy infantry and armor units within `etaTurns` hexes of the city, minus `defenders`, never below 0.
- [ ] `logDebug('seaOperationCandidates listSeaOperationCandidates', { seatId, candidateCount, routeChecks: terrain.routeChecks() })`.

### Step 3: Tests in `src/main/operations/seaOperationCandidates.test.ts`

Build the snapshot and land mass as `liftTerrain.test.ts` does.

- [ ] Two infantry inland within reach of a controlled seaport, one free ship, and one clear enemy coastal city across water give one candidate naming that port, both infantry, and the ship.
- [ ] No free ship gives `[]`. One available ground unit gives `[]`.
- [ ] A unit in `protectedUnitIds` and a unit in an active operation are never chosen.
- [ ] Three infantry and one ship give a force of two.
- [ ] A clear city is listed before a larger city that has a defender; the larger one has `clear: false` and `defenders: 1`.
- [ ] Twelve reachable cities give five candidates, and `routeChecks` is finite and recorded in the test as an upper bound.
- [ ] A city on an inland sea the ship cannot reach is skipped.

### Phase 2 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/seaOperationCandidates.test.js`

## Phase 3: The Advance Decision

Goal: R3, R5, R8. New file `src/main/operations/seaOperationAdvance.ts`. Pure: no database, no terrain cache.

### Step 1: Types

```ts
export type OperationAction =
  | { readonly kind: 'march'; readonly unitId: string; readonly toH3: string }
  | { readonly kind: 'defend'; readonly unitId: string; readonly atH3: string }
  | { readonly kind: 'embark'; readonly unitId: string; readonly carrierId: string }
  | { readonly kind: 'unload'; readonly unitId: string }
  | { readonly kind: 'cancelOrder'; readonly unitId: string };

export interface StoredOrderFact {
  readonly type: string;
  readonly h3Index: string | null;
}

export interface OperationFacts {
  readonly turnNumber: number;
  readonly unitHexById: ReadonlyMap<string, string>;
  readonly unitTypeById: ReadonlyMap<string, string>;
  readonly carrierByCargoId: ReadonlyMap<string, string>;
  readonly storedOrderById: ReadonlyMap<string, StoredOrderFact>;
  readonly objectiveIsEnemyCity: boolean;
  readonly objectiveIsOwn: boolean;
  readonly chooseLanding: (fromH3: string) => string | null;
  readonly chooseReturnPort: (fromH3: string) => string | null;
}

export type OperationOutcome = 'running' | 'completed' | 'lost' | 'abandoned';

export interface OperationStep {
  readonly next: Operation | null;
  readonly actions: readonly OperationAction[];
  readonly releasedIds: readonly string[];
  readonly outcome: OperationOutcome;
  readonly reason: string;
}

export function advanceSeaOperation(operation: Operation, facts: OperationFacts): OperationStep
```

`unitHexById` holds only units that still exist and still belong to the seat. A unit missing from it is gone.

### Step 2: Rules shared by every phase

- [ ] Drop from `unitIds` and `carrierIds` every id missing from `unitHexById`.
- [ ] Release. A unit is released when it has a stored order whose `(type, h3Index)` is not one the current phase would assign to it. Released units are dropped from the operation with no action and listed in `releasedIds`. The orders each phase assigns are:

| Phase | Ground unit | Ship |
|-------|-------------|------|
| `muster` | `march` or `defend` on the muster hex | `march` or `defend` on the muster hex |
| `transit` | none; cargo has no order | `march` on the landing hex |
| `assault` | `march` or `defend` on the objective | not in the operation |
| `return` | none | `march` on the muster hex |

  A unit with no stored order is never released; the phase assigns its order again.
- [ ] In `transit` and `return`, a ground unit that no carrier is carrying is dropped with no action.
- [ ] When a rule changes `phase`, set `phaseTurn` to `facts.turnNumber`.

### Step 3: `muster`

- [ ] No ground unit or no ship left: `next: null`, `outcome: 'abandoned'`, a `cancelOrder` for every remaining id.
- [ ] For each ground unit and each ship: at the muster hex, a `defend` action there unless its stored order already is that; elsewhere, a `march` action there unless its stored order already is that.
- [ ] `present` is the ground units at the muster hex. `shipsPresent` is the ships there.
- [ ] Ready when `shipsPresent` is not empty and either every ground unit is present, or `facts.turnNumber - phaseTurn >= OPERATION_MUSTER_TIMEOUT_TURNS` and `present.length >= OPERATION_MIN_GROUND_UNITS`.
- [ ] Timed out and not ready: `next: null`, `outcome: 'abandoned'`, a `cancelOrder` for every id.
- [ ] Ready:
  1. `landing = facts.chooseLanding(musterH3)`. `null`: abandon as above. No unit is embarked.
  2. For each ship in `shipsPresent`, in id order: `fillShip` (plan 1) over the present units not yet assigned. For each returned unit, a `cancelOrder` then an `embark` action. Stop when no unit is left.
  3. A ship that received cargo gets a `march` action to `landing` and stays in `carrierIds`. Every other ship gets a `cancelOrder` and is dropped.
  4. A ground unit that was not embarked gets a `cancelOrder` and is dropped.
  5. `next` has `phase: 'transit'`, `landingH3: landing`, and the remaining ids.
  6. When ready, return only the actions of this list. Do not also return the `march` and `defend` actions of the bullet above.

### Step 4: `transit`

- [ ] No ship left: `next: null`, `outcome: 'lost'`.
- [ ] `!facts.objectiveIsEnemyCity && !facts.objectiveIsOwn`, or `facts.turnNumber - phaseTurn > OPERATION_TRANSIT_TIMEOUT_TURNS`: `phase: 'return'`; `musterH3` becomes `facts.chooseReturnPort(hex of the first ship) ?? musterH3`; and a `march` action to that hex for every ship. Put this in one private function, `turnBack(operation, facts)`, so a cancel can reuse it.
- [ ] For each ship at the landing hex: an `unload` action for each unit it carries; then for each of those units a `march` action to the objective, or a `defend` action there when the landing hex is the objective; then a `defend` action for the ship on the landing hex. Drop the ship from `carrierIds`.
- [ ] For each other ship with no stored order: a `march` action to the landing hex.
- [ ] No ship left in `carrierIds` after that: `phase: 'assault'`.

### Step 5: `assault`

- [ ] No ground unit left: `next: null`, `outcome: 'lost'`.
- [ ] `facts.objectiveIsOwn`: a `defend` action on the objective for each ground unit standing on it; `next: null`, `outcome: 'completed'`.
- [ ] `facts.turnNumber - phaseTurn > OPERATION_ASSAULT_TIMEOUT_TURNS`: `next: null`, `outcome: 'abandoned'`, no action. The units keep their march.
- [ ] Otherwise, for each ground unit with no stored order: a `march` action to the objective.

### Step 6: `return`

- [ ] No ship left: `next: null`, `outcome: 'lost'`.
- [ ] For each ship at the muster hex: an `unload` action and then a `defend` action on the muster hex for each unit it carries, and a `defend` action for the ship. Drop the ship and its cargo.
- [ ] For each other ship with no stored order: a `march` action to the muster hex.
- [ ] No ship left: `next: null`, `outcome: 'abandoned'`.
- [ ] There is no timeout in `return`. An operation in `return` is never ended while a ship still carries cargo.

### Step 7: Tests in `src/main/operations/seaOperationAdvance.test.ts`

Build `OperationFacts` by hand. One test per bullet:

- [ ] Muster, nobody arrived: a `march` for each unit and ship; phase unchanged.
- [ ] Muster, unit already holds the right march: no action for it.
- [ ] Muster complete with two infantry and one ship: two `cancelOrder`, two `embark`, one ship `march` to the landing; phase `transit`; `landingH3` set.
- [ ] Muster complete with no landing: abandoned, and no `embark` action.
- [ ] Muster timeout with one unit present: abandoned. With two present and one absent: goes to `transit` with two, and the absent unit gets `cancelOrder`.
- [ ] A ground unit whose stored order is a `march` to another hex is released with no action.
- [ ] Transit, ship at the landing: `unload`, a `march` to the objective, a ship `defend`; phase `assault`.
- [ ] Transit, landing hex equals objective: cargo gets `defend`, not `march`.
- [ ] Transit, objective no longer an enemy city and not own: phase `return`.
- [ ] Transit, ship gone: `lost`.
- [ ] Assault, objective own: `completed`, with a `defend` for a unit on it.
- [ ] Return, ship at the muster hex: `unload` and `defend`; then `abandoned` once no ship is left. Return, 100 turns in with a ship still at sea: still `running`.
- [ ] Transit turning back with `chooseReturnPort` returning another hex: `musterH3` is that hex and the ships march to it.

### Phase 3 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/seaOperationAdvance.test.js`

## Phase 4: Effects and the Turn Hook

Goal: R2, R4, R6, R9.

### Step 1: New file `src/main/operations/operationActions.ts`

- [ ] `export function applyOperationActions(args: { readonly seatId: string; readonly actions: readonly OperationAction[]; readonly state: GameStateSnapshot; readonly coordinates: KnockoutCoordinates }): number` returns how many actions succeeded. `KnockoutCoordinates` comes from `../gameActions/knockoutConsequences`; it carries `latLngByH3` and `resolveToH3`. Read its definition first.
- [ ] Each action, in the order given:
  - `march`: `executeStandingOrderActionForPlayer(seatId, 'assign_order', { unitId, order: { type: 'march', destination, engageEnRoute: true } }, state, latLngByH3, resolveToH3)` from `src/main/tools/standingOrdersCore.ts`, where `destination` is `latLngByH3.get(toH3)`. Read `prepareNeutralTransportsForTurn` in `src/main/gameActions/neutralTurn.ts` first; it makes the same call.
  - `defend`: the same call with `order: { type: 'defend', defendHex }`.
  - `cancelOrder`: the same function with `'cancel_order'` and `{ unitId }`.
  - `embark`: `applyEmbarkOrdersForPlayer([{ unitId, navalUnitId: carrierId }], seatId)` from `src/main/gameActions/sealift.ts`. Then read `getEmbarkedNavalForLandUnit(unitId)`; when it is not `carrierId`, the action failed.
  - `unload`: `clearEmbarkAssignmentForLandUnit(unitId)`.
- [ ] A missing coordinate, a result whose `status` is `'error'`, or a failed embark is logged with `logError` and does not stop the remaining actions. A thrown error is caught, logged, and treated the same way.

### Step 2: New file `src/main/operations/operationTurnFlow.ts`

- [ ] `export function advanceOperationsAfterTurn(coordinates: KnockoutCoordinates): void`
  - The whole body is inside a `try`/`catch` that logs with `logError('operationTurnFlow: could not advance operations; the turn goes on', err)`. Nothing this function does may stop a turn from finishing.
  - `seats = activeAiSeatIds(getSeatRoster())`. Remove the stored operations of every seat not in `seats`.
  - For each seat call `advanceOperationsForSeat(seatId, coordinates)` inside a `try`/`catch` that logs with `logError('operationTurnFlow: seat failed; operations left as stored', { seatId }, err)`.
- [ ] `export function advanceOperationsForSeat(seatId: AiSeatId, coordinates: KnockoutCoordinates): void`
  1. `state = getGameStateForPlayer(seatId, { maskUnexploredTerrain: false })` from `../gameDb`.
  2. `landMass = loadCampaignLandMass(seatId)` from `../openRouter/campaignObjectiveFlow`. `null`: return.
  3. `terrain = buildLiftTerrain({ state, seatId, landMass })`.
  4. Build `OperationFacts`:
     - `unitHexById`, `unitTypeById`: from `state.units` whose `player === seatId`.
     - `carrierByCargoId`: from each such unit's `embarkedOnCarrierUnitId`.
     - `storedOrderById`: read the seat's `standing_orders` rows as `buildCampaignOrderRows` in `src/main/tools/standingOrdersInjectionText.ts` does. For a `march` the hex is the resolved `destination`; for a `defend` it is `resolveDefendPostH3(row)`; for any other type it is `null`.
     - Per operation: `objectiveIsOwn` is true when `state.strategicControl` gives the objective to the seat. `objectiveIsEnemyCity` is true when the objective is in `listKnownEnemyCities(state, seatId)`. Call that once per seat, not once per operation.
     - `chooseLanding(fromH3)`: among `terrain.landingHexes(objective)`, the one with the fewest non-null `terrain.sailTurns(fromH3, hex)`, then the lowest id; `null` when none has a route.
     - `chooseReturnPort(fromH3)`: among hexes the seat controls for which `terrain.debarkLegal` and `terrain.shipCanEnter` are true, take the `OPERATION_MUSTER_CANDIDATE_LIMIT` nearest by `computeGridDistanceWithPathFallbackPure`, then of those the one with the fewest non-null `terrain.sailTurns(fromH3, hex)`, then the lowest id; `null` when none has a route.
  5. For each stored operation, in id order: `step = advanceSeaOperation(operation, facts)`; `applyOperationActions`; keep `step.next` when it is not `null`. Log each with `logDebug('operationTurnFlow advanced', { seatId, id, phase: step.next?.phase ?? null, outcome: step.outcome, reason: step.reason, actionCount, releasedIds: step.releasedIds })`.
  6. Launch. `slots = OPERATION_MAX_SEA_PER_SIZE × GAME_SIZE_MULTIPLIER[parseGameSize(state.gameSize)]`. While the kept operations number fewer than `slots`: build `protectedUnitIds` and `hasCampaignPlan` (below), call `listSeaOperationCandidates`, take the first candidate with `clear: true`. None: stop. Otherwise create an `Operation` with `phase: 'muster'`, `source: 'engine'`, `landingH3: null`, `launchedTurn` and `phaseTurn` the current turn, and the id from `nextOperationId`; run `advanceSeaOperation` on it once and apply its actions; keep it. Log `logDebug('operationTurnFlow launched', { seatId, id, objectiveH3, musterH3, unitCount, carrierCount })`.
  7. `writeOperationsForSeat` with the kept operations.
- [ ] `protectedUnitIds` and `hasCampaignPlan`: `plan = campaignPlanForState(state)` from `../openRouter/campaignObjectiveFlow`. `hasCampaignPlan` is `plan !== null`. `protectedUnitIds` is `plan?.defenderUnitIds ?? []` plus every own ground unit with `terrain.enemyUnitsWithin(unit.h3Index, CAMPAIGN_CONTACT_RADIUS) > 0`.

### Step 3: Call it once a turn

Read `finalizeReadyTurnAfterMelee` in `src/main/gameActions/meleeInterceptReadyFinalize.ts` first.

- [ ] Directly after the `refreshFogOfWarIntelFromCurrentState({ traversedHexesByPlayer: traversedForFog });` call and before `saveDatabase();`, add:

```ts
  advanceOperationsAfterTurn(args.knockoutCoordinates);
```

- [ ] Import it from `../operations/operationTurnFlow`. Run `npm run check:circular`. If a new cycle appears, stop and report; do not work around it.

### Step 4: Keep operation units out of the campaign

Read `campaignInputsFromState` in `src/main/openRouter/campaignObjectiveFlow.ts` first.

- [ ] Before `groundUnits` is built, add `const inOperation = operationUnitIdsForSeat(seatId);`. In the `groundUnits` filter add `&& !inOperation.has(unit.id)`.
- [ ] Add `operationUnitIdsForSeat(seatId: string): ReadonlySet<string>` to `src/main/gameDb/operationMemory.ts`. It reads the seat's operations and returns every id in `unitIds`. On any thrown error it logs with `logError` and returns an empty set.
- [ ] `campaignReadyOverride` in `src/main/openRouter/afterResolution.ts` builds its own `groundUnitHexes`. Add the same exclusion there.

### Step 5: Tests

- [ ] New `src/main/operations/operationActions.test.ts`, against a test database built as `standingOrders.test.ts` builds one: a `march` action stores a march; `embark` on a ship at the same legal hex creates the assignment; `embark` on a ship at another hex is counted as failed and does not throw; `unload` removes the assignment.
- [ ] New `src/main/operations/operationTurnFlow.test.ts`, same database: with two infantry, a ship, a controlled seaport, and a clear enemy coastal city, one call stores one operation in `muster` and stores marches for the three units. A second call in the same state stores no second operation. With the seat removed from the roster, a call deletes its stored operations.
- [ ] `campaignObjectiveFlow.test.ts`: a ground unit named in a stored operation is not in `campaignInputsFromState(...).groundUnits`.

### Phase 4 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationActions.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationTurnFlow.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/campaignObjectiveFlow.test.js`
- [ ] `npm run check:circular` reports no new cycle.
- [ ] `meleeInterceptReadyFinalize.ts` grew by two lines.

## Phase 5: Briefing and Prompt

Goal: R7, R11.

### Step 1: Headings

- [ ] In `src/main/openRouter/promptSpec/sectionHeadings.ts`, after `SECTION_TITLE_CAMPAIGN_ORDERS`, add `export const SECTION_TITLE_OPERATIONS = 'Active Operations' as const;` with an orienting block. Run `rg -n "SECTION_TITLE_CAMPAIGN_OBJECTIVE" src` and add the new constant beside it in every registry, list, or heading test.

### Step 2: New file `src/main/openRouter/briefingSectionsOperations.ts`

- [ ] `export function buildOperationsSection(args: { readonly state: GameStateSnapshot; readonly operations: readonly Operation[]; readonly format: (h3Index: string) => string }): string`
  - `''` when there is no operation.
  - Otherwise `topLevelHeading(SECTION_TITLE_OPERATIONS)`, a blank line, and one bullet per operation in id order:

| Phase | Bullet |
|-------|--------|
| `muster` | `- ${id}: by sea to ${objective}, an enemy city with ${urban} city cells. Mustering at ${muster}: ${present} of ${total} ground units and ${shipsPresent} of ${ships} ships are there. Units: ${unitIds}. Ships: ${carrierIds}.` |
| `transit` | `- ${id}: by sea to ${objective}, an enemy city with ${urban} city cells. At sea for ${landing} with ${cargo} ground units aboard. Ships: ${carrierIds}.` |
| `assault` | `- ${id}: by sea to ${objective}, an enemy city with ${urban} city cells. Landed. ${count} ground units are marching on it: ${unitIds}.` |
| `return` | `- ${id}: turned back from ${objective}. Returning to ${muster}. Ships: ${carrierIds}.` |

  - Hexes go through `format`. Counts come from `state.units`. Use `city cell`, `ground unit`, and `ship` in the singular when the count is 1. Lists are joined with `, `.

### Step 3: New file `src/main/openRouter/promptSpec/operationRuleText.ts`

- [ ] `export function buildOperationRuleBlock(): string` returns exactly this, with the first line built by `subHeading(SECTION_TITLE_OPERATION_RULES)`:

```text
## Operations

The engine runs operations: several turns of orders that carry ground units to an enemy city by sea. It musters the units and ships at a port, loads them, sails to a landing beside the city, unloads, and marches onto it. The Active Operations section of the briefing lists each one and how far it has got.

Units and ships in an operation already have their orders. Leave them alone and they carry on, including on turns you are not consulted. To take a unit or a ship out of an operation, give it any standing order of your own; it keeps that order and the operation goes on without it.

A unit aboard a ship takes no order. An explicit_move or a disembark unloads it where the ship is.
```

- [ ] Add `export const SECTION_TITLE_OPERATION_RULES = 'Operations' as const;` to `sectionHeadings.ts`, directly after `SECTION_TITLE_CAMPAIGN`.

### Step 4: Gate and placement

- [ ] `promptSpec/coachingGates.ts`: add `readonly operationsEnabled?: boolean;`.
- [ ] `consultPromptParts.ts`, in the `coachingGates` literal: `operationsEnabled: coordinateContext.mode !== 'tactical' && flags.ordersEnabled`.
- [ ] `coachingTextStrategic.ts`, in `buildStrategicContextCoaching`, replace the final `return` with:

```ts
  const withCampaign = gates.campaignEnabled === true ? `${message}\n\n${buildCampaignRuleBlock()}` : message;
  return gates.operationsEnabled === true ? `${withCampaign}\n\n${buildOperationRuleBlock()}` : withCampaign;
```

### Step 5: Wire the section into the consult

Follow the campaign wiring. Read each call site first.

- [ ] `requestOrdersInjection.ts`: add `readonly operationsText: string;` to `StatusInjectionTexts`. Build it when `args.ordersEnabled` and the mode is not tactical: read `readOperations({ getOne: dbGetOne }).get(seatId) ?? []` and call `buildOperationsSection` with the existing `formatCampaignHex` closure. Otherwise `''`.
- [ ] `consultPromptParts.ts`: the `else` branch that builds an `injection` literal needs `operationsText: ''`.
- [ ] `briefingFormatter.ts`: add `operationsText?: string;` beside `campaignText` in the shared-context interface. Directly after the block that pushes `campaignText`, add the same three lines for `operationsText`. The file must stay under 960 lines.
- [ ] `requestOrdersFlow.ts`: pass `operationsText: injection.operationsText` in the object given to `formatBriefing`.

### Step 6: Tests

- [ ] New `briefingSectionsOperations.test.ts`: no operation gives `''`; one test per phase checks the bullet text, including one singular form.
- [ ] `promptSpec/coachingText.test.ts`: `operationsEnabled: true` appends the block after the campaign block; false or absent leaves the text as before; tactical gates never include it.
- [ ] The briefing test that checks Campaign Objective placement (`rg -l "campaignText" src --glob "*.test.ts"`): `operationsText` prints directly after the campaign section.

### Phase 5 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsOperations.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/coachingText.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptContracts.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/variantConformance.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/briefingFormatter.test.js`
- [ ] The tactical cases in those files pass with no expected-string change.

## Phase 6: Living Documentation

- [ ] `doc/hybrid-ai.md`: an Operations section beside the Campaign section. What an operation is, the four phases, when it advances, how a unit is released, how the engine launches one.
- [ ] `doc/ai-commander-prompts/strategic-prompt.md`, `assembly-contract.md`, `information-decision-model.md`, `variants.md`, `source-inventory.md`, `crosswalk.md`: the Operations block, the Active Operations section, their include conditions, and the new files.
- [ ] `doc/ai-commander-prompts/example-strategic-prompt.md`: add the Operations block and an Active Operations section with one `muster` bullet.
- [ ] `doc/save-files.md`: operations are stored in `game_config` under `operations` and travel with the save.
- [ ] `doc/combat-rules-v3.md`: in the sealift section, one paragraph that an AI seat's operation embarks and unloads units at the start of planning.
- [ ] `node scripts/check-doc-links.cjs` passes.

## Phase 7: Final Verification

- [ ] `npm test` passes.
- [ ] `npm run check:circular` reports no new cycle.
- [ ] `rg -n "Phase [0-9]|Step [0-9]|\bR[0-9]+\b" src doc` shows no hit introduced by this change.
- [ ] No file touched here crossed 600 lines that was under it before, and none is over 1000.

## Phase 8: Verification Run

This phase is for the user, not the implementing agent. The agent stops after the previous phase and reports. The run needs the game window and a model key.

- [ ] Set `AGENT_WARS_LOG_LEVEL=debug`. Run 40 turns on the global map with home regions on different continents, no fog, no tactical battles, balanced doctrine. Keep `debug.log`.
- [ ] From `debug.log`, per seat: list every `operationTurnFlow launched` line and, for each id, the sequence of `phase` and `outcome` values in its `operationTurnFlow advanced` lines. Read the largest `routeChecks`. Count `operationActions` error lines. Count the ids in every `releasedIds`; a large count means the commander is pulling units out, and plan 3 should look at why. Count `sealift autoDebarkNonHumanLandUnitIfMovingIndependently` lines.
- [ ] Repeat for 40 turns on one regional map.
- [ ] Pass when, on the global map, at least one operation goes `muster`, `transit`, `assault` and ends `completed` or reaches `assault` with units ashore on another landmass; no operation stays in `return` for more than 20 turns; and no turn takes visibly longer than before.
- [ ] Report the sequences and counts whether or not the run passes.

## Out of Scope

- The commander choosing or cancelling an operation. Plan 3.
- Air operations and objectives the commander names. Plan 4.
- More than one muster port, escorts, or ships sailing as a group.
- Building a ship for a particular operation. Plan 0's Production Priorities already asks for naval units until the seat has half its naval cap.
- Any change to the game's interface.
