# Lift Operations: Execution Plan

This plan makes the AI commander move ground units by ship and by aircraft. It is the companion to `2026-11-13-logistics-commander-execution-plan.md`. Finish that plan first: this one uses its `additionalAttention` field and its `countNeighborTerrain` helper.

## Why This Change

In a 250-turn AI-only match on the global map, no commander used sealift, and none was seen using airlift. Naval units are how a side flanks an enemy, by fire support or by carrying units to a vulnerable hex. On the global map oceans separate most home regions, so lift is the only way to reach the enemy at all.

No match log was available. The causes below are a reading of the code. Phase 1 turns the three engine causes into tests before fixing them.

| Cause | Where |
|-------|-------|
| Nothing proposes a lift. Best Options has no embark or landing row, and the campaign is land-only: a target must be within 12 land steps and embarked units are left out of the plan. | `BEST_OPTIONS_ACTION_DISPLAY_ORDER` in `src/main/openRouter/possibleUnitActionsTableAssembly.ts`; `chooseCampaignTarget` in `campaignTargetSelection.ts`; `campaignInputsFromState` in `campaignObjectiveFlow.ts` |
| An embarked AI ground unit unloads as soon as any move order names a hex other than its carrier's hex. A standing march or a defend walk-back produces such an order every turn. | `autoDebarkNonHumanLandUnitIfMovingIndependently` in `src/main/gameActions/sealift.ts`, called from `readyStrategicResolutionPipeline.ts`; `generateOrdersForStandingOrders` in `src/main/tools/standingOrdersGeneration.ts` has no embarked check |
| An embarked ground unit with no standing order is listed in Units Without Standing Orders with a march as its Suggested Destination. The commander is told to assign it. | `suggestApproachDestinationsForOrderlessUnits` in `src/main/tools/orderlessUnitSuggestions.ts` |
| An air unit has one action per turn, and the coaching tells the commander to copy every listed air-strike row. A drop loses to a strike. | `tempoBullet` and `IDLE_AIR_BULLET` in `promptSpec/coachingTextStrategic.ts` |
| A ship and the units it should carry are never brought to the same hex. Embark needs both on one hex. | `applyEmbarkOrdersForPlayer` in `sealift.ts` |

## Requirements

| Id | Requirement |
|----|-------------|
| R1 | A ground unit aboard a ship or an aircraft stays aboard until the commander gives it a `disembark`, an `explicit_move`, or an air drop. Standing orders do not move it. |
| R2 | The briefing never suggests a march or a one-step move for an embarked ground unit whose carrier is not at a hex where it may unload. |
| R3 | Each strategic consult, the engine picks a sea objective and an air objective when one exists: an enemy city with no enemy unit nearby that a ship or an aircraft can reach. |
| R4 | The briefing prints a Lift Objective section with a Lift Orders table. Each row names one unit and one order: embark, sail, disembark, ferry, or drop. |
| R5 | Empty ships sail to ground units waiting at a hex where embark is legal. Loaded ships sail to a landing hex beside the objective. Cargo disembarks onto the objective. |
| R6 | A chosen air unit loads one infantry unit, ferries to a controlled airport within drop range of the objective when it is not already in range, and drops it. |
| R7 | The lift never takes a home defender or a unit in contact with the enemy, and never takes more than a fixed share of the ground force. |
| R8 | The system prompt explains how to copy each kind of Lift Orders row, and says that a lift row for an air unit replaces its air strike that turn. |
| R9 | It works on the global map and on every regional map, with fog on or off, with two or more seats, and with or without a campaign plan. |
| R10 | The tactical prompt is unchanged, character for character. |
| R11 | Living docs match the builders in the same change. |

## Decisions Already Made

Do not reopen these.

- The engine proposes the objective and the orders. The commander copies them or ignores them. The user confirmed this.
- The sea objective is the largest known enemy city with no enemy unit within 2 hexes that a ship can reach. When none exists it falls back to the campaign target, when that target has a reachable landing hex. The user confirmed this.
- The lift plan is stateless. It is recomputed from the snapshot each consult. Nothing is stored in the database. A ship keeps its course because its landing is a standing march, and a row prints only when the stored order differs from the one wanted.
- Stopping standing orders from moving an embarked ground unit is a defect fix, not a rule change. `explicit_move` and `disembark` still unload, as the prompt already says.
- Ships move to the troops. A ground unit is never told to march to a port.
- A ship with an enemy unit inside naval range stays in the fight and is not sent to pick up cargo.
- The air objective must hold no enemy unit and no known fortification. One infantry unit dropped onto a defended city is lost.
- Only a ground unit with no standing order, or with a `defend` on its own hex, is lifted. In a land campaign that means newly built units at a port. Marching campaign units are left alone.
- A unit with a Lift Orders row gets no Campaign Orders row and no Suggested Destination that turn. Two tables never name different orders for one unit.
- Lift rows are a table in their own section, not rows in Best Options. `possibleUnitActions.ts` and `possibleUnitActionsTableAssembly.ts` are over 600 lines and get one guard between them.
- The lift needs standing orders to be enabled, like the campaign. With orders disabled there is no Lift Objective section.
- No unit, range, capacity, or movement rule changes.

## Constants

All new, all in `src/main/openRouter/liftRules.ts`.

| Name | Value | Meaning |
|------|-------|---------|
| `LIFT_OBJECTIVE_CLEAR_RADIUS` | 2 | No enemy unit may be within this many hexes of a sea objective. |
| `LIFT_OBJECTIVE_CANDIDATE_LIMIT` | 5 | Cities tested for a sea route before giving up. Bounds pathfinding. |
| `LIFT_MAX_GROUND_SHARE` | 0.25 | Largest share of ground units aboard carriers when a campaign plan exists. |
| `LIFT_MAX_GROUND_SHARE_NO_CAMPAIGN` | 0.5 | The same share when there is no campaign plan. |
| `LIFT_AIR_UNITS_PER_SIZE` | 1 | Air units used for lift at once, times `GAME_SIZE_MULTIPLIER`. |

Existing values used, never retyped: `getMovementBudget('naval')`, `getRange('naval')`, `AIR_STRIKE_RANGE_HEXES`, `CAMPAIGN_CONTACT_RADIUS`, `GAME_SIZE_MULTIPLIER`.

The ground share scales with game size on its own, because the unit caps do.

## Rules for the Implementing Agent

Read these before Phase 1. They apply to every phase.

- Never commit or push.
- Source files under `src/` use CRLF line endings. Keep CRLF when you edit them. `.spec` files may stay LF.
- Do not put plan words in code, comments, test names, or docs: no "Phase", "Step", "R1", and so on.
- Every new or changed function, constant, and interface field needs an orienting comment block with at least 5 non-empty lines: a summary line, then `Purpose:` (or `Contract:` on interface fields), `When to use:`, `Expected outcome:`, `Exceptions:`. ESLint rule `orienting-comments/require-orienting-block` enforces this.
- Logging: `logDebug` for a per-consult decision, `logTrace` for a lookup or a per-unit check, `logError` for every caught exception.
- Mark every new binding `const` and every new interface field `readonly`.
- No function takes more than 6 named arguments. Use one `args` object.
- Tests cover happy paths and essential failure cases only. Never delete a content assertion. Never replace an assertion with `assert.ok(true)`.
- PowerShell does not support `&&`. Chain commands with `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`.
- If a database test fails with a `NODE_MODULE_VERSION` error, run `npm run rebuild:native:node` once, then rerun it.
- When a step says "replace", replace exactly the quoted text. If it is not found, stop and report.
- When a step says "read first", open the named function before editing. If it does not do what this plan says, stop and report.
- Distances between hexes use `computeGridDistanceWithPathFallbackPure` or `isWithinGridRangePure` from `src/shared/h3GridRangePure.ts`. Never call `gridDistance` from `h3-js` directly; it throws across the antimeridian.
- Numbers in prompt text come from the named constant or helper.
- Sort unit ids and hex ids with `<` on the strings, not with `localeCompare`.

## Phase 1: Embarked Units Stay Aboard

Goal: R1, R2. Each step writes the test first. If a test passes before the fix, do not apply that fix; record it in the report and go on.

### Step 1: Standing orders do not move an embarked ground unit

Read `generateOrdersForStandingOrders` in `src/main/tools/standingOrdersGeneration.ts` first.

- [ ] In `src/main/tools/standingOrders.test.ts`, which already calls `generateOrdersForStandingOrders` against a database, add a test: an AI seat's infantry has a `march` to a hex two steps away and a row in `unit_transport_assignments` naming a naval unit on its hex. Call `generateOrdersForStandingOrders`. Assert that `movementOrders` has no entry for the infantry.
- [ ] Add the same test for a `defend` order whose `defendHex` is not the unit's hex.
- [ ] Fix. In the `for (const row of rows)` loop, directly after `if (!unit) continue;`, add:

```ts
    if ((unit.unitType === 'infantry' || unit.unitType === 'armor') && unit.embarkedOnCarrierUnitId) {
      logTrace('standingOrders generateOrdersForStandingOrders: embarked unit holds', { unitId: unit.id });
      continue;
    }
```

  If `logTrace` is not imported in that file, add it to the existing `../logger` import.
- [ ] Confirm the naval unit's own march still generates a move: add an assertion to the first test that a `march` on the naval unit yields a movement order for it.

### Step 2: No suggested march for an embarked ground unit

Read `suggestApproachDestinationsForOrderlessUnits` in `src/main/tools/orderlessUnitSuggestions.ts` first.

- [ ] In `src/main/tools/orderlessUnitSuggestions.test.ts`, add a test: an orderless infantry unit with `embarkedOnCarrierUnitId` set gets no entry in the returned map, with an enemy visible and with none visible.
- [ ] Fix. In the `for (const unitId of unitIds)` loop, directly after `if (!unit) continue;`, add:

```ts
    if ((unit.unitType === 'infantry' || unit.unitType === 'armor') && unit.embarkedOnCarrierUnitId) continue;
```

- [ ] Confirm the Units Without Standing Orders table prints `—` for that unit: `rg -n "suggestedDestinationCell" src/main/tools` and read the function. If it prints anything else for a missing suggestion, stop and report.

### Step 3: No one-step move row for cargo that cannot unload

Read the `for (const unit of opponentUnits)` loop in `collectAggregatedPossibleActionRows` in `src/main/openRouter/possibleUnitActions.ts` first.

- [ ] In `src/main/openRouter/possibleUnitActions.test.ts`, add a strategic test: an infantry unit embarked on a ship that stands on an open-water hex gets no approach, advance, or move/melee row.
- [ ] Add a second test: the same unit on a ship at a coastal hex beside an enemy city still gets its move/melee row. An `explicit_move` there is how cargo lands.
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

  Import `canManualDebarkFromHex` from `../gameActions/sealift`. Run `npm run check:circular` after this import. If it creates a new cycle, stop and report.

### Step 4: No end-to-end test

No existing test resolves a full strategic turn through `executeReadyStrategicTurn`. Do not build that harness here. The run in Phase 7 counts the `sealift autoDebarkNonHumanLandUnitIfMovingIndependently` log line instead.

### Phase 1 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/tools/standingOrders.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/tools/orderlessUnitSuggestions.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/possibleUnitActions.test.js`
- [ ] `npm run check:circular` reports no new cycle.
- [ ] Report which of the three fixes were applied and which tests passed without one.

## Phase 2: Lift Rules

Goal: the pure selection rules for R3, R5, R6, R7. New file `src/main/openRouter/liftRules.ts`. No database, no pathfinding, no terrain cache in this file; callers pass functions in.

### Step 1: Types and constants

- [ ] Add the five constants from the Constants table.
- [ ] Add:

```ts
export type LiftOrderKind = 'embark' | 'sail' | 'disembark' | 'ferry' | 'drop';

export interface LiftOrderRow {
  readonly unitId: string;
  readonly unitType: string;
  readonly kind: LiftOrderKind;
  /** Carrier unit id for `embark`; hex id for every other kind. */
  readonly target: string;
}

export interface LiftPlan {
  readonly seaObjectiveH3: string | null;
  readonly seaObjectiveIsCampaignTarget: boolean;
  readonly airObjectiveH3: string | null;
  readonly rows: readonly LiftOrderRow[];
}

export interface LiftCity {
  readonly h3Index: string;
  readonly urbanHexCount: number;
  readonly knownFortifiedCount: number;
}
```

### Step 2: `liftGroundCap`

- [ ] `export function liftGroundCap(args: { readonly groundUnitCount: number; readonly aboardCount: number; readonly hasCampaignPlan: boolean }): number`
  - `share` is `LIFT_MAX_GROUND_SHARE` when `hasCampaignPlan`, otherwise `LIFT_MAX_GROUND_SHARE_NO_CAMPAIGN`.
  - Return `Math.max(0, Math.floor(groundUnitCount * share) - aboardCount)`.
  - `groundUnitCount` counts every infantry and armor unit of the seat, aboard or not. `aboardCount` counts those aboard any carrier.

### Step 3: `rankLiftCities`

- [ ] `export function rankLiftCities(cities: readonly LiftCity[]): LiftCity[]` returns a copy sorted by `urbanHexCount` descending, then `h3Index` ascending.

### Step 4: `chooseSeaObjective`

- [ ] Signature:

```ts
export function chooseSeaObjective(args: {
  readonly cities: readonly LiftCity[];
  readonly isClear: (cityH3: string) => boolean;
  readonly hasReachableLanding: (cityH3: string) => boolean;
  readonly campaignTargetH3: string | null;
}): { readonly h3Index: string; readonly isCampaignTarget: boolean } | null
```

  - Take `rankLiftCities(cities)`, keep those for which `isClear` is true, take the first `LIFT_OBJECTIVE_CANDIDATE_LIMIT`, and return the first for which `hasReachableLanding` is true, with `isCampaignTarget: false`.
  - Otherwise, when `campaignTargetH3` is not null and `hasReachableLanding(campaignTargetH3)` is true, return it with `isCampaignTarget: true`.
  - Otherwise return `null`.
  - `hasReachableLanding` is called at most `LIFT_OBJECTIVE_CANDIDATE_LIMIT + 1` times. Test this.

### Step 5: `chooseAirObjective`

- [ ] Signature:

```ts
export function chooseAirObjective(args: {
  readonly cities: readonly LiftCity[];
  readonly isEmpty: (cityH3: string) => boolean;
  readonly launchAirportFor: (cityH3: string) => string | null;
}): { readonly h3Index: string; readonly launchAirportH3: string } | null
```

  - Take `rankLiftCities(cities)`, keep those with `knownFortifiedCount === 0` and `isEmpty` true, and return the first for which `launchAirportFor` is not null.

### Step 6: `fillShip`

- [ ] `export function fillShip(candidates: readonly { readonly id: string; readonly unitType: string }[], remaining: number): string[]`
  - `candidates` are the eligible ground units on the ship's hex. `remaining` is what is left of the ground cap.
  - Return `[]` when `remaining <= 0` or there is no candidate.
  - When at least two infantry are present and `remaining >= 2`, return the two infantry with the lowest ids.
  - Otherwise return the single unit with the lowest id, infantry before armor.
  - Check the result with `carrierAcceptsLandUnit('naval', ...)` from `src/shared/carrierCargoRules.ts` in a test, so the rule and the capacity cannot drift apart.

### Step 7: Tests in `src/main/openRouter/liftRules.test.ts`

- [ ] `liftGroundCap`: 8 ground units, none aboard, with a campaign gives 2; without gives 4; 3 units with a campaign gives 0; a result is never negative.
- [ ] `chooseSeaObjective`: picks the largest clear city with a landing; skips a larger city that is not clear; falls back to the campaign target; returns `null` when nothing qualifies; calls `hasReachableLanding` at most six times with ten clear cities.
- [ ] `chooseAirObjective`: skips a fortified city and an occupied city.
- [ ] `fillShip`: two infantry; one armor alone; one infantry when `remaining` is 1; nothing when `remaining` is 0. Every result is accepted by `carrierAcceptsLandUnit`.

### Phase 2 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/liftRules.test.js`

## Phase 3: Lift Plan From the Snapshot

Goal: R3 through R7 and R9. New file `src/main/openRouter/liftPlanFlow.ts`. This file may read the database and the terrain cache, as `campaignObjectiveFlow.ts` does.

### Step 1: Entry point

- [ ] Signature:

```ts
export function liftPlanForState(args: {
  readonly state: GameStateSnapshot;
  readonly campaignPlan: CampaignPlan | null;
  readonly latLngByH3: Map<string, LatLng>;
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
}): LiftPlan | null
```

- [ ] Return `null`, with a `logTrace` naming the reason, when: `state.playerPerspective` is not an AI seat (`isAiSeatId`, as `campaignPlanForState` checks); the seat has no naval unit and no air unit; or `loadCampaignLandMass(seatId)` returns `null`.
- [ ] Wrap the body in `try`/`catch`. On a throw, `logError('liftPlanFlow: lift plan failed; no lift this consult', { seatId }, err)` and return `null`. A failed lift plan must never fail the consult.
- [ ] At the end, `logDebug('liftPlanFlow liftPlanForState', { seatId, seaObjective, airObjective, rowCount, routeChecks })`, where `routeChecks` counts calls to the naval distance function.

### Step 2: Shared inputs

Build each once.

- [ ] `inputs = campaignInputsFromState(state, landMass)` from `campaignObjectiveFlow.ts`. Use `inputs.cities` as the known enemy cities; map each to a `LiftCity`. This already handles fog and three or more seats.
- [ ] `enemyUnitHexes`: the hex of every unit whose `player !== seatId`. Neutral units count.
- [ ] `isClear(cityH3)`: no entry of `enemyUnitHexes` satisfies `isWithinGridRangePure(cityH3, hex, LIFT_OBJECTIVE_CLEAR_RADIUS)`.
- [ ] `isEmpty(cityH3)`: no entry of `enemyUnitHexes` equals `cityH3`.
- [ ] Hex attributes for embark and debark: mirror `findNearestOpponentEmbarkHex` in `briefingSectionsSealift.ts`, which builds `infraByHex` and `controlByHex` from the snapshot and calls `canEmbarkAtHex`. Add two local functions, `embarkLegal(h3)` and `debarkLegal(h3)`, that call `canEmbarkAtHex` and `canManualDebarkAtHex` from `src/shared/sealiftEmbarkEligibility.ts` with those attributes.
- [ ] Naval routing: `lookup = navalLookupForHexState(state, state.hexes, state.strategicInfrastructure)` and `sailTurns(fromH3, toH3)` that returns `getNavalStrategicDistanceAndTurns({ originH3: fromH3, destinationH3: toH3, lookup, movementBudget: getMovementBudget('naval') })?.estimatedTurns ?? null`, both from `src/main/navalStrategicPath.ts`. Read both signatures first. Return 0 when the two hexes are equal.
- [ ] `landingHexes(cityH3)`: the city hex and its six neighbours that are on the map, for which `debarkLegal` is true, `navalStrategicHexIsOccupiable(h3, lookup)` is true, and either `h3 === cityH3` or `canLandUnitTraverseEdge(h3, cityH3, landMass)` is true. Get neighbours the way `countNeighborTerrain` does.
- [ ] Stored marches: read the seat's `standing_orders` rows as `buildCampaignOrderRows` in `src/main/tools/standingOrdersInjectionText.ts` does, and build `storedMarchH3ByUnitId` for rows whose `order_type` is `march`.
- [ ] Protected units: `campaignPlan?.defenderUnitIds ?? []`, plus every own ground unit with an enemy unit within `CAMPAIGN_CONTACT_RADIUS`.
- [ ] Eligible ground units: own infantry and armor that are not embarked, are not protected, and whose stored standing order is either absent or a `defend` whose post is the unit's own hex. Resolve the post with `resolveDefendPostH3` from `src/main/tools/standingOrdersDefendPost.ts`. A unit on a march is never lifted: its march would resume after it lands. A unit defending its own hex is safe, because `moveDefendPostsToExplicitMoveDestinations` moves the post to the hex it disembarks onto.
- [ ] `remaining = liftGroundCap({ groundUnitCount, aboardCount, hasCampaignPlan: campaignPlan !== null })`. Every embark row added below lowers `remaining` by one.

### Step 3: Sea rows

Skip this step when the seat has no naval unit. Walk ships in id order.

- [ ] Sea objective: `chooseSeaObjective` with `hasReachableLanding(cityH3)` true when some hex of `landingHexes(cityH3)` has a non-null `sailTurns` from the first ship in id order. `campaignTargetH3` is `campaignPlan?.objective.targetH3 ?? null`.
- [ ] When the sea objective is `null`, add no sea row.
- [ ] A ship with cargo:
  - When the ship's hex is in `landingHexes(objective)`: one `disembark` row per cargo unit, `target` the objective hex.
  - Otherwise choose a landing with `chooseNeutralLandingTarget` from `src/main/gameActions/neutralLanding.ts`: `candidates` are `landingHexes(objective)` with `occupiedBySeat` true when an enemy unit stands there; `gridDistance` is `computeGridDistanceWithPathFallbackPure`; `navalMovesPerTurn` is `getMovementBudget('naval')`; `sailingTurns` is `(to) => sailTurns(shipH3, to)`. When it returns a hex and `storedMarchH3ByUnitId.get(ship.id)` is not that hex, add a `sail` row for the ship with that hex as `target`. When it returns `null`, add no row.
- [ ] A ship without cargo, when `remaining > 0`:
  - Skip it when an enemy unit is within `getRange('naval')` of it.
  - When `embarkLegal(shipH3)` and `fillShip(eligible units on shipH3, remaining)` is not empty: one `embark` row per returned unit, `target` the ship's id. Remove those units from the eligible list.
  - Otherwise find a pickup hex: among hexes that hold at least one eligible unit, are `embarkLegal`, are `navalStrategicHexIsOccupiable`, and are not already claimed by an earlier ship, take the one with the fewest `sailTurns` from the ship, then the lowest hex id. When one exists and the ship's stored march is not that hex, add a `sail` row and mark the hex claimed.

### Step 4: Air rows

Skip this step when the seat has no air unit. `airCap = LIFT_AIR_UNITS_PER_SIZE × GAME_SIZE_MULTIPLIER[parseGameSize(state.gameSize)]`.

- [ ] Launch airports for an air unit: its own base hex when that hex has an intact airport the seat controls, plus every hex returned by `findReachableAirportFerryDestinations` for that unit. Build the request exactly as `nearestFerryAirportCodes` in `briefingSectionsAirOps.ts` does. Read it first.
- [ ] `launchAirportFor(cityH3)` for an air unit: the launch airport within `AIR_STRIKE_RANGE_HEXES` of the city, preferring the unit's own base, then the lowest hex id. `null` when none. The city must also satisfy `landUnitCanOccupyHex(cityH3, landMass)`.
- [ ] For air lift an infantry unit is eligible only when it is in the eligible list and has no stored standing order at all. An air drop is not a move order, so a `defend` post would stay behind and walk the unit back.
- [ ] Choose lift air units in id order, up to `airCap`: first every air unit with infantry aboard, then air units that share their hex with such an infantry unit, while `remaining > 0`.
- [ ] For each chosen air unit compute `chooseAirObjective` with its own `launchAirportFor`. When it is `null`, add no row for that unit.
- [ ] An air unit with infantry aboard:
  - When the launch airport is its own base: a `drop` row, `target` the objective.
  - Otherwise a `ferry` row, `target` the launch airport.
- [ ] An air unit without cargo: one `embark` row for the infantry unit on its hex with the lowest id that meets the air-lift rule above, `target` the air unit's id.
- [ ] `airObjectiveH3` in the plan is the objective of the first chosen air unit that has one.

### Step 5: Tests in `src/main/openRouter/liftPlanFlow.test.ts`

Read `campaignObjectiveFlow.test.ts` first and reuse its way of building a snapshot, a land mass, and the database.

- [ ] An empty ship on a port hex with two eligible infantry gives two `embark` rows naming that ship.
- [ ] An empty ship at sea and infantry at a coastal hex give one `sail` row to that hex. With that march already stored, no row.
- [ ] A loaded ship away from the objective gives one `sail` row to a landing hex beside the objective. A loaded ship on a landing hex gives one `disembark` row per cargo unit.
- [ ] A home defender and a unit in contact are never given an `embark` row.
- [ ] A unit with a stored `march`, and a unit with a `defend` on another hex, are never given an `embark` row. A unit with a `defend` on its own hex is.
- [ ] With 8 ground units and a campaign plan, at most 2 units get `embark` rows across every ship and aircraft.
- [ ] An air unit with an orderless infantry unit on its hex and an empty unfortified enemy city within drop range gives an `embark` row. With a `defend` order on that infantry it gives none. With that infantry aboard it gives a `drop` row. With the city in range only of another controlled airport it gives a `ferry` row to that airport.
- [ ] A seat with no naval and no air unit gets `null`.
- [ ] No enemy city known gives a plan with both objectives `null` and no rows.
- [ ] A snapshot with no `scenarioId` and no home regions still produces rows.
- [ ] A function passed in that throws makes `liftPlanForState` return `null` and does not throw.

### Phase 3 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/liftPlanFlow.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/liftRules.test.js`
- [ ] `liftPlanFlow.ts` is under 600 lines. If it is not, move the air rows into `liftPlanAir.ts` and the sea rows into `liftPlanSea.ts`.

## Phase 4: Briefing Section and Prompt Text

Goal: R4, R8, R10.

### Step 1: Headings

- [ ] In `promptSpec/sectionHeadings.ts`, after `SECTION_TITLE_CAMPAIGN_ORDERS`, add `SECTION_TITLE_LIFT_OBJECTIVE = 'Lift Objective'` and `SECTION_TITLE_LIFT_ORDERS = 'Lift Orders'`, each `as const` with an orienting block. Run `rg -n "SECTION_TITLE_CAMPAIGN_OBJECTIVE" src` and add the new constants beside it in every registry, list, or heading test.

### Step 2: New file `src/main/openRouter/briefingSectionsLift.ts`

- [ ] `export function formatLiftOrder(row: LiftOrderRow, format: (h3Index: string) => string): string`

| Kind | Text |
|------|------|
| `embark` | `embark on ${row.target}` |
| `sail` | `march ${format(row.target)}` |
| `disembark` | `disembark ${format(row.target)}` |
| `ferry` | `ferry ${format(row.target)}` |
| `drop` | `drop ${format(row.target)}` |

- [ ] `export function buildLiftObjectiveSection(args: { readonly state: GameStateSnapshot; readonly plan: LiftPlan; readonly format: (h3Index: string) => string }): string`
  - Return `''` when `plan.rows.length === 0`.
  - Otherwise: `topLevelHeading(SECTION_TITLE_LIFT_OBJECTIVE)`, a blank line, the bullets below that apply, a blank line, `subHeading(SECTION_TITLE_LIFT_ORDERS)`, a blank line, and a table built with `buildPromptTableLines(['Unit ID', 'Unit Type', 'Lift Order'], rows)`.
  - Sea bullet, when `plan.seaObjectiveH3` is not null and not the campaign target: `- By sea: ${hex}, an enemy city with ${urban} city cells and no enemy unit within ${LIFT_OBJECTIVE_CLEAR_RADIUS} hexes.`
  - Sea bullet, when it is the campaign target: `- By sea: ${hex}, the campaign target. No undefended enemy city can be reached by sea.`
  - Air bullet, when `plan.airObjectiveH3` is not null: `- By air: ${hex}, an enemy city with ${urban} city cells and no enemy unit in it.`
  - `urban` comes from `state.strategicInfrastructure`. Use `city cell` when it is 1.
- [ ] `export function formatLiftAttentionBullet(count: number): string | null` returns `null` when `count <= 0`, otherwise `Lift: ${subject} a lift order. Copy each Lift Orders row into the action it names.`, with `subject` `1 unit has` or `${count} units have`.

### Step 3: New file `src/main/openRouter/promptSpec/liftRuleText.ts`

- [ ] `export function buildLiftRuleBlock(): string` returns exactly:

```text
## Lift

The engine plans lifts: ground units carried by ship or aircraft to an enemy city with no defenders nearby. The Lift Objective section of the briefing names the city. Lift Orders lists one row per unit. Give each listed unit the order its row names.

- "embark on <unit id>": an orders entry with action embark, the listed unit as unitId, and that unit id as navalUnitId. The carrier may be a ship or an air unit.
- "march <hex>" on a naval unit: an assign_order entry with a march to that hex. The ship sails there over as many turns as it takes and carries its cargo.
- "disembark <hex>": an orders entry with action disembark and that hex as destination.
- "ferry <hex>": a ferryOrders entry with that hex as destination.
- "drop <hex>": an airDrops entry with that hex as destination.

A unit aboard a ship or an aircraft takes no other order. Do not give it a march, a defend, or an explicit_move unless you mean it to unload where it is. A unit with a Lift Orders row takes that order and no other this turn. A Lift Orders row for an air unit replaces its air strike that turn.
```

  Build the `## Lift` line with `subHeading`, as `buildCampaignRuleBlock` in `campaignRuleText.ts` builds `## Campaign`. Read it first. Add `export const SECTION_TITLE_LIFT = 'Lift' as const;` to `promptSpec/sectionHeadings.ts`, directly after `SECTION_TITLE_CAMPAIGN`.

### Step 4: Gate and placement in the system prompt

- [ ] In `promptSpec/coachingGates.ts` add `readonly liftEnabled?: boolean;`.
- [ ] In `consultPromptParts.ts`, in the `coachingGates` literal, add `liftEnabled: coordinateContext.mode !== 'tactical' && flags.ordersEnabled && (hasNaval || hasAir)`.
- [ ] In `buildStrategicContextCoaching` in `coachingTextStrategic.ts`, append the lift block after the campaign block when `gates.liftEnabled === true`. Replace the final `return` with:

```ts
  const withCampaign = gates.campaignEnabled === true ? `${message}\n\n${buildCampaignRuleBlock()}` : message;
  return gates.liftEnabled === true ? `${withCampaign}\n\n${buildLiftRuleBlock()}` : withCampaign;
```

### Step 5: Wire the plan into the consult

Follow the campaign wiring exactly. Read each call site first.

- [ ] `requestOrdersFlow.ts`: after `campaignPlan = campaignPlanForState(planState);`, inside the same `if (flags.ordersEnabled)`, add `liftPlan = liftPlanForState({ state: planState, campaignPlan, latLngByH3, resolveToH3 });` with `let liftPlan: LiftPlan | null = null;` declared beside `campaignPlan`. Pass `liftPlan` to `buildStatusInjectionTexts`.
- [ ] `requestOrdersInjection.ts`: add `readonly liftPlan?: LiftPlan | null;` to `StatusInjectionArgs` and `readonly liftText: string;` to `StatusInjectionTexts`. Build `liftText` with `buildLiftObjectiveSection` under the same condition as `campaignText` (`args.ordersEnabled`, not tactical, plan not null). When `formatLiftAttentionBullet(plan.rows.length)` is not null, push it onto `additionalAttention`.
- [ ] `consultPromptParts.ts`: the `else` branch that builds an `injection` literal needs `liftText: ''`.
- [ ] `briefingFormatter.ts`: add `liftText?: string;` beside `campaignText` in the shared-context interface. Directly after the block that pushes `campaignText`, add the same three lines for `liftText`. Together with the one-line filter in the lift-units step below, these are the only edits to this file. It must stay under 965 lines.
- [ ] `requestOrdersFlow.ts`: pass `liftText: injection.liftText` in the object given to `formatBriefing`.

### Step 6: Lift units leave the other tables

`liftUnitIds` is the set of every `unitId` in `liftPlan.rows`. It is empty when there is no plan.

- [ ] `src/main/tools/standingOrdersInjectionText.ts`: `buildCampaignOrderRows` gains an optional `readonly excludeUnitIds?: ReadonlySet<string>` in its `args`. In its loop, directly after `if (!unit) continue;`, add `if (args.excludeUnitIds?.has(unit.id)) continue;`.
- [ ] Same file: `getStandingOrderInjectionText` gains a fifth optional parameter `liftUnitIds?: ReadonlySet<string>`. It passes it to `buildCampaignOrderRows` as `excludeUnitIds`, and it passes `orderlessUnitIds: unitIdsWithoutOrders.filter((id) => !liftUnitIds?.has(id))` to `collectOrderlessMissionContext`. The table still lists those units; their Suggested Destination cell is `—`.
- [ ] `requestOrdersInjection.ts`: build `liftUnitIds` from `args.liftPlan`, pass it to `getStandingOrderInjectionText`, and pass it as `excludeUnitIds` to the `buildCampaignOrderRows` call that counts rows for the campaign attention bullet.
- [ ] `briefingFormatter.ts`: add `liftUnitIds?: ReadonlySet<string>;` to the shared-context interface. In `formatBriefing`, where `collectOrderlessMissionContext` receives `orderlessUnitIds`, append `.filter((unitId) => !sharedContext?.liftUnitIds?.has(unitId))` to that expression. `requestOrdersFlow.ts` passes `liftUnitIds` in the same object as `liftText`.
- [ ] Tests, in `src/main/tools/standingOrdersInjectionMission.test.ts`: a campaign unit named in `excludeUnitIds` gets no Campaign Orders row; an orderless unit named in `liftUnitIds` is listed with `—`.

### Step 7: Opening message

- [ ] In `promptSpec/consultationText.ts`, add `readonly hasLiftOrders?: boolean;` to `OpeningMessageGates`. In `buildOpeningActionClause`, after `campaignClause`, add a `liftClause`: `' Give each unit in Lift Orders the order its row names.'` when `gates.ordersEnabled && gates.hasLiftOrders === true`, otherwise `''`. Return `optionsClause + orderlessClause + campaignClause + liftClause`.
- [ ] Set the gate the way `hasCampaignOrders` is set. Run `rg -n "hasCampaignOrders" src` and add `hasLiftOrders` beside every hit, fed from whether the lift plan has rows.

### Step 8: Tests

- [ ] New `briefingSectionsLift.test.ts`: no rows gives `''`; a sea plan gives the sea bullet and a table row `embark on <ship id>`; a campaign-target fallback gives the fallback bullet; `formatLiftAttentionBullet(0)` is `null` and `(2)` reads `2 units have`.
- [ ] `promptSpec/coachingText.test.ts`: `liftEnabled: true` appends the lift block after the campaign block; `liftEnabled` false or absent leaves the text as before; tactical gates never include it.
- [ ] `promptSpec/consultationContract.test.ts`: the opening message carries the lift clause only when `hasLiftOrders` is true.
- [ ] The briefing test that checks Campaign Objective placement (`rg -l "campaignText" src --glob "*.test.ts"`): `liftText` prints directly after the campaign section.

### Phase 4 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsLift.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/coachingText.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/consultationContract.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptContracts.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/variantConformance.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/briefingFormatter.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/tools/standingOrdersInjectionMission.test.js`
- [ ] The tactical cases in those files pass with no expected-string change.

## Phase 5: Living Documentation

- [ ] `doc/ai-commander-prompts/strategic-prompt.md`: the Lift block, the Lift Objective section, the Lift Orders table, the attention bullet, and the opening clause, each with its include condition.
- [ ] `doc/ai-commander-prompts/assembly-contract.md`: section order and the include and omit matrix.
- [ ] `doc/ai-commander-prompts/information-decision-model.md`: the "Move land force across water" job now reads the Lift Orders rows; add rows for the lift objective and lift orders beside `CAMPAIGN_OBJECTIVE` and `CAMPAIGN_ORDERS`.
- [ ] `doc/ai-commander-prompts/consultation-flow.md`: the opening clause.
- [ ] `doc/ai-commander-prompts/variants.md`: no naval and no air unit, orders disabled, no campaign plan, fog on.
- [ ] `doc/ai-commander-prompts/source-inventory.md` and `crosswalk.md`: the new files.
- [ ] `doc/ai-commander-prompts/example-strategic-prompt.md`: add the Lift block and a Lift Objective section with two rows.
- [ ] `doc/hybrid-ai.md`: a short Lift section beside the Campaign section.
- [ ] `doc/combat-rules-v3.md`: where it describes sealift for AI seats, state that a standing order does not move an embarked ground unit. Change this only if Phase 1 Step 1 applied its fix.
- [ ] Run `node scripts/check-doc-links.cjs`.

## Phase 6: Final Verification

- [ ] `npm test` passes.
- [ ] `npm run check:circular` reports no new cycle.
- [ ] `rg -n "Phase [0-9]|Step [0-9]|\bR[0-9]+\b" src doc` shows no hit introduced by this change.
- [ ] No file touched here crossed 600 lines that was under it before, and none is over 1000.

## Phase 7: Verification Run

- [ ] Set `AGENT_WARS_LOG_LEVEL=debug` and `AGENT_WARS_LOG_FULL_PROMPTS=1`. Run 40 turns on the global map with home regions on different continents, no fog, no tactical battles, balanced doctrine. Keep `debug.log` and the `debug-last-*` files.
- [ ] From `debug.log`, per seat: count `liftPlanFlow liftPlanForState` lines with `rowCount` above 0, and read the largest `routeChecks`. Count `openRouter requestOrders: orders applied` lines with `embark` above 0 and with `ferry` above 0. Count `sealift autoDebarkNonHumanLandUnitIfMovingIndependently` lines.
- [ ] Repeat for 40 turns on one regional map.
- [ ] Pass when, on the global map: at least one seat embarked a unit, sailed it, and disembarked it on another landmass; at least one seat ferried or dropped infantry by air; and no consult took visibly longer than before. Report the counts whether or not the run passes.

## Out of Scope

- An amphibious phase inside the campaign plan. The lift objective stands beside the campaign and does not change its target, staging, or phase.
- Ground units marching to a port.
- Escorts, convoys, or several ships sailing together.
- A count of air drops in the log. `ferry` and `embark` are counted today; drops are not. That belongs with the instrumentation work.
- Lift orders in tactical battles.
