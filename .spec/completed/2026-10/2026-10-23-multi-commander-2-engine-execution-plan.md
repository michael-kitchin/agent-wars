# Multi-commander games, stage 2: engine rules

Audience: a **lower-quality coding agent**. Read [multi-commander-execution-plan.md](multi-commander-execution-plan.md) first. Its working rules, verification bar, decisions ([D8](multi-commander-execution-plan.md#play), [D11 to D19](multi-commander-execution-plan.md#knockout-and-neutral)), and glossary apply here. Stage 1 must be complete.

Goal of this stage: the rules for three or more sides and for Neutral, plus the win rules that also apply to a two-sided match. Three-sided melee, the victory settings, knockout and its consequences, Neutral's turn, and which hexes can host a tactical battle. [D12](multi-commander-execution-plan.md#knockout-and-neutral) and the global turn limit apply to two-sided matches. Two-sided melee, including the order of its die rolls, stays as it is. All of it is tested without a model and without the interface.

This stage still does not change the AI pipeline (`src/main/openRouter/`) or the renderer, except where a phase says so.

## Phases

| Phase | Title | Verifies with |
| --- | --- | --- |
| 2.1 | Three-sided melee | Unit tests with stubbed dice |
| 2.2 | Victory settings | Reset and snapshot tests |
| 2.3 | End-of-turn outcome: knockouts, places, winner | Pure rule tests; the old winner fixtures, including the mutual-wipe behavior change |
| 2.4 | What a knockout does | Database tests on a three-seat match |
| 2.5 | Neutral's turn | Order tests; landing tests with a fake route planner |
| 2.6 | Tactical battle parties | Battle start and beat tests |

---

## Phase 2.1: Three-sided melee

**Goal.** Replace the cyclic-pairs branch of `runMeleePhase` with the rule in [D8](multi-commander-execution-plan.md#play). Two-sided melee must not change in any way, including the order in which random numbers are drawn.

**Read first.** `runMeleePhase` and `resolveOneMeleeEngagement` in `src/main/combatResolution.ts`; `recordRemovedUnit` in the same file; `createCombatDieRoller`, `rollCombatDieAgainst` in `src/main/combatDice.ts`; `attackHitThreshold`, `defenseHitThreshold`, `getDefense`, `casualtyPriorityIndex`.

**Change.**

1. Create `src/main/multiSideMelee.ts` (new). `combatResolution.ts` is already 785 lines; do not grow it. Export:

   ```ts
   export interface MultiSideMeleeResult {
     /** Every unit removed this round, with the units of the side whose hit removed it. */
     readonly removals: readonly { readonly victim: CombatUnit; readonly killerIds: readonly string[] }[];
   }

   /**
    * Resolves one melee round in a hex that holds three or more sides.
    * `sidesOrdered[0]` rolls attack values; every other side rolls defense values.
    */
   export function resolveMultiSideMeleeEngagement(args: {
     readonly sidesOrdered: readonly string[];
     readonly unitsHere: readonly CombatUnit[];
     readonly rollDie: () => number;
     readonly next: () => number;
     readonly onRoll?: CombatDiceRollSink;
   }): MultiSideMeleeResult;
   ```

2. The algorithm, exactly:
   1. **Rolls.** For each side in `sidesOrdered` order, for each of its units in `unitsHere` order, roll once: the first side against `attackHitThreshold(u)` with dice context kind `'meleeAttack'`; every other side against `defenseHitThreshold(u)` with kind `'meleeDefense'`. Count hits per side. All rolls happen before any casualty (simultaneous).
   2. **Assignment.** Keep a per-side list of remaining units, each sorted by `getDefense` ascending, then `casualtyPriorityIndex` ascending (the same order `resolveOneMeleeEngagement` uses). For each side `S` in `sidesOrdered` order, for each of its hits: let the candidates be every other side with at least one remaining unit. If none, the rest of `S`'s hits are lost. Otherwise draw `r = next() * total`, where `total` is the sum of the candidates' remaining counts, and walk the candidates in `sidesOrdered` order subtracting each count until `r` falls inside one. Remove that side's first remaining unit and record it with `killerIds` = every unit id of `S` in this hex (dead or alive).
   3. Units that are removed during assignment still had their roll in step 1.
3. In `runMeleePhase`, replace the whole `else` branch (three or more sides) with a call to `resolveMultiSideMeleeEngagement` and one `recordRemovedUnit` per removal, with `casualtyHex: hex`. Pass that function the same `next` the die roller already uses. Do not create a second generator. The two-sided branch and the participant shuffle stay exactly as they are, and the two-sided branch does not draw `next()` to pick a target. `combatResolution.ts` is 785 lines; the new function lives in the new module.
4. Update the orienting comment of `runMeleePhase` to describe both cases.

**Tests.** `src/main/multiSideMelee.test.ts` (new). Build `CombatUnit` values by hand, as `src/main/combatResolution.test.ts` does. Use a `rollDie` stub that returns a scripted sequence and a `next` stub that returns a scripted sequence.

- Three sides of two infantry each. Script: the attacker scores 2 hits, side B 1, side C 0; `next` returns `0` every time. Expected: both attacker hits land on side B (first candidate when `r = 0`), then B's hit lands on the attacker. Three removals; side C untouched.
- Weighting: attacker with one hit, B with 1 unit, C with 3 units, `next` returns `0.5`: `total = 4`, `r = 2`, so the hit lands on C.
- A side whose every enemy is already removed loses its remaining hits.
- Killed units still rolled: the dice log has one roll per unit even when some die.
- `runMeleePhase` with two sides gives the same removals and the same dice log as before for an existing fixture (copy one two-sided case from `combatResolution.test.ts` and assert equality with a recorded expectation).

**Docs.** `doc/combat-rules-v3.md` §4.6 (melee phase) and §4.9 (hit and casualty rules): replace the description of three or more sides with D8's rule. Keep the two-sided text as it is.

**Done when.** `npm test` passes and the existing `combatResolution.test.ts` cases pass unchanged.

---

## Phase 2.2: Victory settings

**Goal.** Every match records its win rule and, on the global map, its turn limit. The snapshot carries both. A shared helper counts city hexes per seat.

**Change.**

1. Create `src/shared/victoryRules.ts` (new):

   ```ts
   export const VICTORY_RULES = ['last_side_standing', 'most_city_hexes_at_turn_limit'] as const;
   export type VictoryRule = (typeof VICTORY_RULES)[number];
   export const TURN_LIMIT_OPTIONS = [20, 30, 40, 50] as const;
   export const DEFAULT_TURN_LIMIT = 30;
   export interface VictorySettings { readonly rule: VictoryRule; readonly turnLimit: number | null; }
   export function victorySettingsForMapKind(mapKind: 'global' | 'regional', requestedTurnLimit: number | undefined): VictorySettings;
   /** City hexes held per seat: strategic hexes the seat controls whose current urban count is above zero. */
   export function countCityHexesBySeat(
     control: readonly { readonly h3Index: string; readonly controllerPlayerId: string | null }[],
     infrastructure: readonly { readonly h3Index: string; readonly urbanHexCount: number }[]
   ): Map<string, number>;
   ```

   `victorySettingsForMapKind('regional', …)` is `{ rule: 'last_side_standing', turnLimit: null }`. For `'global'` it is `{ rule: 'most_city_hexes_at_turn_limit', turnLimit }`, where `turnLimit` is the requested value when it is one of `TURN_LIMIT_OPTIONS`, else `DEFAULT_TURN_LIMIT`. `countCityHexesBySeat` counts only seat ids (`isSeatId`); Neutral and `null` are not counted.

2. `NewGameIpcPayload` and `ResetGameForNewMatchOptions` gain `readonly turnLimit?: number`. `resetGameForNewMatch` persists `victory_rule` and `turn_limit` in `game_config` (delete `turn_limit` for regional matches). Add read helpers next to the other `game_config` readers in `src/main/gameDb/gameConfigKv.ts`.
3. `GameStateSnapshot` gains `readonly victory?: VictorySettings`, set by `getGameStateSnapshot`.

**Tests.** `src/shared/victoryRules.test.ts` (new): the two map kinds; an unlisted turn limit falls back to 30; `countCityHexesBySeat` ignores zero-urban hexes, Neutral, and `null`. In `src/main/gameDb/newMatchSeats.test.ts`: a global match started with `turnLimit: 40` reports `victory = { rule: 'most_city_hexes_at_turn_limit', turnLimit: 40 }`; a regional match reports `last_side_standing` and `null`.

**Done when.** `npm test` passes.

---

## Phase 2.3: End-of-turn outcome: knockouts, places, winner

**Goal.** One function decides, at the end of every turn, which seats are knocked out, their places, and whether the match is over, by [D12](multi-commander-execution-plan.md#knockout-and-neutral), [D18](multi-commander-execution-plan.md#victory), [D19](multi-commander-execution-plan.md#victory), and [E9](multi-commander-execution-plan.md#engineering-decisions-frozen-unless-the-owner-overrides). It replaces `evaluateRegionControlWinnerAtEndOfTurn`. This phase records the outcome; phase 2.4 applies its consequences.

**Read first.** `src/main/gameActions/regionControlWinner.ts` (whole file); `src/main/gameActions/homeControlProgress.ts` (`computeHomeControlProgress`); `setGameOver` and `setGameOverWithOps` (`src/main/gameDb/gameConfigKv.ts`); where `finalizeReadyTurnAfterMelee` calls the winner function; `src/main/gameActions/regionControlWinner.test.ts`.

**Change.**

1. Create `src/main/gameActions/endOfTurnOutcomeRules.ts` (new), pure, no database:

   ```ts
   export interface EndOfTurnOutcomeInput {
     readonly turnNumber: number;                          // the turn that just resolved
     readonly seats: readonly SeatRecord[];                // roster before this turn's outcome
     readonly victory: VictorySettings;
     readonly controlWinMet: (attacker: SeatId, victim: SeatId) => boolean;
     readonly cityHexCountBySeat: ReadonlyMap<string, number>;
     readonly intactHomeUrbanCellsBySeat: ReadonlyMap<string, number>;
     readonly homeCityCellsControlledBy: (victim: SeatId, controller: SeatId) => number;
   }
   export interface SeatKnockout {
     readonly seatId: SeatId;
     readonly outBy: SeatId | null;
     readonly reasons: readonly SeatOutReason[];  // D12 order, every reason that holds
     readonly place: number;
   }
   export interface EndOfTurnOutcome {
     readonly knockouts: readonly SeatKnockout[];
     readonly gameOver: boolean;
     readonly endReason: 'last_side_standing' | 'turn_limit' | 'mutual_elimination' | null;
     /** Places of the seats still active when the match ends; empty otherwise. */
     readonly finalPlaces: ReadonlyMap<SeatId, number>;
     /** The one seat in first place, or null when nobody or several share it. */
     readonly winnerSeatId: SeatId | null;
   }
   export function decideEndOfTurnOutcome(input: EndOfTurnOutcomeInput): EndOfTurnOutcome;
   export function rankSeatsByCityHexes(seatIds: readonly SeatId[], cityHexCountBySeat: ReadonlyMap<string, number>): Map<SeatId, number>;
   ```

   Rules, in this order. Follow [D12](multi-commander-execution-plan.md#knockout-and-neutral) for which reasons are recorded and for `outBy`:
   1. Consider only active seats (`outTurn === null`). For each active seat `V`, in seat order, collect every reason that holds: `home_control`, then `no_city_hexes`, then `home_cities_destroyed`. A non-empty list knocks `V` out. `outBy` follows D12.
   2. If every active seat would be out, nobody is out this turn. Keep those seats active, set `gameOver`, and end the match. `finalPlaces = rankSeatsByCityHexes` of those seats. `rankSeatsByCityHexes` gives each seat `1 + (number of seats with strictly more city hexes)`. The winner is the single seat with place 1, or null when several share it. If `victory.rule === 'most_city_hexes_at_turn_limit'` and `turnNumber >= victory.turnLimit`, `endReason` is `'turn_limit'`. Otherwise `endReason` is `'mutual_elimination'`. Do not continue to steps 3–6.
   3. Each knockout's place is `(active seats remaining after this turn's knockouts) + 1`.
   4. If one active seat remains: `gameOver`, `endReason: 'last_side_standing'`, that seat gets place 1 and is the winner.
   5. Else if `victory.rule === 'most_city_hexes_at_turn_limit'` and `turnNumber >= victory.turnLimit`: `gameOver`, `endReason: 'turn_limit'`, `finalPlaces = rankSeatsByCityHexes(remaining active seats)`. The winner is the single seat with place 1, or null when several share it.
   6. Otherwise not over.

2. Create `src/main/gameActions/endOfTurnOutcome.ts` (new): the database wrapper.

   ```ts
   export function evaluateEndOfTurnOutcome(turnNumber: number): EndOfTurnOutcome;
   export function recordEndOfTurnOutcome(outcome: EndOfTurnOutcome, turnNumber: number): void;
   export function endMatchByHuman(turnNumber: number): EndOfTurnOutcome;
   ```

   - `evaluateEndOfTurnOutcome` gathers the input from the database: the roster (`getSeatRoster`), `getHexControlMap`, each seat's home hexes (`getScenarioHomeRegionHexes(seat.homeRegion)`), `controlWinMet` through `computeHomeControlProgress` with the same `effectiveControlWinMinUrbanShare` and baseline lookup `regionControlWinner.ts` uses today (move those two private helpers into this module and import them back into `regionControlWinner.ts` if anything still needs them), `sumUrbanHexCountForHexes` for each home, and `countCityHexesBySeat` over the control map and the strategic infrastructure rows.
   - `recordEndOfTurnOutcome` writes, through new functions in `seatRosterStore.ts`, each knockout's `out_turn`, `out_by`, `out_reasons` (the JSON array), and `place`, and each final place. Write a place only for a seat in `knockouts` or in `finalPlaces`. A mutual wipe has an empty `knockouts` list, so it sets no `out_turn`. Leave a seat that was already knocked out unchanged, including its place. When `gameOver`, it calls a new `setGameOutcome({ winnerSeatId, endReason })` in `gameConfigKv.ts` that writes `game_over = 1`, `winner` (the seat id, or the empty string when there is none), and `game_end_reason`. Keep `setGameOver(winner)` only if something else still calls it; otherwise delete it.
   - `endMatchByHuman` ranks the active seats with `rankSeatsByCityHexes`, records the places, and sets `game_end_reason = 'ended_by_human'`. Nothing calls it yet; stage 4 does.

3. In `finalizeReadyTurnAfterMelee`, replace the `evaluateRegionControlWinnerAtEndOfTurn` → `setGameOver` lines with `evaluateEndOfTurnOutcome` → `recordEndOfTurnOutcome`. Add `readonly endOfTurnOutcome: EndOfTurnOutcome` to the internal finalize result so phase 2.4 can act on the knockouts. Add to `ReadyResult` (in `src/shared/ipc/readyTypes.ts`) a serializable copy:

   ```ts
   readonly knockouts?: readonly { readonly seatId: string; readonly outBy: string | null; readonly reasons: readonly string[]; readonly place: number }[];
   ```

   and copy it in `pickReadyResolutionIpcMirrorFields`.

4. `GameStateSnapshot` gains `readonly gameEndReason?: 'last_side_standing' | 'turn_limit' | 'mutual_elimination' | 'ended_by_human'`.

5. Delete `evaluateRegionControlWinnerAtEndOfTurn` and `pickUrbanEliminationWinner`. Keep `getRegionHomeControlProgressForPrompt` working for the two-seat prompt until stage 3 replaces it.

**Tests.**

- `src/main/gameActions/endOfTurnOutcomeRules.test.ts` (new), pure, with hand-built rosters and lambdas:
  - Four active seats; seat 2 meets the control rule against seat 4, and seat 4 still holds a city hex and still has home urban cells: one knockout, `reasons` is `['home_control']`, `outBy` seat 2, place 4, not over.
  - One seat holds no city hex and its home has no urban cells left: `reasons` is `['no_city_hexes', 'home_cities_destroyed']`, in that order.
  - Two seats out in the same turn of four: both place 3.
  - Two active seats that meet the control rule against each other, and it is not the turn limit: no knockout, `gameOver`, `endReason 'mutual_elimination'`, places from city hexes.
  - Two active seats, both would be out, on turn 30 of a 30-turn limit: no knockout, `gameOver`, `endReason 'turn_limit'`, places from city hexes.
  - Two active seats, both would be out, regional `last_side_standing`: no knockout, `gameOver`, `endReason 'mutual_elimination'`, places from city hexes.
  - Three AI seats and no human, all three would be out, each with 4 city hexes: no knockout, `gameOver`, `endReason 'mutual_elimination'`, places 1, 1, and 1, winner null.
  - Four seats; seat 4 already has `outTurn` 1 and place 4. The other three would all be out, with 5, 5, and 1 city hexes, and it is not the turn limit: no new knockout, `finalPlaces` are 1, 1, and 3, seat 4 is absent from `finalPlaces`, winner null, `endReason 'mutual_elimination'`.
  - Global, both active seats would be out, turn 10 of 30: no knockout, `gameOver`, `endReason 'mutual_elimination'`.
  - Two active seats, one is out by rule (a): over, winner the other, `endReason 'last_side_standing'`. This is the two-sided shape of rule (a).
  - Rule (b) on a two-seat roster whose victim still has home urban cells but `cityHexCount` 0: that seat is out, the other wins. The old winner tests do not cover this.
  - Rule (b) attribution: the victim's home cities are split 2 and 5 between two seats; `outBy` is the seat with 5. With 0 and 0, `outBy` is null. When rule (a) also holds, `outBy` is the control-rule seat, not the city-cell leader.
  - Turn limit: three active seats with 9, 9, 4 city hexes at turn 30 of 30: places 1, 1, 3; winner null; at turn 29 not over.
  - An already knocked-out seat is never an attacker and never knocked out again.
- `src/main/gameActions/regionControlWinner.test.ts`: rewrite each case to call `evaluateEndOfTurnOutcome` on the same two-seat setup. Where the old test expected winner `'human'`, expect `winnerSeatId === 'human'` and the `'opponent'` seat knocked out. Where it expected `null` (both homes have zero urban cells), expect no knockout, `gameOver`, and places from `rankSeatsByCityHexes`. That null case used to leave the match running. This is a named, expected behavior change. Move the file to `endOfTurnOutcome.test.ts` if nothing is left that belongs to the old module. Keep every scenario.

**Docs.** `doc/combat-rules-v3.md` §14 (win conditions): rewrite as knockout rules (a), (b), and (c), including that every matching reason is stored, that a mutual wipe cancels the knockouts and ends the match on both maps by city-hex ranking (ties share first and leave no single winner; `mutual_elimination`, or `turn_limit` when the limit has arrived), and that two-sided matches use the same rules. Name `decideEndOfTurnOutcome` and `victorySettingsForMapKind`. `doc/README.md` engine-constants table: add a row "Win rules, knockout, and places | `decideEndOfTurnOutcome` in `src/main/gameActions/endOfTurnOutcomeRules.ts`, `TURN_LIMIT_OPTIONS` and `DEFAULT_TURN_LIMIT` in `src/shared/victoryRules.ts`". Follow the consultation-deadline paragraph after that table only if a deadline symbol changed. This phase does not change one.

**Done when.** `npm test` passes and this search has no output:

```powershell
Get-ChildItem -Path src -Recurse -Filter *.ts | Select-String -SimpleMatch -Pattern 'evaluateRegionControlWinnerAtEndOfTurn'
```

---

## Phase 2.4: What a knockout does

**Goal.** Apply [D13](multi-commander-execution-plan.md#knockout-and-neutral) right after the outcome is recorded: the seat's land turns Neutral with its queues cleared, its units turn into neutral garrisons with a `defend` order, and everything the seat's commander and fog owned is deleted. A loaded ship keeps that `defend` only until the next turn's landing check.

**Read first.** `setHexController` and `clearBuildQueueAndProgressForHex` in `src/main/gameDb/controlInfrastructure.ts`; `executeStandingOrderActionForPlayer` in `src/main/tools/standingOrdersCore.ts`; how `executeReadyStrategicTurn` builds the `latLngByH3` map and the `resolveToH3` function it passes to `generateOrdersForStandingOrders`; the AI tables in `src/main/gameDb/schema.ts`.

**Change.**

1. Create `src/main/gameActions/knockoutConsequences.ts` (new):

   ```ts
   export interface KnockoutApplied {
     readonly seatId: SeatId;
     readonly hexesTurnedNeutral: number;
     readonly unitsTurnedNeutral: number;
   }
   export function applyKnockout(seatId: SeatId, coordinates: { latLngByH3: Map<string, LatLng>; resolveToH3: (lat: number, lng: number) => string | undefined }): KnockoutApplied;
   ```

   Steps, in this order, inside one transaction (use the same transaction helper the finalize step uses; if it runs inside an open transaction already, do not open a second one):
   1. Delete the seat's rows from `standing_orders`, `ai_memory`, `ai_callback_subscriptions`, `ai_pending_orders`, `ai_combat_since_consultation`, `ai_loss_events_since_consultation`, `player_hex_intel`, `player_unit_intel`, and its `fog_new_contacts_<seatId>` key.
   2. For every hex whose controller is the seat: `setHexController(h3, NEUTRAL_OWNER_ID)` and `clearBuildQueueAndProgressForHex(h3)`.
   3. `UPDATE units SET player = 'neutral' WHERE player = ?` (use the constant, not a literal). Do not call `destroyAirUnitsWithInvalidBase` between this step and the control flip. Air on the seat's own airports stays, because the airport and the unit become Neutral together. Air the turn already removed stays removed.
   4. For every unit that just turned neutral, assign a `defend` standing order on its current hex: `executeStandingOrderActionForPlayer(NEUTRAL_OWNER_ID, 'assign_order', { unitId, order: { type: 'defend', defendHex: latLngByH3.get(unit.h3Index) } }, snapshot, latLngByH3, resolveToH3)`, where `snapshot` is `getGameStateSnapshot()` taken after step 3. A result with `status: 'error'` is logged with `logError` and does not stop the loop. A loaded ship's `defend` is replaced on the next turn by phase 2.5.

2. Call `applyKnockout` from `finalizeReadyTurnAfterMelee` for each knockout in `endOfTurnOutcome.knockouts`, after `recordEndOfTurnOutcome` and before the fog refresh. Pass the coordinate helpers down from the pipeline.
3. The fog refresh already covers only active seats (stage 1 reads the roster); confirm it skips seats with `out_turn` set, and make it do so if it does not.
4. Do not change anything about the human seat's interface. When the human seat is knocked out, the engine keeps resolving turns: `ready()` with no human orders works (the pending tables are simply empty).

**Tests.** `src/main/gameActions/knockoutConsequences.test.ts` (new), three seats on `western_asia_north` with `withSeatedTempGameDb`:

- Before: give `'opponent2'` a standing order, an `ai_memory` row, a queued build on one of its hexes, and fog rows. Call `applyKnockout('opponent2', …)`. After: no row for `'opponent2'` in any of the listed tables; every hex it controlled has controller `'neutral'` and no queue or progress; every former unit has player `'neutral'`, keeps its id, and has a `defend` row with `player_id = 'neutral'`.
- End to end: set the control map so that `'opponent'` meets the control rule against `'opponent2'`, call `ready()`, and check that `ReadyResult.knockouts` lists `'opponent2'` with `reasons` containing `'home_control'` and place 3, that the roster row has `out_turn = 1` and `out_by = 'opponent'`, and that the match is not over.

**Docs.** `doc/combat-rules-v3.md`: add a section "Knockout and Neutral" after §14's win rules (or extend §14): what a knockout does (D13), Neutral garrisons (D11), Neutral never builds (D14). Keep the document's voice; name `applyKnockout`.

**Done when.** `npm test` passes.

---

## Phase 2.5: Neutral's turn

**Goal.** Every turn, the engine gives Neutral its orders: garrisons fire from their `defend` orders, and loaded ships sail to land, unload, or are deleted, by [D11](multi-commander-execution-plan.md#knockout-and-neutral) and [D15](multi-commander-execution-plan.md#knockout-and-neutral). Neutral's orders use the omniscient snapshot ([E5](multi-commander-execution-plan.md#engineering-decisions-frozen-unless-the-owner-overrides)).

**Read first.** `generateOrdersForStandingOrders` and `appendNearestLegalEngagement` in `src/main/tools/standingOrdersGeneration.ts`; `executePlanRouteWithSession` and `createPathfindingSession` (`src/main/tools/pathfinding.ts` and `src/main/tools/pathfindingSessionCache.ts`); the debark rules in `src/shared/sealiftEmbarkEligibility.ts` (`canEmbarkAtHex` and the manual-debark function next to it); `unit_transport_assignments` and how `src/main/gameActions/sealift.ts` debarks a unit; `getGameStateSnapshot`.

**Change.**

1. Create `src/main/gameActions/neutralLanding.ts` (new) with a pure chooser:

   ```ts
   export interface LandingCandidate { readonly h3Index: string; readonly occupiedBySeat: boolean; }
   export function chooseNeutralLandingTarget(args: {
     readonly shipH3: string;
     readonly candidates: readonly LandingCandidate[];
     readonly gridDistance: (from: string, to: string) => number | null;
     readonly navalMovesPerTurn: number;
     /** Turns to sail there, or null when there is no water route. */
     readonly sailingTurns: (to: string) => number | null;
   }): { readonly h3Index: string; readonly occupiedBySeat: boolean } | null;
   ```

   Rules: first consider only candidates with `occupiedBySeat === false`; if none of them has a route, consider the rest. Within a pass, visit candidates in increasing grid distance and stop as soon as `ceil(gridDistance / navalMovesPerTurn)` exceeds the best `sailingTurns` found so far. Ties keep the first found. Return null when no candidate has a route.

2. Create `src/main/gameActions/neutralTurn.ts` (new):

   ```ts
   /** Unloads, retargets, or deletes neutral transports. Runs once at the start of every strategic resolution. */
   export function prepareNeutralTransportsForTurn(coordinates: …): void;
   /** Neutral's orders for this turn, generated from the omniscient snapshot. */
   export function buildNeutralTurnOrders(coordinates: …): OwnerTurnOrders;
   ```

   `prepareNeutralTransportsForTurn`, for each neutral naval unit that has at least one cargo assignment:
   - A **landing hex** is one where `canManualDebarkAtHex` is true, with `hexControlledByPlayer` computed for `'neutral'`. That is native coastal, wetlands, a land seaport, or a water seaport Neutral controls. Do not write a second rule. `appendNearestLegalEngagement` already fires at the nearest unit whose owner is not Neutral, so `buildNeutralTurnOrders` uses it as [D11](multi-commander-execution-plan.md#knockout-and-neutral) describes.
   - If the ship stands on a landing hex: remove its cargo assignments (the same way a manual debark does in `sealift.ts`), then give the ship and each former cargo unit a `defend` order on that hex.
   - Otherwise: build the candidates (every landing hex; `occupiedBySeat` when any unit whose owner is a seat stands there), call `chooseNeutralLandingTarget` with `sailingTurns` from `executePlanRouteWithSession(shipId, latLngOf(target), { avoidEnemies: true }, session)` (fall back to `avoidEnemies: false` for the occupied pass), and assign the ship a `march` order with `destination` = the target's center, `engageEnRoute: true`, `avoidEnemies` matching the pass. This replaces the ship's `defend` order.
   - If the chooser returns null: delete the ship, its cargo units, their transport assignments, and their standing orders. Log it with `logDebug`.

   `buildNeutralTurnOrders`: take `getGameStateSnapshot()` (omniscient), call `generateOrdersForStandingOrders(NEUTRAL_OWNER_ID, snapshot, latLngByH3, resolveToH3, { mutateProgress: true })`, and return its movement, ranged, and air-strike orders as an `OwnerTurnOrders` (no ferry, no embark). Do not run the strategic tempo sweep for Neutral: every neutral unit already fires through `defend` or through `march` with `engageEnRoute`.

3. In `executeReadyStrategicTurn`, call `prepareNeutralTransportsForTurn` before the pre-move snapshot and before the human standing-order merge, so those steps see unloaded troops. Then `buildNeutralTurnOrders`, and put that result in the order map under `NEUTRAL_OWNER_ID`. The pipeline does not generate Neutral standing orders a second time. If the caller passed a `'neutral'` entry, log an error and ignore it: only the engine orders Neutral.
4. When no neutral unit exists, both functions return immediately without touching the database.

**Tests.**

- `src/main/gameActions/neutralLanding.test.ts` (new), pure: an empty candidate wins over a closer occupied one when both have routes; the occupied one wins when no empty candidate has a route; the early stop never skips a nearer-by-turns candidate (build a case where grid distance and sailing turns disagree); null when nothing has a route.
- `src/main/gameActions/neutralTurn.test.ts` (new), three seats on `western_asia_north`, using `applyKnockout` from phase 2.4 to create neutral units:
  - A neutral armor adjacent to an `'opponent'` unit: `buildNeutralTurnOrders` contains one ranged attack from that armor at that unit's hex.
  - A neutral infantry with no enemy adjacent: no orders for it, and it does not move after `ready()`.
  - A neutral naval unit carrying an infantry on a coastal hex: after `prepareNeutralTransportsForTurn`, the infantry has no transport assignment and both have `defend` rows.
  - A neutral naval unit carrying an infantry on open water with a reachable coast: it gets a `march` row with `engageEnRoute: true`; after enough `ready()` calls it arrives, the next turn it unloads, and the infantry stands on the landing hex.

  Choose hexes from the real map data. If `western_asia_north` has no suitable water layout, use the region the existing sealift tests use and say so in your report.

**Docs.** `doc/combat-rules-v3.md`: in the Knockout and Neutral section, describe Neutral's turn (D11), loaded ships (D15), and neutral land capture (infantry and armor, not ships). In §5 (detailed resolution flow), add the Neutral preparation step before order assembly. `doc/combat-rules-v3.md` §9 (sealift): one sentence pointing to the Neutral landing rule.

**Done when.** `npm test` passes.

---

## Phase 2.6: Tactical battle parties

**Goal.** A tactical battle can start only in a hex where the human and exactly one other owner are present ([D9](multi-commander-execution-plan.md#play)). The battle remembers who that other party is, and the tactical engine stops assuming it is `'opponent'`. Neutral's sub-units fight through the tempo sweep.

**Read first.** `computeTacticalBattleSnapshot.ts` (eligibility around the "not contested by both sides" error, `placingSide`, `tacticalSnapshotHasPlacedUnitsForBothSides`); `TacticalBattlePlayerId` in `src/shared/tacticalBattleTypes.ts`; `startTacticalBattleForEnclosingHex` and `applyHumanTacticalDraftBeatInStrategicOrder` in `src/main/tacticalBattle/tacticalBattleSession.ts`; `commitHumanTacticalDraftOrders` and `sanitizeOpponentTacticalDraftForReadyCommit` in `src/main/gameActions/humanTacticalDraftCommit.ts`; `collectTacticalTempoAttacks` in `src/main/tacticalBattle/tacticalRangedTargetResolve.ts`; `filterMeleeCandidateHexesWithTacticalEntry` in `src/main/gameActions/meleeInterceptCandidates.ts`; `getTacticalAnnihilationOutcome` in `src/shared/tacticalAnnihilation.ts`.

**Change.**

1. `TacticalBattlePlayerId` becomes an alias of `OwnerId`. The tactical battle snapshot type gains `readonly opposingPartyId: OwnerId`, set when the battle starts to the one owner in the hex that is not the human seat.
2. Eligibility: the hex must hold units of the human seat and of exactly one other owner. Otherwise refuse with "Hex is not contested by exactly two sides." `placingSide` becomes `parent.player === HUMAN_SEAT_ID ? HUMAN_SEAT_ID : battle.opposingPartyId`.
3. In `src/main/tacticalBattle/` and `src/main/gameActions/humanTacticalDraftCommit.ts`, replace every comparison with the literal `'opponent'` that means "the other party in this battle" with `battle.opposingPartyId`, and every one that means "not the human" with `!== HUMAN_SEAT_ID`. Also widen `'human' | 'opponent'` parameters that name the other party, including `attackerPlayer` on `validateTacticalHumanAirStrikeGroup` in `src/main/gameActions/tacticalHumanAirStrikeValidation.ts`, to `OwnerId`. A Neutral or `'opponent2'` battle cannot pass that function while the union is only two ids. List every changed file in your report.
4. Tempo sweep in a beat: `collectTacticalTempoAttacks({ battle, playerId: battle.opposingPartyId, alreadyAttackingSubUnitIds, holdFireParentUnitIds: holdFireUnitIdsForPlayer(battle.opposingPartyId) })`. Neutral has no `hold_fire` orders, so all its sub-units sweep.
5. When `opposingPartyId` is Neutral, the beat uses no opponent draft at all (Neutral never has one) and its sub-units never move.
6. The tactical **consultation** (which seat's model plans the opponent's beat) is not changed here. Leave those call sites in `src/main/openRouter/` and `src/main/gameIpcHandlers.ts` on `'opponent'`; stage 3 points them at `opposingPartyId`.
7. `filterMeleeCandidateHexesWithTacticalEntry` uses the same eligibility probe, so hexes with three or more parties drop out of the pause dialog automatically. Confirm it, and confirm that a match with no human seat never pauses for melee.

**Tests.** `src/main/tacticalBattle/tacticalPartiesSeats.test.ts` (new), three seats with `withSeatedTempGameDb`; move units with SQL to build the contested hexes:

- Human and `'opponent2'` in one hex: the battle starts and `opposingPartyId === 'opponent2'`.
- Human, `'opponent'`, and `'opponent2'` in one hex: refused with the new message.
- Human and a neutral unit (via `applyKnockout`): the battle starts with `opposingPartyId === 'neutral'`, and committing one human beat with no orders produces at least one ranged attack from a neutral sub-unit when one is in range (pick a layout where it is), with no error.
- A match with no human seat and two AI seats meeting in a hex: `ready()` resolves the melee without pausing.

Existing tactical tests use `'opponent'` as the other party and must keep passing unchanged.

**Docs.** `doc/combat-rules-v3.md` §12.1 (triggering a tactical battle): exactly two parties, the human and one other owner, which may be Neutral; Neutral sub-units hold their cells and fire through the sweep.

**Stage exit.** Report the output of:

```powershell
Get-ChildItem -Path src/main -Recurse -Filter *.ts | Where-Object { $_.Name -notlike '*.test.ts' -and $_.FullName -notmatch '\\openRouter\\|\\tools\\|callbackEvaluation|aiState|gameIpcHandlers|afterResolution|consultationPolicy' } | Select-String -SimpleMatch -Pattern "'opponent'"
```

Each remaining hit outside the AI pipeline must have a reason in your report (for example, the two-seat view in `loadScenarioState`).

**Done when.** `npm test` passes.
