# Operations 1 of 6, Lift Foundations: Execution Plan

## Where This Plan Sits

Seven plans run in this order. Each one leaves the build and the tests green and can ship alone.

| Order | File | What it delivers |
|-------|------|------------------|
| 0 | `2026-11-13-logistics-commander-execution-plan.md` | Goals, tools, production priorities, mercenaries, missiles |
| 1 | this file | Embarked units stay aboard; shared lift rules and terrain helpers |
| 2 | `2026-11-13-operations-2-sea-operations-execution-plan.md` | Stored operations; the engine runs sea landings end to end |
| 3 | `2026-11-13-operations-3-operation-menu-execution-plan.md` | The commander sees a menu and can launch and cancel |
| 4 | `2026-11-13-operations-4-air-operations-execution-plan.md` | Air landings; objectives the commander names itself |
| 5 | `2026-11-13-operations-5-land-campaign-execution-plan.md` | The land campaign shown and chosen as an operation |
| 6 | `2026-11-13-operations-6-posture-execution-plan.md` | A posture the commander declares, which shifts the engine's settings |

Plan 0 must be complete before this plan starts. `countNeighborTerrain` returns counts, so this plan does not call it. Copy only its `gridDisk` try/catch.

## Why This Change

In a 250-turn AI-only match on the global map, no commander used sealift and none was seen using airlift. Oceans separate most home regions on the global map, so lift is often the only way to reach an enemy.

The design the user chose: the commander picks an objective, and the engine runs the sequence of orders that gets units there (muster, load, sail, land, assault). The commander does not re-issue each step. This plan removes the engine behaviours that would break any such sequence, and adds the small shared rules the later plans build on.

No match log was available. The causes below are a reading of the code, so each fix starts with a test that must fail first.

| Cause | Where |
|-------|-------|
| An embarked AI ground unit unloads as soon as any move order names a hex other than its carrier's hex. A standing march or a defend walk-back produces such an order every turn. The user confirmed unloading must be intentional. | `autoDebarkNonHumanLandUnitIfMovingIndependently` in `src/main/gameActions/sealift.ts`; `generateOrdersForStandingOrders` in `src/main/tools/standingOrdersGeneration.ts` has no embarked check |
| An embarked ground unit with no standing order is listed in Units Without Standing Orders with a march as its Suggested Destination. | `suggestApproachDestinationsForOrderlessUnits` in `src/main/tools/orderlessUnitSuggestions.ts` |
| Best Options may list a one-step move for cargo at sea. An `explicit_move` unloads. Check this before editing: `collectAggregatedPossibleActionRows` calls `getValidDestinations` without assuming the cargo has debarked, and that helper returns only the origin hex when the database says the unit is embarked. | `collectAggregatedPossibleActionRows` in `src/main/openRouter/possibleUnitActions.ts`; `buildAdjacentCellsFallbackBlock` in `src/main/openRouter/promptText.ts` does assume debarked |

## Requirements

| Id | Requirement |
|----|-------------|
| R1 | A ground unit aboard a ship or an aircraft stays aboard until a `disembark`, an `explicit_move`, an air drop, or the engine unloads it. Standing orders do not move it. |
| R2 | Orderless suggestions omit every embarked infantry or armor unit, including when a campaign order exists and including when the carrier can unload. A suggested march would not run. Best Options is left unchanged when embarked cargo already has no off-hex move row. The no-tools fallback list omits a neighbor only for naval cargo that cannot debark. Air cargo is not gated that way: an air unit debarks on its current hex with no port check. |
| R3 | One set of pure rules decides how many ground units may be lifted, how cities are ranked, and how a ship is filled. |
| R4 | One helper answers, from a snapshot, where a seat may embark and unload, how long a ship takes between two hexes, which hexes beside a city a ship can land at, and whether a city has enemy units nearby. |
| R5 | Everything works on the global map and on every regional map, with fog on or off. |
| R6 | No prompt text changes in this plan. |

## Decisions Already Made

Do not reopen these.

- Stopping standing orders from moving an embarked ground unit is a defect fix. `explicit_move` and `disembark` still unload.
- The new code lives in a new directory, `src/main/operations/`. It is engine code, not prompt code.
- Rules that need no database and no terrain cache go in `liftRules.ts`. Code that reads a snapshot goes in `liftTerrain.ts`.
- No unit, range, capacity, or movement rule changes.

## Constants

All new, all in `src/main/operations/liftRules.ts`.

| Name | Value | Meaning |
|------|-------|---------|
| `LIFT_OBJECTIVE_CLEAR_RADIUS` | 2 | A city is clear when no enemy unit is within this many hexes. |
| `LIFT_MAX_GROUND_SHARE` | 0.25 | Largest share of ground units committed to lift when a campaign plan exists. |
| `LIFT_MAX_GROUND_SHARE_NO_CAMPAIGN` | 0.5 | The same share when there is no campaign plan. |

The share scales with game size on its own, because the unit caps do.

## Rules for the Implementing Agent

Read these before Phase 1. They apply to every phase.

- Never commit or push.
- Source files under `src/` use CRLF line endings. Keep CRLF. `.spec` files may stay LF.
- Do not put plan words in code, comments, test names, or docs: no "Phase", "Step", "R1", "Operations 1", and so on.
- Every new or changed function, constant, and interface field needs an orienting comment block with at least 5 non-empty lines: a summary line, then `Purpose:` (or `Contract:` on interface fields), `When to use:`, `Expected outcome:`, `Exceptions:`. ESLint rule `orienting-comments/require-orienting-block` enforces this.
- Logging: every new exported function logs its call. Use `logDebug` when it changes state or makes a per-turn or per-consult decision, `logTrace` when it only reads and returns, and `logError` for every caught exception. Use the existing `../logger` import of each file.
- Documentation follows `AGENTS.md`. In the documentation phase, also read `doc/README.md`: add every new exported constant this plan introduces to the engine-constants section there, beside the campaign constants, naming its file. Search `doc/` for any sentence the change makes wrong. End your final summary with the list of documents you updated.
- Mark every new binding `const` and every new interface field `readonly`.
- No function takes more than 6 named arguments. Use one `args` object.
- Tests cover happy paths and essential failure cases only. Never delete a content assertion. Never replace an assertion with `assert.ok(true)`.
- PowerShell does not support `&&`. Chain commands with `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`.
- If a database test fails with a `NODE_MODULE_VERSION` error, run `npm run rebuild:native:node` once, then rerun it.
- When a step says "replace", replace exactly the quoted text. If it is not found, stop and report.
- When a step says "Add:", the snippet is the shape. Still write the orienting block on every new export and interface field. That is not a violation of the replace rule.
- When a step says "read first", open the named function before editing. If it does not do what this plan says, stop and report.
- Distances between hexes use `computeGridDistanceWithPathFallbackPure` or `isWithinGridRangePure` from `src/shared/h3GridRangePure.ts`. Never call `gridDistance` from `h3-js` directly; it throws across the antimeridian.
- Sort unit ids and hex ids with `<` on the strings, not with `localeCompare`.

## Phase 1: Embarked Units Stay Aboard

Goal: R1, R2. Each step writes the test first. If a test passes before the fix, do not apply that fix; say so in the report and go on.

### Step 1: Standing orders do not move an embarked ground unit

Read `generateOrdersForStandingOrders` and `expireAndUpdateStatus` in `src/main/tools/standingOrdersGeneration.ts` first. The file is 590 lines. The desirable limit is 600. Two short checks fit. Do not add a check at every movement write.

`generateOrdersForStandingOrders` calls `expireAndUpdateStatus` first. That function calls `refreshDefendPostProgress` and `advanceNextMovePastOccupiedCell`. A check only in the generation loop still lets those writes advance a march or a defend walk-back while the unit stays aboard.

The generation check also skips `appendNearestLegalEngagement` and a march `engageEnRoute` shot. Keep that skip. Embarked ship cargo cannot use ranged fire, and air cargo never fights. Melee does not come from these rows. A branch that kept the shots would push the file past 600 lines.

The hold keys off unit type and `embarkedOnCarrierUnitId`. It is not limited to one seat. Do not add a separate human test. Existing human tests must still pass.

- [x] In `src/main/tools/standingOrders.test.ts`, copy the temp-database setup from `testBriefingNextMoveIsNotTheHexJustEntered`. An opponent infantry has a `march` to a hex two steps away. Set `embarkedOnCarrierUnitId` on that infantry in the snapshot object passed to `generateOrdersForStandingOrders`. The generator reads that field, not the assignment table. Assert that `movementOrders` has no entry for the infantry, and that the standing-order row's `status` and `computed_route` are unchanged.
- [x] In that same test, give the naval unit a `march` and assert it still yields a movement order.
- [x] Add the same embarked snapshot for a `defend` order whose `defendHex` is not the unit's hex. Assert no movement order for the infantry.
- [x] Fix. At the start of the `for` loop in `expireAndUpdateStatus`, after the unit is known, and directly after `if (!unit) continue;` in `generateOrdersForStandingOrders`, skip an embarked infantry or armor unit:

```ts
    if ((unit.unitType === 'infantry' || unit.unitType === 'armor') && unit.embarkedOnCarrierUnitId) {
      logTrace('standingOrders generateOrdersForStandingOrders: embarked unit holds', { unitId: unit.id });
      continue;
    }
```

  In `expireAndUpdateStatus` the unit variable is the row's unit. Use the same condition and a trace line that names `expireAndUpdateStatus`. `logTrace` is already imported.

### Step 2: No suggested march for an embarked ground unit

Read `suggestApproachDestinationsForOrderlessUnits` in `src/main/tools/orderlessUnitSuggestions.ts` first.

- [x] In `src/main/tools/orderlessUnitSuggestions.test.ts`, add a test: an orderless infantry unit with `embarkedOnCarrierUnitId` set gets no entry in the returned map, once with an enemy visible and once with none.
- [x] Fix. In the `for (const unitId of unitIds)` loop, directly after `if (!unit) continue;`, add:

```ts
    if ((unit.unitType === 'infantry' || unit.unitType === 'armor') && unit.embarkedOnCarrierUnitId) {
      logTrace('orderlessUnitSuggestions suggestApproachDestinationsForOrderlessUnits: embarked unit omitted', { unitId: unit.id });
      continue;
    }
```

  `orderlessUnitSuggestions.ts` is 558 lines. This stays under 600. The file already imports the logger.

- [x] Run `rg -n "suggestedDestinationCell" src/main/tools` and read the function. It must print `—` for a unit with no suggestion. If it prints anything else, stop and report.

### Step 3: Confirm cargo at sea is already absent from Best Options

Read the `for (const unit of opponentUnits)` loop in `collectAggregatedPossibleActionRows` in `src/main/openRouter/possibleUnitActions.ts` first. It calls `getValidDestinations(unit, state)` with no debark flag. Read `computeValidDestinations` in `src/main/oneStepMoveDestinations.ts`. When the database is open and the unit is embarked, that function returns only the origin hex, and the current hex is then removed. `possibleUnitActions.ts` is already 612 lines. Do not add a `continue`, and do not import `canManualDebarkFromHex`. That function reads the database.

- [x] In `src/main/openRouter/possibleUnitActions.test.ts`, open a temp database the way `standingOrders.test.ts` does, insert a real transport assignment, and assert Best Options has no off-hex approach, advance, or move/melee row for that infantry on an open-water hex and on a coastal hex. If both assertions pass before any edit, leave `possibleUnitActions.ts` unchanged and say so.
- [x] Read `buildAdjacentCellsFallbackBlock` in `src/main/openRouter/promptText.ts`. It passes `assumeDebarkedForReachability` for embarked cargo. If it lists a neighbor for naval cargo that cannot debark, gate only a naval carrier, using `canManualDebarkAtHex` from `src/shared/sealiftEmbarkEligibility.ts` and the snapshot's hex, infrastructure, and control. Do not gate air cargo. If the fallback already lists nothing illegal, leave it and say so.

### Phase 1 verification

- [x] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/tools/standingOrders.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/tools/orderlessUnitSuggestions.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/possibleUnitActions.test.js`
- [x] `npm run check:circular` reports no new cycle.
- [x] Report which of the three fixes were applied and which tests passed without one.

## Phase 2: Lift Rules

Goal: R3. New file `src/main/operations/liftRules.ts`. This file imports nothing from the database, the terrain cache, or pathfinding.

### Step 1: Constants and one type

- [x] Add the three constants from the Constants table.
- [x] Add:

```ts
export interface LiftCity {
  readonly h3Index: string;
  readonly urbanHexCount: number;
  readonly inEnemyHome: boolean;
  readonly knownFortifiedCount: number;
}
```

### Step 2: `liftGroundCap`

- [x] `export function liftGroundCap(args: { readonly groundUnitCount: number; readonly committedCount: number; readonly hasCampaignPlan: boolean }): number`
  - `share` is `LIFT_MAX_GROUND_SHARE` when `hasCampaignPlan`, otherwise `LIFT_MAX_GROUND_SHARE_NO_CAMPAIGN`.
  - Return `Math.max(0, Math.floor(groundUnitCount * share) - committedCount)`.
  - `groundUnitCount` is every infantry and armor unit of the seat, aboard or not. `committedCount` is a count of distinct units the caller has already committed. This function does not merge embarked units with operation ids. `logTrace` the call. The snippet is the shape; write the orienting block.

### Step 3: `rankLiftCities`

- [x] `export function rankLiftCities(cities: readonly LiftCity[]): LiftCity[]` returns a copy sorted by `urbanHexCount` descending, then `h3Index` ascending with `<`. Ignore `inEnemyHome` and `knownFortifiedCount`. `logTrace` the call.

### Step 4: `fillShip`

- [x] `export function fillShip(candidates: readonly { readonly id: string; readonly unitType: string }[]): string[]`
  - Ignore every unit type other than infantry and armor. Return `[]` when none remain.
  - When at least two infantry are present, return the two infantry with the lowest ids.
  - Otherwise return one unit: infantry before armor, then the lowest id.
  - Compare ids with `<`, not `localeCompare`. `logTrace` the call.

### Step 5: `shipsNeeded`

- [x] `export function shipsNeeded(unitTypes: readonly string[]): number` returns the armor count plus `Math.ceil(infantryCount / 2)`. Ignore every other type. `logTrace` the call. An empty list returns 0.

### Step 6: Tests in `src/main/operations/liftRules.test.ts`

- [x] `liftGroundCap`: 8 units, none committed, with a campaign gives 2; without gives 4; 3 units with a campaign gives 0; the result is never negative.
- [x] `rankLiftCities`: larger first; equal sizes by hex id. The equal-size cities must differ in `inEnemyHome` and `knownFortifiedCount`. The input array is not changed.
- [x] `fillShip`: two infantry; three infantry returns the two lowest ids; one armor alone; one infantry and one armor gives the infantry even when the armor id is lower; a naval candidate is ignored; empty gives empty. Every result is accepted by `carrierAcceptsLandUnit('naval', ...)` from `src/shared/carrierCargoRules.ts`, added one unit at a time.
- [x] `shipsNeeded`: `['infantry','infantry','infantry','armor']` gives 3. An empty list gives 0. A naval entry does not add a ship.

### Phase 2 verification

- [x] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/liftRules.test.js`
- [x] `scripts/run-main-node-tests.cjs` walks `dist/main` for `*.test.js`, so the new directory needs no registration. Confirm with `node scripts/run-main-node-tests.cjs` that the new test file is run.

## Phase 3: Lift Terrain

Goal: R4, R5. New file `src/main/operations/liftTerrain.ts`. It reads a snapshot and the terrain cache. It does not read or write the database.

### Step 1: The helper

- [x] Export:

```ts
export interface LiftTerrain {
  readonly embarkLegal: (h3Index: string) => boolean;
  readonly debarkLegal: (h3Index: string) => boolean;
  readonly shipCanEnter: (h3Index: string) => boolean;
  readonly sailTurns: (fromH3: string, toH3: string) => number | null;
  readonly landingHexes: (cityH3: string) => readonly string[];
  readonly enemyUnitsWithin: (h3Index: string, radius: number) => number;
  readonly routeChecks: () => number;
}

export function buildLiftTerrain(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly landMass: LandMassByH3;
}): LiftTerrain
```

- [x] Rules:
  - Hex attributes: read `findNearestOpponentEmbarkHex` in `src/main/openRouter/briefingSectionsSealift.ts` first. Build `infraByHex`, `controlByHex`, and a map of `state.hexes` by id the same way. `embarkLegal` calls `canEmbarkAtHex` and `debarkLegal` calls `canManualDebarkAtHex`, both from `src/shared/sealiftEmbarkEligibility.ts`, with `nativeTerrain`, `terrainKind`, `hasSeaport`, and `hexControlledByPlayer` taken from those maps. A hex not on the map is `false`.
  - `lookup = navalLookupForHexState(args.state, args.state.hexes, args.state.strategicInfrastructure)` from `src/main/navalStrategicPath.ts`. Read its signature first.
  - `shipCanEnter(h3)` is `navalStrategicHexIsOccupiable(h3, lookup)`.
  - `sailTurns(from, to)`: 0 when the two are equal, and that call does not increment the counter. Otherwise `getNavalStrategicDistanceAndTurns({ originH3: from, destinationH3: to, lookup, movementBudget: getMovementBudget('naval') })?.estimatedTurns ?? null`. Count each call that is not the equal case, including a null result. `routeChecks()` returns the count. Do not log inside `sailTurns`; the naval helper already traces each search. `buildLiftTerrain` logs once at trace.
  - `landingHexes(cityH3)`: the city hex and its neighbours on the map for which `debarkLegal` and `shipCanEnter` are true, and either the hex is the city or `canLandUnitTraverseEdge(hex, cityH3, args.landMass)` is true. Get neighbours with `gridDisk(cityH3, 1)` inside a `try`/`catch` that logs with `logError` and returns `[]`, as `countNeighborTerrain` does. Return them sorted by hex id with `<`.
  - `enemyUnitsWithin(h3, radius)`: the number of `state.units` whose `player !== args.seatId` and for which `isWithinGridRangePure(h3, unit.h3Index, radius)` is true. Neutral units count.

### Step 2: Tests in `src/main/operations/liftTerrain.test.ts`

Read `src/main/openRouter/campaignObjectiveFlow.test.ts` first for the cast-snapshot style only. That file uses a fake hex id and no land mass. `gridDisk` and naval search need real H3 cells. Take one on-map cell that does not cross the antimeridian, then `gridDisk` from it. Build a small `LandMassByH3` in the test. A city record used as a traverse destination must have `waterPct` below `STRATEGIC_LAND_MAX_WATER_PCT` and must share a continent or island id with the beach.

- [x] A coastal hex is embark-legal, debark-legal, and ship-occupiable. An inland hex without a seaport is none of the three. A water seaport is embark-legal and debark-legal only when the seat controls it, and neither when another seat controls it.
- [x] `sailTurns` between two water hexes four edges apart is 2. The origin is not a land seaport, and `getMovementBudget('naval')` is 2. Between a hex and itself it is 0 and does not raise `routeChecks`. To an inland hex that is on the snapshot but not occupiable it is `null`, and that call does raise `routeChecks`.
- [x] `landingHexes` of a coastal city includes the city and excludes an inland neighbour. An inland city is excluded. A coastal neighbour of that inland city is included when `canLandUnitTraverseEdge` from the neighbour to the city is true.
- [x] `enemyUnitsWithin` counts a neutral unit and does not count the seat's own. Radius 0 counts a unit on that hex. A unit on an unmeasurable hex does not throw and is not counted.
- [x] A snapshot with no `strategicInfrastructure` and no `strategicControl` does not throw. Read those arrays with `?? []`.

### Phase 3 verification

- [x] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/liftTerrain.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/liftRules.test.js`

## Phase 4: Documentation and Final Verification

- [x] `doc/README.md`: one sentence beside the campaign constants, naming `LIFT_OBJECTIVE_CLEAR_RADIUS`, `LIFT_MAX_GROUND_SHARE`, and `LIFT_MAX_GROUND_SHARE_NO_CAMPAIGN` in `src/main/operations/liftRules.ts`. Do not edit `doc/hybrid-ai.md`. Nothing in the consult reads these constants yet.
- [x] `doc/combat-rules-v3.md` §9.2: add that a standing order does not move embarked infantry or armor and does not advance that order, and that `explicit_move`, `disembark`, and an air drop still unload. Keep the sentence that a non-human movement order off the carrier still auto-debarks. Add this only if Step 1 applied its fix.
- [x] `doc/ai-commander-prompts/source-inventory.md` §5.2: one row that an embarked ground unit has no Suggested Destination. Add it only if Step 2 applied its fix. Do not change prompt wording.
- [x] `node scripts/check-doc-links.cjs` passes.
- [x] `npm test` passes.
- [x] `npm run check:circular` reports no new cycle.
- [x] `rg -n "Phase [0-9]|Step [0-9]|\bR[0-9]+\b" src doc` shows no hit introduced by this change.
- [x] No file touched here crossed 600 lines that was under it before.

## Out of Scope

- Stored operations, the engine running a landing, and any prompt text. Those start in plan 2.
- A test that resolves a whole strategic turn. No existing test drives `executeReadyStrategicTurn`, and this plan does not build that harness.
- Until plan 2, embarked cargo stays aboard except through `explicit_move`, `disembark`, an air drop, or the existing auto-debark when some other order moves it.
