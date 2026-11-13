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

Plan 0 must be complete before this plan starts. This plan uses its `countNeighborTerrain` helper.

## Why This Change

In a 250-turn AI-only match on the global map, no commander used sealift and none was seen using airlift. Oceans separate most home regions on the global map, so lift is often the only way to reach an enemy.

The design the user chose: the commander picks an objective, and the engine runs the sequence of orders that gets units there (muster, load, sail, land, assault). The commander does not re-issue each step. This plan removes the engine behaviours that would break any such sequence, and adds the small shared rules the later plans build on.

No match log was available. The causes below are a reading of the code, so each fix starts with a test that must fail first.

| Cause | Where |
|-------|-------|
| An embarked AI ground unit unloads as soon as any move order names a hex other than its carrier's hex. A standing march or a defend walk-back produces such an order every turn. The user confirmed unloading must be intentional. | `autoDebarkNonHumanLandUnitIfMovingIndependently` in `src/main/gameActions/sealift.ts`; `generateOrdersForStandingOrders` in `src/main/tools/standingOrdersGeneration.ts` has no embarked check |
| An embarked ground unit with no standing order is listed in Units Without Standing Orders with a march as its Suggested Destination. | `suggestApproachDestinationsForOrderlessUnits` in `src/main/tools/orderlessUnitSuggestions.ts` |
| Best Options may list a one-step move for cargo at sea. An `explicit_move` unloads. | `collectAggregatedPossibleActionRows` in `src/main/openRouter/possibleUnitActions.ts` |

## Requirements

| Id | Requirement |
|----|-------------|
| R1 | A ground unit aboard a ship or an aircraft stays aboard until a `disembark`, an `explicit_move`, an air drop, or the engine unloads it. Standing orders do not move it. |
| R2 | The briefing never suggests a march or a one-step move for an embarked ground unit whose carrier is not at a hex where it may unload. |
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
- When a step says "read first", open the named function before editing. If it does not do what this plan says, stop and report.
- Distances between hexes use `computeGridDistanceWithPathFallbackPure` or `isWithinGridRangePure` from `src/shared/h3GridRangePure.ts`. Never call `gridDistance` from `h3-js` directly; it throws across the antimeridian.
- Sort unit ids and hex ids with `<` on the strings, not with `localeCompare`.

## Phase 1: Embarked Units Stay Aboard

Goal: R1, R2. Each step writes the test first. If a test passes before the fix, do not apply that fix; say so in the report and go on.

### Step 1: Standing orders do not move an embarked ground unit

Read `generateOrdersForStandingOrders` in `src/main/tools/standingOrdersGeneration.ts` first.

- [ ] In `src/main/tools/standingOrders.test.ts`, which already calls `generateOrdersForStandingOrders` against a database, add a test: an AI seat's infantry has a `march` to a hex two steps away, and the snapshot gives it `embarkedOnCarrierUnitId` naming a naval unit on its hex. Assert that `movementOrders` has no entry for the infantry.
- [ ] Add the same test for a `defend` order whose `defendHex` is not the unit's hex.
- [ ] In the first test, also give the naval unit a `march` and assert it still yields a movement order.
- [ ] Fix. In the `for (const row of rows)` loop, directly after `if (!unit) continue;`, add:

```ts
    if ((unit.unitType === 'infantry' || unit.unitType === 'armor') && unit.embarkedOnCarrierUnitId) {
      logTrace('standingOrders generateOrdersForStandingOrders: embarked unit holds', { unitId: unit.id });
      continue;
    }
```

### Step 2: No suggested march for an embarked ground unit

Read `suggestApproachDestinationsForOrderlessUnits` in `src/main/tools/orderlessUnitSuggestions.ts` first.

- [ ] In `src/main/tools/orderlessUnitSuggestions.test.ts`, add a test: an orderless infantry unit with `embarkedOnCarrierUnitId` set gets no entry in the returned map, once with an enemy visible and once with none.
- [ ] Fix. In the `for (const unitId of unitIds)` loop, directly after `if (!unit) continue;`, add:

```ts
    if ((unit.unitType === 'infantry' || unit.unitType === 'armor') && unit.embarkedOnCarrierUnitId) continue;
```

- [ ] Run `rg -n "suggestedDestinationCell" src/main/tools` and read the function. It must print `—` for a unit with no suggestion. If it prints anything else, stop and report.

### Step 3: No one-step move row for cargo that cannot unload

Read the `for (const unit of opponentUnits)` loop in `collectAggregatedPossibleActionRows` in `src/main/openRouter/possibleUnitActions.ts` first.

- [ ] In `src/main/openRouter/possibleUnitActions.test.ts`, add a strategic test: an infantry unit embarked on a ship that stands on an open-water hex gets no approach, advance, or move/melee row.
- [ ] Add a second test: the same unit on a ship at a coastal hex beside an enemy city still gets its move/melee row. If this test fails before any change, the briefing does not list landing moves today; delete the test, say so in the report, and do not change the code to make it pass.
- [ ] Fix, only if the first test fails. Directly after `if (isMissileUnitType(unit.unitType)) continue;` add:

```ts
    if (
      !tacticalBattle &&
      (unit.unitType === 'infantry' || unit.unitType === 'armor') &&
      unit.embarkedOnCarrierUnitId &&
      !canManualDebarkFromHex(unit.h3Index, ownSeat)
    ) {
      continue;
    }
```

  Import `canManualDebarkFromHex` from `../gameActions/sealift`. Run `npm run check:circular`. If the import creates a new cycle, remove it, stop, and report.

### Phase 1 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/tools/standingOrders.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/tools/orderlessUnitSuggestions.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/possibleUnitActions.test.js`
- [ ] `npm run check:circular` reports no new cycle.
- [ ] Report which of the three fixes were applied and which tests passed without one.

## Phase 2: Lift Rules

Goal: R3. New file `src/main/operations/liftRules.ts`. This file imports nothing from the database, the terrain cache, or pathfinding.

### Step 1: Constants and one type

- [ ] Add the three constants from the Constants table.
- [ ] Add:

```ts
export interface LiftCity {
  readonly h3Index: string;
  readonly urbanHexCount: number;
  readonly inEnemyHome: boolean;
  readonly knownFortifiedCount: number;
}
```

### Step 2: `liftGroundCap`

- [ ] `export function liftGroundCap(args: { readonly groundUnitCount: number; readonly committedCount: number; readonly hasCampaignPlan: boolean }): number`
  - `share` is `LIFT_MAX_GROUND_SHARE` when `hasCampaignPlan`, otherwise `LIFT_MAX_GROUND_SHARE_NO_CAMPAIGN`.
  - Return `Math.max(0, Math.floor(groundUnitCount * share) - committedCount)`.
  - `groundUnitCount` is every infantry and armor unit of the seat, aboard or not. `committedCount` is those already aboard a carrier or already assigned to an operation.

### Step 3: `rankLiftCities`

- [ ] `export function rankLiftCities(cities: readonly LiftCity[]): LiftCity[]` returns a copy sorted by `urbanHexCount` descending, then `h3Index` ascending.

### Step 4: `fillShip`

- [ ] `export function fillShip(candidates: readonly { readonly id: string; readonly unitType: string }[]): string[]`
  - Return `[]` when there is no candidate.
  - When at least two infantry are present, return the two infantry with the lowest ids.
  - Otherwise return the single unit with the lowest id, infantry before armor.

### Step 5: `shipsNeeded`

- [ ] `export function shipsNeeded(unitTypes: readonly string[]): number` returns the armor count plus `Math.ceil(infantryCount / 2)`.

### Step 6: Tests in `src/main/operations/liftRules.test.ts`

- [ ] `liftGroundCap`: 8 units, none committed, with a campaign gives 2; without gives 4; 3 units with a campaign gives 0; the result is never negative.
- [ ] `rankLiftCities`: larger first; equal sizes by hex id; the input array is not changed.
- [ ] `fillShip`: two infantry; one armor alone; one infantry and one armor gives the infantry; empty gives empty. Every result is accepted by `carrierAcceptsLandUnit('naval', ...)` from `src/shared/carrierCargoRules.ts`, added one unit at a time.
- [ ] `shipsNeeded`: `['infantry','infantry','infantry','armor']` gives 3.

### Phase 2 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/liftRules.test.js`
- [ ] `scripts/run-main-node-tests.cjs` walks `dist/main` for `*.test.js`, so the new directory needs no registration. Confirm with `node scripts/run-main-node-tests.cjs` that the new test file is run.

## Phase 3: Lift Terrain

Goal: R4, R5. New file `src/main/operations/liftTerrain.ts`. It reads a snapshot and the terrain cache. It does not read or write the database.

### Step 1: The helper

- [ ] Export:

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

- [ ] Rules:
  - Hex attributes: read `findNearestOpponentEmbarkHex` in `src/main/openRouter/briefingSectionsSealift.ts` first. Build `infraByHex`, `controlByHex`, and a map of `state.hexes` by id the same way. `embarkLegal` calls `canEmbarkAtHex` and `debarkLegal` calls `canManualDebarkAtHex`, both from `src/shared/sealiftEmbarkEligibility.ts`, with `nativeTerrain`, `terrainKind`, `hasSeaport`, and `hexControlledByPlayer` taken from those maps. A hex not on the map is `false`.
  - `lookup = navalLookupForHexState(args.state, args.state.hexes, args.state.strategicInfrastructure)` from `src/main/navalStrategicPath.ts`. Read its signature first.
  - `shipCanEnter(h3)` is `navalStrategicHexIsOccupiable(h3, lookup)`.
  - `sailTurns(from, to)`: 0 when the two are equal. Otherwise `getNavalStrategicDistanceAndTurns({ originH3: from, destinationH3: to, lookup, movementBudget: getMovementBudget('naval') })?.estimatedTurns ?? null`. Count each call that is not the equal case; `routeChecks()` returns the count.
  - `landingHexes(cityH3)`: the city hex and its neighbours on the map for which `debarkLegal` and `shipCanEnter` are true, and either the hex is the city or `canLandUnitTraverseEdge(hex, cityH3, args.landMass)` is true. Get neighbours with `gridDisk(cityH3, 1)` inside a `try`/`catch` that logs with `logError` and returns `[]`, as `countNeighborTerrain` does. Return them sorted by hex id.
  - `enemyUnitsWithin(h3, radius)`: the number of `state.units` whose `player !== args.seatId` and for which `isWithinGridRangePure(h3, unit.h3Index, radius)` is true. Neutral units count.

### Step 2: Tests in `src/main/operations/liftTerrain.test.ts`

Read `src/main/openRouter/campaignObjectiveFlow.test.ts` first and reuse its way of building a snapshot and a land mass.

- [ ] A coastal hex is embark-legal and debark-legal. An inland hex without a seaport is neither. A water seaport is embark-legal only when the seat controls it.
- [ ] `sailTurns` between two water hexes four steps apart is 2. Between a hex and itself it is 0 and does not raise `routeChecks`. To an inland hex it is `null`.
- [ ] `landingHexes` of a coastal city includes the city and excludes an inland neighbour.
- [ ] `enemyUnitsWithin` counts a neutral unit and does not count the seat's own.
- [ ] A snapshot with no `strategicInfrastructure` and no `strategicControl` does not throw.

### Phase 3 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/liftTerrain.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/liftRules.test.js`

## Phase 4: Documentation and Final Verification

- [ ] `doc/combat-rules-v3.md`, in the sealift section: add one sentence that a standing order does not move an embarked ground unit, and that `explicit_move`, `disembark`, and an air drop unload it. Add it only if Phase 1 Step 1 applied its fix.
- [ ] `doc/ai-commander-prompts/source-inventory.md`: under the engine-versus-copy gaps, record that an embarked ground unit gets no Suggested Destination. Add it only if Phase 1 Step 2 applied its fix.
- [ ] `node scripts/check-doc-links.cjs` passes.
- [ ] `npm test` passes.
- [ ] `npm run check:circular` reports no new cycle.
- [ ] `rg -n "Phase [0-9]|Step [0-9]|\bR[0-9]+\b" src doc` shows no hit introduced by this change.
- [ ] No file touched here crossed 600 lines that was under it before.

## Out of Scope

- Stored operations, the engine running a landing, and any prompt text. Those start in plan 2.
- A test that resolves a whole strategic turn. No existing test drives `executeReadyStrategicTurn`, and this plan does not build that harness.
