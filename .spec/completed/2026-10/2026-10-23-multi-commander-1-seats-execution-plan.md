# Multi-commander games, stage 1: seats

Audience: a **lower-quality coding agent**. Read [multi-commander-execution-plan.md](multi-commander-execution-plan.md) first: its [Working rules](multi-commander-execution-plan.md#working-rules), [Verification bar](multi-commander-execution-plan.md#verification-bar), decisions, and glossary apply to every phase below.

Goal of this stage: replace the two hard-coded players with a seat roster in the main process, so that tests can create and resolve a match with three or four seats. A two-sided match keeps today's database ids, unit ids, prompts, screens, and results. The knockout rules and the global turn limit, which do apply to two-sided matches, land in stage 2.

This stage does **not** touch the AI pipeline (`src/main/openRouter/`, `src/main/tools/` model tools, `src/main/callbackEvaluation.ts`, `src/main/gameDb/aiState*.ts`) or the renderer. Where those still say `'opponent'`, leave them; stage 3 and stage 4 change them. If the compiler forces a change there because a type widened, make the smallest change that compiles, keep the behavior, and list the file in your report.

## Phases

| Phase | Title | Verifies with |
| --- | --- | --- |
| 1.1 | Seat vocabulary | New unit tests |
| 1.2 | Unit ids and names for several AI seats | Updated and new unit tests |
| 1.3 | Seat roster table and snapshot | New store tests; existing suite |
| 1.4 | New matches with two to four seats | New reset tests on real map data |
| 1.5 | Fog for every seat | New three-seat fog test |
| 1.6 | Control, traversal, and production for every owner | New three-seat tests |
| 1.7 | Turn resolution with one order set per owner | New three-seat turn tests; manual two-sided game |

---

## Phase 1.1: Seat vocabulary

**Goal.** One module owns every seat id and the Neutral owner id. One module owns the roster types and the pure helpers. Nothing uses them yet.

**Create `src/shared/seatIds.ts`** (new) with exactly this public surface. Add orienting comments in the style of `src/shared/unitIds.ts`.

```ts
export const HUMAN_SEAT_ID = 'human' as const;
export const AI_SEAT_IDS = ['opponent', 'opponent2', 'opponent3', 'opponent4'] as const;
export const NEUTRAL_OWNER_ID = 'neutral' as const;
export const MIN_SEATS = 2;
export const MAX_SEATS = 4;

export type AiSeatId = (typeof AI_SEAT_IDS)[number];
export type SeatId = typeof HUMAN_SEAT_ID | AiSeatId;
export type OwnerId = SeatId | typeof NEUTRAL_OWNER_ID;

export function isHumanSeatId(value: string): value is typeof HUMAN_SEAT_ID;
export function isAiSeatId(value: string): value is AiSeatId;
export function isSeatId(value: string): value is SeatId;          // human or AI
export function isNeutralOwnerId(value: string): value is typeof NEUTRAL_OWNER_ID;
export function isOwnerId(value: string): value is OwnerId;        // seat or Neutral
export function aiSeatIdForIndex(aiIndex: number): AiSeatId;       // 1 → 'opponent', 4 → 'opponent4'; RangeError otherwise
export function aiIndexForSeatId(seatId: string): number | null;   // 'opponent' → 1, 'opponent3' → 3, anything else → null
```

**Create `src/shared/seatRoster.ts`** (new):

```ts
export type SeatKind = 'human' | 'ai';
export const DOCTRINES = ['aggressive', 'balanced', 'cautious'] as const;
export type Doctrine = (typeof DOCTRINES)[number];
export const DOCTRINE_CHOICES = [...DOCTRINES, 'random'] as const;
export type DoctrineChoice = (typeof DOCTRINE_CHOICES)[number];
export const DEFAULT_DOCTRINE: Doctrine = 'balanced';
export type SeatOutReason = 'home_control' | 'no_city_hexes' | 'home_cities_destroyed';

export interface SeatCommander {
  readonly modelId: string | null;          // null = no model, standing orders only
  readonly reasoningEffort: string | null;  // null = the model's default
  readonly doctrineChoice: DoctrineChoice;
  readonly doctrine: Doctrine;              // the drawn doctrine when the choice is 'random'
}

export interface SeatRecord {
  readonly seatId: SeatId;
  readonly seatOrder: number;               // 1..4
  readonly kind: SeatKind;
  readonly homeRegion: string;              // display name, as getScenarioHomeRegionHexes resolves it
  readonly commander: SeatCommander | null; // null for the human seat
  readonly outTurn: number | null;
  readonly outBy: SeatId | null;
  readonly outReasons: readonly SeatOutReason[];  // empty while the seat is active; D12 order when it is out
  readonly place: number | null;            // set at knockout and at game end
  readonly consultationCount: number;
  readonly costUsd: number;
}

/** What the renderer receives: a random doctrine stays hidden until game over. */
export interface SeatSnapshot extends Omit<SeatRecord, 'commander'> {
  readonly commander: (Omit<SeatCommander, 'doctrine'> & { readonly doctrine: Doctrine | null }) | null;
}

export function sortSeatsByOrder<T extends Pick<SeatRecord, 'seatOrder'>>(seats: readonly T[]): T[];
export function isSeatActive(seat: Pick<SeatRecord, 'outTurn'>): boolean;
export function activeSeats<T extends Pick<SeatRecord, 'outTurn' | 'seatOrder'>>(seats: readonly T[]): T[];
export function activeAiSeats<T extends Pick<SeatRecord, 'outTurn' | 'seatOrder' | 'kind'>>(seats: readonly T[]): T[];
export function findHumanSeat<T extends Pick<SeatRecord, 'kind'>>(seats: readonly T[]): T | null;
export function findSeat<T extends Pick<SeatRecord, 'seatId'>>(seats: readonly T[], seatId: string): T | null;
export function enemySeatIdsOf(seats: readonly Pick<SeatRecord, 'seatId' | 'outTurn' | 'seatOrder'>[], seatId: SeatId): SeatId[];
export function toSeatSnapshot(seat: SeatRecord, revealDoctrine: boolean): SeatSnapshot;
export function shortSideName(displayName: string): string;
```

`shortSideName` follows [E14](multi-commander-execution-plan.md#engineering-decisions-frozen-unless-the-owner-overrides) exactly. `enemySeatIdsOf` returns active seats other than the given one, in seat order. `activeSeats` and `activeAiSeats` return seat order. `toSeatSnapshot` copies everything and sets `commander.doctrine` to `null` when `doctrineChoice === 'random'` and `revealDoctrine` is false.

**Tests.** `src/shared/seatIds.test.ts` (new) and `src/shared/seatRoster.test.ts` (new):

- `aiSeatIdForIndex` maps 1 to 4 and throws for 0 and 5; `aiIndexForSeatId` round-trips and returns null for `'human'`, `'neutral'`, and `'opponent5'`.
- The predicates accept and reject the right strings.
- `shortSideName`: the four examples in E14, plus "Iraq & Kuwait" → "Iraq", "South America" → "S. America", "Western Europe" → "W. Europe", "Central America" → "C. America", and a name with no compass word or separator is unchanged.
- `enemySeatIdsOf` skips the given seat and every seat with `outTurn` set.
- `toSeatSnapshot` hides a random doctrine until `revealDoctrine` is true, and never hides a chosen one.

**Docs.** In `doc/README.md`, add a row to the engine constants table: "Seat limits and seat ids | `MIN_SEATS`, `MAX_SEATS`, `AI_SEAT_IDS`, `HUMAN_SEAT_ID`, `NEUTRAL_OWNER_ID` in `src/shared/seatIds.ts`".

**Done when.** `npm test` passes, and this search lists only the two new modules and their tests:

```powershell
Get-ChildItem -Path src -Recurse -Filter *.ts | Select-String -SimpleMatch -Pattern 'seatIds', 'seatRoster' | Select-Object -ExpandProperty Path -Unique
```

---

## Phase 1.2: Unit ids and names for several AI seats

**Goal.** Units of `'opponent2'` to `'opponent4'` get ids `a2-…` to `a4-…`. A unit that later belongs to Neutral keeps its id and its name style.

**Read first.** `src/shared/unitIds.ts` (whole file), `src/shared/unitDisplayNames.ts` (`unitDisplayOwner`, `formatUnitNumberLabel`, `unitDisplaySequenceGroupKey`), `.spec/completed/unit-id-format-execution-plan-v1.md` (the grammar).

**Change.**

1. `src/shared/unitIds.ts`:
   - Delete the `UnitIdOwner` type. Every use becomes `SeatId` from `seatIds.ts`.
   - `playerIdCodeFor(player: SeatId)`: `'h1'` for the human seat, `` `a${aiIndexForSeatId(player)}` `` for an AI seat.
   - `parseStrategicUnitId`: accept player index `1` for `h` and `1` to `4` for `a`. Reject everything else, as today.
   - `unitIdOwnerFromId` returns `SeatId | null`: `h1` gives `'human'`; `aN` gives `aiSeatIdForIndex(N)`; the legacy `human-` and `opponent-` prefixes keep working.
   - Update the module comment that says additional AI players are out of scope.
2. `src/shared/unitDisplayNames.ts`:
   - `unitDisplayOwner(unit)` returns `SeatId | 'other'`. When `unit.player` is a seat id, return it. Otherwise (Neutral, or anything else) return `unitIdOwnerFromId(unit.id) ?? 'other'`. This keeps a neutral unit's number and numeral style: it was created by a seat and its id says which.
   - `formatUnitNumberLabel`: Roman numerals when `unitDisplayOwner` is an AI seat id, ordinals otherwise.
   - `unitDisplaySequenceGroupKey` keeps using `unitDisplayOwner`, so sequences stay per original seat.
3. `src/main/gameDb/gameConfigKv.ts` and `src/main/gameDb/seeding/plannedUnits.ts`: the id and display counters are already keyed by the raw player value, so `unit_id_sequence_opponent2_air` works with no change. Widen any `'human' | 'opponent'` parameter type to `SeatId`. Change `PlannedUnitOwner` to `SeatId`.
4. `src/main/gameActions/controlAndProduction.ts`, `spawnProducedUnitsForHex`: replace the `controllerPlayerId !== 'human' && controllerPlayerId !== 'opponent'` guard with `!isSeatId(controllerPlayerId)`. Keep the throw. (Phase 1.6 makes sure Neutral never reaches it.)

**Tests.**

- `src/shared/unitIds.test.ts`: add cases: `formatStrategicUnitId` for `'opponent3'` gives `a3-…`; `parseStrategicUnitId('a4-t2')` parses; `parseStrategicUnitId('a5-t2')` and `parseStrategicUnitId('h2-t2')` return null; `unitIdOwnerFromId('a2-i7')` is `'opponent2'`. Keep every existing case.
- `src/main/unitDisplayNames.test.ts` (the existing tests for `src/shared/unitDisplayNames.ts`): a unit `{ id: 'a3-t2', player: 'opponent3' }` gets a Roman numeral; the same id with `player: 'neutral'` gets the same label; `{ id: 'h1-i4', player: 'neutral' }` gets an ordinal.

**Done when.** `npm test` passes and this search has no output:

```powershell
Get-ChildItem -Path src -Recurse -Filter *.ts | Select-String -SimpleMatch -Pattern 'UnitIdOwner'
```

---

## Phase 1.3: Seat roster table and snapshot

**Goal.** The match database stores the roster in a `seats` table. A new two-sided match writes two rows. Every snapshot carries the roster and every seat's home hexes. The two scenario home-region keys go away.

**Read first.** `src/main/gameDb/schema.ts`, `src/main/gameDb.ts` (`EXPECTED_USER_VERSION`, `createFreshGameDatabaseAt`, the facade functions), `src/main/gameDb/databaseValidation.ts` (`GAME_DB_REQUIRED_TABLES`), `src/main/gameDb/scenarioState.ts`, `src/main/gameDb/resetGame.ts` (`resetGameForNewMatch`), `src/main/gameDb/fogState.ts` (`withScenarioMetadata`, `getGameStateSnapshot`), `src/shared/ipc/gameStateTypes.ts`, `src/shared/homeRegionRules.ts` (`computeIntersectingHomeRegionHexes`, `computeContestedHomeRegionHexes`).

**Change.**

1. **Schema.** Add to `getFullDdl()`:

   ```sql
   CREATE TABLE IF NOT EXISTS seats (
     seat_id TEXT PRIMARY KEY,
     seat_order INTEGER NOT NULL UNIQUE CHECK (seat_order BETWEEN 1 AND 4),
     kind TEXT NOT NULL CHECK (kind IN ('human', 'ai')),
     home_region TEXT NOT NULL,
     model_id TEXT,
     reasoning_effort TEXT,
     doctrine_choice TEXT CHECK (doctrine_choice IN ('aggressive', 'balanced', 'cautious', 'random')),
     doctrine TEXT CHECK (doctrine IN ('aggressive', 'balanced', 'cautious')),
     out_turn INTEGER,
     out_by TEXT,
     out_reasons TEXT NOT NULL DEFAULT '[]',
     place INTEGER,
     consultation_count INTEGER NOT NULL DEFAULT 0,
     cost_usd REAL NOT NULL DEFAULT 0
   );
   ```

   Add `'seats'` to `GAME_DB_REQUIRED_TABLES`. Bump `EXPECTED_USER_VERSION` by one. Do not rename `GAME_DB_FILE_NAME`. (The existing recovery path renames the old file aside on first launch; that is the project's convention for a schema change.)

2. **Store.** Create `src/main/gameDb/seatRosterStore.ts` (new). It takes the same `DbReadOps` / `DbWriteOps` style as `scenarioState.ts`:

   ```ts
   export function readSeatRoster(ops: Pick<DbReadOps, 'getAll'>): SeatRecord[];   // seat order
   export function replaceSeatRoster(ops: Pick<DbWriteOps, 'run'>, seats: readonly SeatRecord[]): void;
   ```

   `readSeatRoster` maps columns to `SeatRecord`. An AI row with a null `doctrine` reads as `DEFAULT_DOCTRINE`, and a null `doctrine_choice` reads as the doctrine. A human row has `commander: null`. `out_reasons` is a JSON array of `SeatOutReason` in [D12](multi-commander-execution-plan.md#knockout-and-neutral) order. Invalid JSON or an unknown id is logged with `logError` and read as `[]`. `replaceSeatRoster` deletes every row and inserts the given ones. Later phases add more writers here; keep this file the only place that runs SQL against `seats`.

   Add facade functions in `src/main/gameDb.ts` next to the other facades: `getSeatRoster(): SeatRecord[]`.

3. **Reset.** In `resetGameForNewMatch`, after the homes are resolved and before units are seeded, write a two-row roster:
   - `{ seatId: 'human', seatOrder: 1, kind: 'human', homeRegion: <resolved human home> , commander: null, … }`
   - `{ seatId: 'opponent', seatOrder: 2, kind: 'ai', homeRegion: <resolved AI home>, commander: { modelId: null, reasoningEffort: null, doctrineChoice: 'balanced', doctrine: 'balanced' }, … }`

   Every outcome and counter field starts null or zero. Add `DELETE FROM seats` to the reset's delete list. Phase 1.4 replaces this two-row construction with the general one; stage 3 fills the commander from the real settings.

4. **Scenario state.**
   - `persistRegionVsRegionScenarioState` keeps writing `scenario_id` and stops writing `scenario_region_human` and `scenario_region_ai`. Rename it `persistRegionVsRegionScenarioId` and drop its homes argument. Delete `HUMAN_HOME_REGION_KEY` and `AI_HOME_REGION_KEY`.
   - `loadScenarioState` keeps its return shape and reads `humanHomeRegion` from the `'human'` seat and `aiHomeRegion` from the `'opponent'` seat. A missing seat gives `''`. Document that both fields are a two-seat view kept for existing callers.
   - Update `src/main/sideGroupSeed.test.ts`, which calls the old function: write the roster with `replaceSeatRoster` instead. This is a named, expected test change.

5. **Snapshot.** In `src/shared/ipc/gameStateTypes.ts` add two optional fields next to `humanHomeRegion` (optional like their neighbors; `getGameStateSnapshot` always sets them):
   - `seats?: readonly SeatSnapshot[]`: the roster in seat order.
   - `homeRegionHexesBySeat?: Readonly<Record<string, readonly string[]>>`: each seat's home hexes, keyed by seat id.

   In `withScenarioMetadata` (`fogState.ts`), read the roster, set both fields (`toSeatSnapshot(seat, gameOver)`), and keep setting `humanHomeRegion`, `aiHomeRegion`, `humanHomeRegionHexes`, and `aiHomeRegionHexes` from the `'human'` and `'opponent'` seats so existing consumers keep working.

   Compute `intersectingHomeRegionHexes` as "hexes in two or more seats' homes" and `contestedHomeRegionHexes` over every seat's home. Generalize `computeIntersectingHomeRegionHexes` in `src/shared/homeRegionRules.ts` to take `readonly (readonly string[])[]` (all homes) instead of two lists; update its callers (`grep -rn computeIntersectingHomeRegionHexes src`).

**Tests.**

- `src/main/gameDb/seatRosterStore.test.ts` (new), inside `withTempGameDb`: a three-row roster round-trips through `replaceSeatRoster` and `readSeatRoster` field for field, in seat order; a duplicate `seat_order` throws.
- `src/main/gameDb/resetGameSeats.test.ts` (new), inside `withTempGameDb`: after `resetGameForNewMatch()`, the roster has exactly `'human'` (order 1) and `'opponent'` (order 2) with the homes `loadScenarioState` reports; `getGameStateSnapshot().seats` has two entries and `homeRegionHexesBySeat.human` equals `humanHomeRegionHexes`.
- `src/main/homeRegionRules.test.ts` (the existing tests for `src/shared/homeRegionRules.ts`): three homes where one hex is in two of them returns that hex once.

**Search for your report.** This must have no output:

```powershell
Get-ChildItem -Path src -Recurse -Filter *.ts | Select-String -SimpleMatch -Pattern 'scenario_region_human', 'scenario_region_ai'
```

**Done when.** `npm test` passes.

---

## Phase 1.4: New matches with two to four seats

**Goal.** The main process can start a match from a list of two to four seats, on either map type, with or without a human. The current new-game screen keeps working unchanged through a two-seat translation of its old fields.

**Read first.** `NewGameIpcPayload` in `src/shared/ipc/ordersTypes.ts`; the `IPC_GAME.newGame` handler in `src/main/main.ts`; `ResetGameForNewMatchOptions` and `resetGameForNewMatch` in `src/main/gameDb/resetGame.ts`; `resolveScenarioHomeRegions`, `resolveSideGroupHomeNames`, `listScenarioHomeRegions`, `installedSideGroups` in `src/main/regionScenario.ts`; `assertRegionalSideGroupsDistinct` in `src/main/gameMap/loadGameMap.ts`; `trySeedScenarioRegionVsRegion` and `buildSidePlan` in `src/main/gameDb/seeding/regionScenarioSeeding.ts`; `src/shared/initialPlacementSides.ts`; `seedInitialHexControlFromUnitOccupancy`, `seedInitialHexControlFromHomeRegions`, `logHomeRegionControlParity`.

**Change.**

1. **Payload.** Add to `NewGameIpcPayload` and `ResetGameForNewMatchOptions`:

   ```ts
   /** One entry per side, in row order. When present, the old human/AI home fields are ignored. */
   readonly seats?: readonly NewGameSeatInput[];
   ```

   Define `NewGameSeatInput` in `src/shared/ipc/ordersTypes.ts`:

   ```ts
   export interface NewGameSeatInput {
     readonly kind: 'human' | 'ai';
     readonly homeRegion?: string;    // global map: a UN subregion name
     readonly sideGroupId?: string;   // regional map: a side group id
     readonly commander?: { readonly modelId: string | null; readonly reasoningEffort: string | null; readonly doctrineChoice: DoctrineChoice };
   }
   ```

2. **Seat resolution.** Create `src/main/gameDb/seatResolution.ts` (new) with one entry point:

   ```ts
   export function resolveNewMatchSeats(input: {
     readonly mapKind: 'global' | 'regional';
     readonly seats: readonly NewGameSeatInput[];
   }): Array<Omit<SeatRecord, 'commander'> & { readonly commanderInput: NewGameSeatInput['commander'] | null }>;
   ```

   Rules, each with its own clear error message (`throw new Error(...)`):
   - Between `MIN_SEATS` and `MAX_SEATS` entries.
   - At most one `kind: 'human'`.
   - Seat ids: the human entry gets `'human'`; AI entries get `aiSeatIdForIndex(1)`, `(2)`, … in row order.
   - Seat order: the human seat is 1 when present; AI seats follow in row order. Without a human, the first row is seat 1.
   - Regional: every `sideGroupId` must exist in `installedSideGroups()`; duplicates throw. A missing `sideGroupId` takes the first installed group not used by an earlier row. More rows than groups throws. `homeRegion` becomes the group's display name, as `resolveSideGroupHomeNames` does today. Do not add a display-name column. Short names are `shortSideName(homeRegion)`.
   - Global: every `homeRegion` must be in `listScenarioHomeRegions()`; duplicates throw. A missing or unknown name takes the first listed region not used by an earlier row.
   - Replace `assertRegionalSideGroupsDistinct` with this function's checks. Delete the old function once nothing calls it.

3. **Two-seat translation of the old fields.** In `resetGameForNewMatch`, when `options.seats` is absent, build `[{ kind: 'human', homeRegion/sideGroupId from the human fields }, { kind: 'ai', … from the AI fields }]` and continue through the same resolution. Keep today's fallback behavior for unknown names. This translation exists only until the new-game screen sends `seats` (stage 4) and is deleted in stage 5. Say so in its orienting comment without naming a stage.

4. **Roster.** Write the resolved seats with `replaceSeatRoster`. Commander for each AI seat: the input's commander when given (doctrine `'random'` is resolved in stage 3; for now store `doctrine: DEFAULT_DOCTRINE` alongside `doctrineChoice: 'random'`), otherwise `{ modelId: null, reasoningEffort: null, doctrineChoice: 'balanced', doctrine: 'balanced' }`.

5. **Seeding.** In `trySeedScenarioRegionVsRegion`:
   - Change `InitialPlacementSide` in `src/shared/initialPlacementSides.ts` to `SeatId`. `findMixedInitialPlacementHexes` already works for any number of sides.
   - Read the roster instead of `loadScenarioState` homes. Call `buildSidePlan(seat.seatId, seat.homeRegion)` for every seat in seat order, sharing the one `occupiedByHex` map, then `insertPlannedUnitsForPlayer` for every seat in seat order.
   - Do not change the per-side unit counts, substitutions, caps, or placement rules.
   - The legacy world path in `src/main/gameDb/seeding/seedUnits.ts` is unreachable (reset always writes the region-versus-region scenario). Widen its types only if the compiler forces it. Do not extend it.

6. **Initial control.** `seedInitialHexControlFromHomeRegions` takes the roster and sets each seat's home hexes to that seat, skipping hexes in two or more homes. `logHomeRegionControlParity` reports per seat.

7. **Main handler.** In `src/main/main.ts`, pass `payload.seats` through to `resetGameForNewMatch`. Nothing else changes in the handler.

**Tests.** Create `src/main/testSupport/withSeatedTempGameDb.ts` (new): like `withTempGameDb`, but calls `resetGameForNewMatch(options)` with the options it is given. Then create `src/main/gameDb/newMatchSeats.test.ts` (new) using it:

- Regional `western_asia_north` with four seats (one human, three AI) on four different side groups: the roster has seat ids `human`, `opponent`, `opponent2`, `opponent3` in orders 1 to 4; every seat has at least one unit and every unit stands in its own seat's home; every non-shared home hex is controlled by its seat; unit ids use `h1`, `a1`, `a2`, `a3`.
- Regional with three AI seats and no human: seat 1 is `'opponent'`; no unit has `player = 'human'`.
- Global with three seats on three different regions: three rosters rows, three sets of units.
- Errors: five seats; two humans; the same side group twice; the same global region twice; one seat.
- No `seats`: the old fields still give a two-row roster (`human`, `opponent`).

Look up the real side-group ids and region names from data (`listGameMaps()` in tests, or `installedSideGroups()` after `ensureGameMapLoaded`). Do not hard-code ids you have not read from the data.

**Docs.** `doc/region-summary-1.md` does not change. In `doc/combat-rules-v3.md`, the section that describes setup and seeding: say that a match has two to four sides, each seeded the same way in its own home. Keep the voice of that section.

**Done when.** `npm test` passes. The app still starts a two-sided match from today's screen (no manual check yet; phase 1.7 has it).

---

## Phase 1.5: Fog for every seat

**Goal.** Fog of war is computed and stored for every active seat, not for two fixed players.

**Read first.** `src/main/gameDb/fogState.ts` (whole file), `src/main/visibility.ts` (`computeVisibleHexesForSide`), `getForcedVisibleHomeRegionHexesForPlayer` in `src/shared/homeRegionRules.ts`, `consumeFogNewContactsForPlayer` and `getGameStateForPlayer` in `src/main/gameDb.ts`.

**Change.**

1. Delete `FOG_PLAYERS`. `refreshFogOfWarIntelFromCurrentState` reads the roster and refreshes every active seat in seat order (all seats for now; stage 2 adds knockouts).
2. Its `traversedHexesByPlayer` option becomes `Readonly<Partial<Record<SeatId, readonly string[]>>>`.
3. With fog off, it deletes the intel tables and the `fog_new_contacts_<seatId>` key of every seat in the roster.
4. Every `'human' | 'opponent'` parameter in this file and in the matching `gameDb.ts` facades becomes `SeatId`: `consumeFogNewContactsForPlayer`, `getGameStateForPlayer`, `refreshFogOfWarIntelForPlayer`. The same narrow type is repeated on the wrappers in `src/main/main.ts` and `src/main/gameIpcHandlers.ts`. Widen those too, or the build breaks. Keep their call sites passing `'human'` or `'opponent'`.
5. `getForcedVisibleHomeRegionHexesForPlayer(state, playerId: SeatId, …)` reads `state.homeRegionHexesBySeat?.[playerId] ?? []`.
6. `getGameStateForPlayer` keeps its behavior. "Enemy" stays `u.player !== playerId`, which already covers several seats and Neutral.
7. Callers that pass `'human'` or `'opponent'` keep doing so; only the types widen.

**Tests.** `src/main/gameDb/fogSeats.test.ts` (new), using `withSeatedTempGameDb` with fog on and three seats:

- After reset, `player_hex_intel` has rows for all three seat ids.
- `getGameStateForPlayer('opponent2')` lists every `'opponent2'` unit, and its `visibleHexes` include `'opponent2'`'s whole home (forced visible).
- With fog off, a refresh leaves no `fog_new_contacts_%` keys.

**Done when.** `npm test` passes and this search has no output:

```powershell
Get-ChildItem -Path src -Recurse -Filter *.ts | Select-String -SimpleMatch -Pattern 'FOG_PLAYERS'
```

---

## Phase 1.6: Control, traversal, and production for every owner

**Goal.** Capture by movement, control after combat, production, and the air-base check work for any number of seats. Neutral land capture follows [D15](multi-commander-execution-plan.md#knockout-and-neutral). Neutral never builds. `controlAndProduction.ts` is about 508 lines; if this edit would carry it past 600, put the neutral-traversal branch in a new module beside it.

**Read first.** `src/main/gameActions/controlAndProduction.ts` (whole file), `src/main/gameActions/invalidAirBase.ts`, `src/main/productionCaps.ts`, `src/shared/unitCountsByType.ts`.

**Change.**

1. `collectTraversedHexesByPlayer` returns `Map<OwnerId, Set<string>>`. Record a seat's traversal under that seat id for infantry, armor, and naval, which is today's `CONTROL_UNIT_TYPES`. Record Neutral traversal only for infantry and armor. Skip Neutral naval and air. Today's line `const player = unit.player === 'opponent' ? 'opponent' : 'human'` goes away. A unit whose owner is neither a seat nor Neutral is still skipped. The Neutral key is for capture only. Fog still runs per active seat, and Neutral has none.
2. `resolveStrategicControlAfterCombatAndMovement(traversed)` follows [D15](multi-commander-execution-plan.md#knockout-and-neutral):
   - Occupied hexes: a sole occupant becomes the controller, and Neutral counts. Two or more owners keep the current controller.
   - Empty hexes: Neutral infantry or armor traversal sets the controller to `NEUTRAL_OWNER_ID`, even when a seat also traversed the hex and even when it was `NULL`. Otherwise flip only when exactly one seat traversed the hex.
   - When the Neutral set is empty, empty-hex results match the current two-player rule. Keep that path covered by the existing production tests.
3. `processProductionAfterControlResolution`:
   - Skip every hex whose controller is not a seat id (`null` or `'neutral'`). Those hexes accrue nothing and spawn nothing.
   - `deployedByPlayer` and `capReachedByPlayer` become `ReadonlyMap<SeatId, …>` with one entry per seat in the roster. Read the cap list for the hex's controller from that map.
   - Where `ReadyResult` mirrors these as `humanDeploymentCapReachedUnitTypes` and `opponentDeploymentCapReachedUnitTypes`, keep both fields and fill them from the `'human'` and `'opponent'` entries. Stage 3 replaces the opponent field.
4. `destroyAirUnitsWithInvalidBase` already compares the airport controller to the unit's owner. Confirm it does not special-case two players; change nothing if it does not.
5. Changing the traversal type breaks every reader of `.human` and `.opponent`. Update those reads in this phase, still for the two seat ids, so the project compiles. The files are `readyStrategicResolutionPipeline.ts`, `meleeInterceptReadyFinalize.ts`, and the traversal field on the melee-pause snapshot. `gameActionsProduction.test.ts` passes the return value straight through and must stay unchanged. One order set per owner is still phase 1.7.

**Tests.** `src/main/gameActions/controlAndProductionSeats.test.ts` (new), using `withSeatedTempGameDb` with three seats:

- An `'opponent2'` armor that moves through an empty, unowned hex captures it; when `'opponent'` and `'opponent2'` both traverse the same empty hex, it stays unowned.
- A Neutral infantry order that passes through one empty hex and ends on another sets both to `'neutral'`. The same path for a Neutral naval unit changes neither hex. When that Neutral infantry and `'opponent'` both traverse one empty hex, the hex becomes `'neutral'`.
- A hex controlled by `'opponent2'` with a queued infantry and enough progress spawns a unit with player `'opponent2'` and an id starting `a2-`.
- A hex with controller `'neutral'` and a queue row accrues no progress and spawns nothing.

Use direct SQL to set up the state, as `src/main/gameActionsProduction.test.ts` does.

**Done when.** `npm test` passes; the existing `gameActionsProduction.test.ts` cases pass unchanged.

---

## Phase 1.7: Turn resolution with one order set per owner

**Goal.** `ready` takes one order set per owner. A turn with three or four seats resolves end to end. Two-sided Ready from the app works exactly as before.

**Read first.** `ready` in `src/main/gameActions/gameActionsReadyEntrypoints.ts`; `executeReadyStrategicTurn` and `ReadyStrategicPlanningConstants` in `src/main/gameActions/readyStrategicResolutionPipeline.ts`; `finalizeReadyTurnAfterMelee` in `src/main/gameActions/meleeInterceptReadyFinalize.ts`; `setMeleeInterceptPendingSnapshot` and `executeResolveMeleeIntercept` (`src/main/gameActions/meleeInterceptStrategicResolve.ts`); `autoDebarkOpponentLandUnitIfMovingIndependently` and `applyEmbarkOrdersForPlayer` in `src/main/gameActions/sealift.ts`; `handleGameReady` in `src/main/gameIpcHandlers.ts` (only its `deps.ready(...)` call).

**Change.**

1. Create `src/main/gameActions/ownerTurnOrders.ts` (new):

   ```ts
   /** Everything one non-human owner orders for one strategic turn. */
   export interface OwnerTurnOrders {
     readonly movementOrders: readonly MovementOrder[];
     readonly rangedOrders: readonly RangedAttackOrder[];
     readonly airStrikeOrders: readonly AirStrikeOrder[];
     readonly ferryOrders: readonly FerryOrder[];
     readonly embarkOrders: readonly EmbarkOrder[];
   }
   export type TurnOrdersByOwner = ReadonlyMap<OwnerId, OwnerTurnOrders>;
   export const EMPTY_OWNER_TURN_ORDERS: OwnerTurnOrders;
   /** Drops (and logs) any order whose unit is missing or does not belong to that owner. */
   export function keepOrdersOfOwnedUnits(owner: OwnerId, orders: OwnerTurnOrders, unitOwnerById: ReadonlyMap<string, string>): OwnerTurnOrders;
   ```

   The human's orders still come from the pending tables, as today. `TurnOrdersByOwner` never contains `'human'`; `ready` logs an error and ignores a `'human'` key.

2. `ready(ordersByOwner: TurnOrdersByOwner = new Map())` replaces the five positional arrays on `ready` in `gameActionsReadyEntrypoints.ts`. Six test calls pass no arguments today: five in `src/main/gameActionsProduction.test.ts` and one in `src/main/gameActionsMultiSelect.test.ts`. They keep working. If the code has another, trust the code and list it in your report.

3. `executeReadyStrategicTurn`:
   - `ReadyStrategicPlanningConstants.humanPlayerId` becomes `typeof HUMAN_SEAT_ID`.
   - Keep the human merge that is already in this function. Generate the human seat's standing orders, then overlay the human pending tables for movement, ranged, air, and ferry. Do not generate standing orders here for any other owner. Their orders arrive only in the map. Generating them twice would double attacks.
   - Run `keepOrdersOfOwnedUnits` for each map entry against the pre-move snapshot.
   - Embark: `applyEmbarkOrdersForPlayer(orders.embarkOrders, owner)` for each map entry, in seat order, Neutral last. Today the only call is `applyEmbarkOrdersForPlayer(aiEmbarkOrders, 'opponent')`. Human embark is not applied here. Do not add a human call.
   - Build the air, ranged, movement, and ferry lists as the merged human lists first, then each map entry in seat order, then Neutral. A two-seat match stays human then `'opponent'`, so the dice stream does not change. An empty Neutral list adds nothing.
   - `autoDebarkOpponentLandUnitIfMovingIndependently` returns immediately unless `player === 'opponent'`. Rename it `autoDebarkNonHumanLandUnitIfMovingIndependently` and let it debark any embarked land unit whose owner is not the human seat. `shouldSkipEmbarkedLandIndependentMove` stays human-only. Without the wider auto-debark, an `'opponent2'` cargo order would move the unit and leave it embarked.
   - `opponentHadStrategicMarchResolution` stays a boolean on `ReadyResult` and on the melee-pause snapshot. It is true when the `'opponent'` seat moved, which is what `consultationPolicy.ts` reads today. Read that seat from the traversal map. Do not turn the field into a map in this phase.
4. The melee-pause snapshot (`setMeleeInterceptPendingSnapshot` and its type) stores traversal as `Record<string, string[]>` keyed by owner id, including Neutral when it traversed anything. The resume path reads it back the same way and passes it to control resolution. Fog on resume still iterates active seats only.
5. `finalizeReadyTurnAfterMelee`:
   - Control-loss lightning counts transitions **from** `'human'` to any other controller.
   - Fog refresh passes traversal for every seat.
   - The participant and removed-unit lists that feed `addAiLossEventsSinceConsultation` are built per AI seat, and the function is called once per AI seat with that seat's lists. Keep the `ReadyResult` fields `opponentCombatParticipantUnitIds` and `removedOpponentUnitIds` filled from the `'opponent'` seat only; stage 3 replaces them.
   - `humanMoves` stays the human's moves; `aiMoves` carries every non-human owner's moves (each move already names its unit, and playback looks the owner up).
6. `handleGameReady` builds `new Map([['opponent', { movementOrders: aiOrders, rangedOrders: aiRangedOrders, airStrikeOrders: aiAirStrikeOrders, ferryOrders: aiFerryOrders, embarkOrders: aiEmbarkOrders }]])` from the arrays it already has and calls `deps.ready(map)`. Update the `deps.ready` type. Nothing else in the handler changes in this stage.

**Tests.**

- `src/main/gameActions/readySeats.test.ts` (new), with `withSeatedTempGameDb` and three seats on `western_asia_north`:
  - `ready(new Map([['opponent2', { …EMPTY_OWNER_TURN_ORDERS, movementOrders: [one legal move of an opponent2 infantry] }]]))` moves that unit and advances the turn to 2.
  - An order in the `'opponent'` set that names an `'opponent2'` unit is dropped and the unit does not move.
  - Five consecutive `ready()` calls with no orders leave the turn at 6, with no thrown error, fog rows for all three seats, and the roster unchanged.
- Existing `src/main/gameIpcHandlers.test.ts` cases that inspect what `deps.ready` received: update the fake `ready` to accept the map and assert on `map.get('opponent')`. This is a named, expected test change; change only the fake and its assertions.

**Manual check (two-sided regression).** Ask the human to run `npm start`, start a new regional match from today's screen with "No model" selected (or the Run button off), give orders for three turns including one move into a contested hex, and confirm: units move, combat resolves, the turn report toast appears, and nothing looks different from before this stage.

**Stage exit search for your report** (do not fix what it finds; list it):

```powershell
Get-ChildItem -Path src -Recurse -Filter *.ts | Where-Object { $_.Name -notlike '*.test.ts' } | Select-String -SimpleMatch -Pattern "'human' | 'opponent'", "'opponent' | 'human'"
```

Every remaining hit must be in the AI pipeline or the renderer (stage 3 and stage 4 work). A hit anywhere else is a miss in this stage: report it.

**Done when.** `npm test` passes, the human confirms the manual check, and the search output is in your report.
