# Origin Bonuses Execution Plan

Add two optional new-game flags, **Country bonus** and **Terrain bonus**. When a flag is on, a unit that qualifies adds 1 to the hit threshold of the die it is already rolling. Live dice, `estimate_combat`, `assess_unit`, `assess_hex`, the Commander briefing, the AI combat rules paragraph, and the unit flag tooltip all reflect the bonus.

## Rules for the Implementer

- Never commit or push.
- Do not put this document's phase numbers, phase names, or headings into product code, comments, configuration, lint messages, or docs.
- Every new or changed function, field, and type gets an orienting comment in the house format (`Purpose:` / `When to use:` / `Expected outcome:` / `Exceptions:` for functions; `Contract:` / `When to use:` / `Expected outcome:` / `Exceptions:` for fields). Copy the style from `src/main/gameDb/gameSizeConfig.ts` and `src/main/unitOrigin/res4BirthCountryCache.ts`.
- Main-process code: `logDebug` on public entry points, `logTrace` on getters, `logError` in every `catch`, using `../logger`. Shared modules (`src/shared`) and renderer modules do not log; follow `src/shared/unitOriginTooltipText.ts`.
- Mark everything `readonly` / `const` where it is not mutated. Use `ReadonlyMap`, `ReadonlyArray`, and `as const`.
- File names and identifiers follow `doc/naming-conventions-contract-v1.md`. Only these role suffixes are allowed: `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, `Types`. A `*Types.ts` file holds types only, with no runtime values.
- Functions keep 6 or fewer named parameters. Use a parameter object instead.
- File size:
  - `src/main/gameDb.ts` (about 1560 lines) must not grow. Every change there must remove at least as many lines as it adds.
  - `tacticalStrategicOrderPhases.ts` (about 800), `combatResolution.ts` (about 700), `briefingFormatter.ts` (about 700), and `briefingFormatter.test.ts` (about 980) are already over 600 lines. Add only the lines this plan names. New logic goes in the new modules this plan creates.
  - Every other file stays under 600 lines.
- Tests cover happy paths and essential failures only. A new test file copies the style of an existing test in the same folder (`node:test` with `test(...)`, or a plain `assert` script like `src/main/gameDb/gameSizeConfig.test.ts`).
- If an existing test asserts an exact list of snapshot keys or an exact object shape, add the new keys to that assertion. Do not loosen anything else.
- If a fact in this document does not match the code, stop and report the difference. Do not invent a different rule.

## Locked Decisions

### The Bonus

- The bonus is `ORIGIN_HIT_BONUS = 1`. It is added to the threshold in `roll <= threshold`. It never changes how many dice are rolled, so the seeded RNG stream keeps the same length.
- Rolls that get the bonus when the rolling unit qualifies at its current position:
  - Ranged fire and ranged return fire (strategic and tactical), including standing-order DEFEND fire.
  - Melee: the attack roll and the defense roll. Melee roles come from the existing side shuffle. Do not change it.
  - Air strikes on units and on infrastructure (strategic and tactical). The air unit is judged where its base is, which is its own `h3Index`. The target does not matter.
  - Air-strike counter-fire by defending units (strategic and tactical).
  - Tactical ranged fire at infrastructure.
- These do **not** change:
  - Infrastructure's fixed counter-fire rolls (1 or 2).
  - Every casualty sort and air-strike victim pick. They keep `getDefense(unitType)`.
  - Movement, ranges, enter costs, range caps, ferry range, sub-unit counts, and production.
  - The combat stats line (`buildCombatStatsLine`), which still prints the base values.
  - Best Options rows and their ranking. They do not use hit odds today.
- When both flags qualify on the same roll, the bonus is still +1.
- A unit without `origin` never qualifies. An origin field that is `null` never matches anything, including a place value that is also `null`.

### Where a Unit Stands

- Positions are taken at the moment of the roll. Air strikes and ranged fire use pre-move positions. Strategic and tactical melee use post-move positions, which is the melee hex or cell. This already matches the `h3Index` on each `CombatUnit` when it is built for that phase. Tactical cargo already shares its carrier's `h3Index`, so always use the sub-unit's own `h3Index`.
- Strategic place country: the **majority country** of the res1 hex. Count the res4 cells inside the hex that have a birth country (from `buildRes4BirthCountryByH3`). The name with the most cells wins. Ties go to the name that sorts first by UTF-16 code units. A hex with no counted cells has no country.
- Tactical place country: the res4 cell's own birth country, the same value used for unit births.
- Tactical place terrain: `effectiveRes4TerrainKindString(battle, cell)`, normalized (see below), read from the battle snapshot the resolution step starts with.
- Country identity is equality of canonical country **names** (`UnitOrigin.birthCountryName` against the place name). Codes can be `null` for disputed areas, so do not compare codes.
- Terrain matching normalizes both sides with `normalizeOriginTerrainKind`: trim, lowercase, map `ocean` and `sea` to `water`, `forests` to `forest`, `mountains` to `mountain`, `wetland` to `wetlands`, and then accept only `PIPELINE_TERRAIN_KINDS`. Anything else becomes `null`. Urban and rubble are flags, not kinds, and never affect the match.
- The terrain bonus applies only in tactical battles. The strategic map uses the country test only.
- Tactical sub-units use their parent's origin. Copy the parent's `origin` onto each sub-unit when the battle snapshot is created.

### Settings

- `game_config` keys: `country_bonus_enabled` and `terrain_bonus_enabled`. Values are `'1'` and `'0'`. A missing row, a missing database, or any other value reads as **off**.
- The new-game checkboxes are **checked by default** and are checked again every time the overlay opens, exactly like Fog of war.
- The renderer always sends explicit booleans. Main treats a missing payload field as **off**. This keeps existing tests and callers on the old dice. Do not "fix" this asymmetry.
- The game-state snapshot always carries `countryBonusEnabled` and `terrainBonusEnabled` as booleans.

### AI Surfaces

- `estimate_combat`: `attackValue` and `defenseValue` in the summaries report the effective threshold, and every hit probability uses it. Rows whose unit qualifies add `originBonus: 1`. Real melee attackers are judged at the **target** hex, because that is where melee happens. Real ranged attackers are judged where they stand. Defenders are judged at the target. Assumed units never qualify.
- `assess_unit` adds these fields to its `unit` block:
  - `originBonusHere: OriginBonusSource[]` when a relevant flag is on: the country bonus on the strategic map, and either flag in a battle. The list is empty when the unit does not qualify.
  - `birthCountry: string | null` when the country bonus is on (both modes).
  - `birthTerrain: PipelineTerrainKind | null` in a battle when the terrain bonus is on.
- `assess_hex` (strategic only) adds `country: string | null` when the country bonus is on. The briefing's supplemental hex bullets append `; country <name>` when that field is a string.
- The Unit Status table in both briefings gains a `Bonus` column only when the assessments carry `originBonusHere`.
- With both flags off, every briefing, tool result, and prompt is byte-for-byte unchanged.
- The combat rules paragraph gains one origin-bonus rule only when a flag that applies to the current mode is on. The exact text is in the prompt phase below. It names no tools and no briefing sections, because both can be absent.
- Tool names, tool catalog descriptions, and the tool schema do not change. "MCP tools" in this project means the in-process LLM tools in `src/main/tools`.

### Human UI

- Fog of war, Country bonus, and Terrain bonus sit on one row in the new-game overlay, in that order.
- A unit flag's tooltip gains a third line when that unit qualifies now: `Bonus: +1 (country)`, `Bonus: +1 (terrain)`, or `Bonus: +1 (country, terrain)`. Labels built through `setUnitNameContent` show it. Loss-toast flags never show it.

## Verified Facts

These were confirmed when this plan was written. Line numbers are approximate. Search by name.

- Fog of war is the template for a match flag. Checkbox `#new-game-fog-checkbox` in `static/index.html` (about line 1020) is a `<label class="game-over-options">`, styled near line 413. The renderer reads it in `registerNewGameButton` in `src/renderer/gameplay/newGame.ts` (about line 230). It re-checks it in `openNewGameOverlayFromModelTab` in the same file (about line 306) and in `updateGameOverUI` in `src/renderer/core/uiState.ts` (about line 133).
- The payload type is `NewGameIpcPayload` in `src/shared/ipc/ordersTypes.ts`. `src/main/preload.ts` and `src/shared/ipc/gameApiTypes.ts` import that type, so they need no change. The handler is `IPC_GAME.newGame` in `src/main/main.ts` (about line 300).
- Persistence goes through the `resetGameForNewMatch` facade in `src/main/gameDb.ts` (about line 1538, inline options type) into `src/main/gameDb/resetGame.ts` (about line 161, the same inline options type).
- `src/main/gameDb/gameSizeConfig.ts` is the template for a persisted `game_config` value (`persistGameSize`, `readPersistedGameSize`). Main code outside `gameDb` builds ops as `{ hasDb: isDbReady, run: dbRun, getOne: dbGetOne }`; all three are exported from `gameDb.ts`.
- `initDatabase` always calls `ensureTerrainClassificationCacheLoaded()`, which stores the res4 birth-country map through `storeRes4BirthCountryCache`. `withTempGameDb` runs `resetGameForNewMatch()`, so the cache is loaded in those tests.
- The snapshot is assembled in `getGameStateSnapshot` in `src/main/gameDb/fogState.ts` (about line 172), using `FogDbOps` (`GuardedDbOps`, which has `run`, `getOne`, and `hasDb`). `getGameStateForPlayer` copies hex rows with object spread, so any new hex field survives fog masking.
- `CombatUnit` is in `src/main/combatUnitTypes.ts`, with `id`, `player`, `unitType`, `h3Index`, and `displayOrder?`.
- Hit-roll sites. Each needs the bonus:

| File | About line | Roll |
| --- | --- | --- |
| `src/main/combatResolution.ts` | 117 | ranged attacker, `getAttack` |
| `src/main/combatResolution.ts` | 124 | ranged return fire, `getAttack` |
| `src/main/combatResolution.ts` | 187 | melee attacker side, `getAttack` (in exported `resolveOneMeleeEngagement`) |
| `src/main/combatResolution.ts` | 191 | melee defender side, `getDefense` (same function) |
| `src/main/gameActions/airStrikeResolution.ts` | 464 | strategic air attack, `getAttack('air')` |
| `src/main/gameActions/airStrikeResolution.ts` | 354 | strategic counter-fire in `resolveAirStrikeAgainstUnits`, `rollD6() > getAttack(...)` |
| `src/main/tacticalBattle/tacticalStrategicOrderPhases.ts` | 184 | tactical air attack on units |
| `src/main/tacticalBattle/tacticalStrategicOrderPhases.ts` | 203 | tactical counter-fire |
| `src/main/tacticalBattle/tacticalStrategicOrderPhases.ts` | 454 | tactical air attack on infrastructure (`> getAttack('air')` means miss) |
| `src/main/tacticalBattle/tacticalStrategicOrderPhases.ts` | 646 | tactical ranged fire at infrastructure |

- These must stay unchanged: the `getDefense` casualty sorts in `combatResolution.ts` (about lines 128–205), the victim sorts in `airStrikeResolution.ts` (about line 345) and `tacticalStrategicOrderPhases.ts` (about line 186), and the infrastructure counter-fire thresholds (`airStrikeResolution.ts` about line 399, `tacticalStrategicOrderPhases.ts` about line 485).
- Strategic `CombatUnit` arrays are built in `executeReadyStrategicTurn` in `src/main/gameActions/readyStrategicResolutionPipeline.ts`: `rangedInputUnits` (about line 203) and `combatUnitsAfter` (about line 329). `resolveAirStrikePhase(allAirStrikes, next)` is called at about line 198 and is its only production caller. `src/main/gameDb.test.ts` is its only test caller. Melee intercept keeps `pending.combatUnitsAfter` in memory (`meleeInterceptPendingState.ts`), copied with object spread at about line 356, and resumes with it in `meleeInterceptStrategicResolve.ts`.
- Tactical: `resolveTacticalAirStrikeAgainstUnitsOnSubUnits` (about line 168) already has 7 parameters. Its helpers `expandedRemovalIdsForVictim` and `markTacticalSubUnitCasualty` sit just above it. `markTacticalSubUnitCasualty` is also called at about line 486.
- Tactical adapters: `tacticalSubUnitsToRangedCombatUnits` (`tacticalStrategicOrderPhases.ts`, about line 222) and `tacticalSubUnitsAsCombatUnits` (`tacticalMeleeApply.ts`, about line 42). The entry points are `applyTacticalAirStrikeThenRangedPhaseOnBattle` (6 parameters) and `applyTacticalMeleeAfterSupportOrders(battle, combatNext?)`.
- Sub-units are created in one production site: `computeTacticalBattleSnapshot.ts`, about line 502. The parents come from `listUnitsForSnapshot()` and carry `origin`. Later copies use object spread. Persisted battles are restored from JSON unchanged (`tacticalBattlePersistence.ts`).
- `estimate_combat`: `src/main/tools/combatEstimation.ts` (`evaluateReturnFire` about line 322, probability helpers about line 479, `leadAttack` about line 496), `combatEstimationSides.ts` (`buildRealAttackers`, `buildAttackers`, `buildDefenders`, summary rows about lines 299, 336, 360), and `combatEstimationTheater.ts` (`buildStrategicCombatEstimationTheater(state)`, `buildTacticalCombatEstimationTheater(battle)`; the only caller is `executeEstimateCombat` at about line 452). In a battle, the tool loop passes the tactical plan state as `state`. `buildTacticalAiPlanState` spreads the strategic snapshot, so the new flags are on it.
- `assess_unit` and `assess_hex`: `executeAssessment` in `src/main/tools/assessment.ts` (about line 196) routes them. The strategic `unit` block is at about line 456 and the `assess_hex` result at about line 578. `assess_hex` is refused during battles. The tactical path calls `executeTacticalAssessUnit` (only caller, about line 224), and its block is at about line 336 of `src/main/tools/tacticalAssessUnit.ts`.
- `UnitAssessmentResult` in `src/main/precomputation.ts` (about line 54) types `result.unit`.
- `buildUnitStatusTable` is in `src/main/briefingFormatter.ts` (about line 381), and `buildSupplementalHexIntelligenceBlock` is at about line 434. The table is used by `formatBriefing` and by `formatTacticalBriefing` (`src/main/openRouter/formatTacticalBriefing.ts`).
- `buildCombatRulesParagraph(gates)` and `GameRuleTextGates` (`coordinateMode`, `hasAirUnits`, `hasNavalUnits`, `ordersEnabled`) are in `src/main/openRouter/promptSpec/gameRuleText.ts`. The one production gates literal is in `src/main/openRouter/openRouterBuildSystemPrompt.ts` (about line 286), where `state` is in scope and `hasAir` means the AI has air units. The only test literal goes through the `gates(overrides)` helper in `gameRuleText.test.ts` (about line 40).
- Renderer flags: `setUnitNameContent`, `resolveUnitOrigin`, and `createUnitOriginFlagImage` are in `src/renderer/core/unitOriginFlags.ts`. `createUnitOriginFlagImage` has one other caller, the loss toast in `src/renderer/openRouter/openRouterUiHelpers.ts` (about line 290). The tooltip text comes from `formatUnitOriginTooltipText` in `src/shared/unitOriginTooltipText.ts`. Live state is `S.gameState` and `S.tacticalBattleSnapshot` in `src/renderer/core/state.ts`.
- Test support: `buildTacticalToolFixture` in `src/main/tacticalBattle/testSupport/tacticalToolFixtures.ts` builds a battle, its plan state, and coordinate maps. Tactical estimate tests live in `src/main/tools/combatEstimationTactical.test.ts`.
- Test commands: `npm run build:main`, then `node dist/<path>.test.js` for one file. `npm test` runs lint, the naming check, the renderer type check, and all main and shared tests. `npm run check:circular` checks import cycles.

## Phases

Each phase ends with a command. Every earlier phase's tests must still pass. If a test fails, find the cause. Do not weaken an assertion to make it pass.

### 0. Preflight

```text
npm run build:main
npm run check:circular
node dist/main/gameDb/gameSizeConfig.test.js
node dist/main/combatResolution.test.js
node dist/main/tacticalBattle/tacticalMeleeApply.test.js
```

Expected: all pass. Record any failure that already exists before you edit anything.

### 1. Shared Rule Core

Create `src/shared/originBonusTypes.ts`. It holds types only:

```ts
export type OriginHitBonus = 0 | 1;
export type OriginBonusSource = 'country' | 'terrain';
export type OriginBonusTheater = 'strategic' | 'tactical';

export interface OriginBonusSettings {
  readonly countryBonusEnabled: boolean;
  readonly terrainBonusEnabled: boolean;
}

export interface OriginBonusPlace {
  readonly countryName: string | null;
  readonly terrainKind: string | null;
}
```

Create `src/shared/originBonusRules.ts`. These are pure functions with no logging. Use `import type` for every type-only import.

```ts
export const ORIGIN_HIT_BONUS = 1 as const;

export const ORIGIN_BONUS_OFF: OriginBonusSettings = Object.freeze({
  countryBonusEnabled: false,
  terrainBonusEnabled: false,
});

const TERRAIN_KIND_ALIASES: Readonly<Record<string, PipelineTerrainKind>> = {
  ocean: 'water', sea: 'water', forests: 'forest', mountains: 'mountain', wetland: 'wetlands',
};

export function normalizeOriginTerrainKind(raw: string | null | undefined): PipelineTerrainKind | null {
  const kind = (raw ?? '').trim().toLowerCase();
  if (kind.length === 0) return null;
  const aliased = TERRAIN_KIND_ALIASES[kind] ?? kind;
  return isPipelineTerrainKind(aliased) ? aliased : null;
}

export function originBonusSettingsFromSnapshot(
  state: Pick<GameStateSnapshot, 'countryBonusEnabled' | 'terrainBonusEnabled'>
): OriginBonusSettings {
  return {
    countryBonusEnabled: state.countryBonusEnabled === true,
    terrainBonusEnabled: state.terrainBonusEnabled === true,
  };
}

export function originBonusSources(input: {
  readonly settings: OriginBonusSettings;
  readonly theater: OriginBonusTheater;
  readonly origin: UnitOrigin | null | undefined;
  readonly place: OriginBonusPlace;
}): OriginBonusSource[] {
  const { settings, theater, origin, place } = input;
  if (!origin) return [];
  const sources: OriginBonusSource[] = [];
  if (settings.countryBonusEnabled && origin.birthCountryName !== null && origin.birthCountryName === place.countryName) {
    sources.push('country');
  }
  if (theater === 'tactical' && settings.terrainBonusEnabled) {
    const birthKind = normalizeOriginTerrainKind(origin.birthTerrainKind);
    if (birthKind !== null && birthKind === normalizeOriginTerrainKind(place.terrainKind)) sources.push('terrain');
  }
  return sources;
}

export function originHitBonusFromSources(sources: ReadonlyArray<OriginBonusSource>): OriginHitBonus {
  return sources.length > 0 ? ORIGIN_HIT_BONUS : 0;
}

export function formatOriginBonusTooltipLine(sources: ReadonlyArray<OriginBonusSource>): string | null {
  return sources.length > 0 ? `Bonus: +${ORIGIN_HIT_BONUS} (${sources.join(', ')})` : null;
}

export function formatOriginBonusTableCell(sources: ReadonlyArray<OriginBonusSource>): string {
  return sources.length > 0 ? `+${ORIGIN_HIT_BONUS} ${sources.join(', ')}` : '—';
}
```

Add the place helpers to the same file:

- `tacticalOriginBonusPlace(battle, res4H3Index): OriginBonusPlace` returns `{ countryName: battle.res4CountryNameByH3?.[res4H3Index] ?? null, terrainKind: effectiveRes4TerrainKindString(battle, res4H3Index) }`. Type `battle` as `TacticalBattleTerrainPick & Pick<TacticalBattleSnapshot, 'res4CountryNameByH3'>`.
- `strategicHexCountryNameAt(state: Pick<GameStateSnapshot, 'hexes'>, res1H3Index): string | null` reads `hexes[].countryName`. Cache a `Map` per `state.hexes` array in a module-level `WeakMap`, so repeated renderer calls do not rescan.
- `strategicOriginBonusPlace(state, res1H3Index)` returns `{ countryName: strategicHexCountryNameAt(state, res1H3Index), terrainKind: null }`.

Add these optional type fields now, each with a field comment:

- `TacticalBattleSnapshot.res4CountryNameByH3?: Record<string, string>` in `src/shared/tacticalBattleTypes.ts`. It maps a res4 cell to its birth country name, lists only cells that have one, is set when the battle snapshot is created, and is read by origin bonuses.
- `TacticalSubUnitSnapshot.origin?: UnitOrigin` in the same file. It is the parent unit's birth origin, copied at battle start, read by origin bonuses, and absent on battles created before this field existed.
- On the `hexes` element type in `src/shared/ipc/gameStateTypes.ts`: `countryName?: string | null`. It is the hex's majority country name, present only when the country bonus is on.
- On `GameStateSnapshot`: `countryBonusEnabled?: boolean` and `terrainBonusEnabled?: boolean`.

Tests in `src/shared/originBonusRules.test.ts`:

- A country match on the strategic map gives `['country']`. A different name, a `null` birth country with a `null` place, and the flag off each give `[]`.
- Terrain matches only in the tactical theater. The strategic theater ignores terrain even with the flag on.
- A `forest` birth matches a cell whose raw kind is `forests`. An origin with `birthIsUrban: true` and kind `plains` matches a `plains` cell.
- Both sources give `['country', 'terrain']`, and `originHitBonusFromSources` still returns 1.
- `formatOriginBonusTooltipLine` returns `null` for `[]`, `Bonus: +1 (country)`, and `Bonus: +1 (country, terrain)`.

```text
npm run build:main
node dist/shared/originBonusRules.test.js
npm run check:circular
```

### 2. Settings, Payload, and Snapshot Flags

Create `src/main/gameDb/originBonusConfig.ts`, modeled on `gameSizeConfig.ts`:

- `COUNTRY_BONUS_CONFIG_KEY = 'country_bonus_enabled'` and `TERRAIN_BONUS_CONFIG_KEY = 'terrain_bonus_enabled'`. These are new frozen `game_config` keys.
- `persistOriginBonusSettings(ops: Pick<GameConfigKvDbOps, 'run'> & { hasDb?: () => boolean }, settings: OriginBonusSettings)` upserts both rows as `'1'` or `'0'`. It is a no-op when `ops.hasDb` exists and returns false. It logs with `logDebug`.
- `readPersistedOriginBonusSettings(ops: GameConfigKvDbOps): OriginBonusSettings` returns `ORIGIN_BONUS_OFF` when there is no database. Each flag is true only when its row value is exactly `'1'`. It logs with `logTrace` and never throws.

Wire it:

- `resetGame.ts`: export a named options type `ResetGameForNewMatchOptions` with today's four fields plus `countryBonusEnabled?: boolean` and `terrainBonusEnabled?: boolean`, each with a field comment. Use it in `resetGameForNewMatch`. Persist both flags with `=== true`, next to `persistGameSize`, and add them to the existing debug log.
- `gameDb.ts`: replace the facade's inline options type with an imported `ResetGameForNewMatchOptions`. Do not add anything else to `gameDb.ts`.
- `NewGameIpcPayload` gains `countryBonusEnabled?: boolean` and `terrainBonusEnabled?: boolean`, with field comments that say a missing field means off.
- `main.ts` new-game handler: pass `payload?.countryBonusEnabled === true` and `payload?.terrainBonusEnabled === true`. Add both to the existing debug log object.
- `fogState.ts` `getGameStateSnapshot`: read the settings once with `readPersistedOriginBonusSettings(ops)` and put both booleans into the snapshot literal next to `gameSize`.

Tests in `src/main/gameDb/originBonusConfig.test.ts` (use `withTempGameDb`):

- After `resetGameForNewMatch()` with no options, both flags are `false` on the human and opponent snapshots.
- After `resetGameForNewMatch({ countryBonusEnabled: true, terrainBonusEnabled: true })`, both rows are `'1'` and both snapshot flags are `true`. A following reset with no options writes `'0'`.

```text
npm run build:main
node dist/main/gameDb/originBonusConfig.test.js
node dist/main/gameDb/gameSizeConfig.test.js
node dist/main/gameDb.test.js
```

### 3. Place Data

Strategic majority country:

- Create `src/main/unitOrigin/res1MajorityCountry.ts` with the pure function `buildRes1MajorityCountryNameByH3(res4CountryByH3: ReadonlyMap<string, BirthCountry>, parentRes1Of: (res4H3Index: string) => string): ReadonlyMap<string, string>`. It counts names per parent, picks the largest count, and breaks ties with the smallest name by UTF-16 order. For the tie-break, export the existing private `compareOrdinal` from `res4BirthCountry.ts` and import it. Do not write a second comparator. Hexes with no counted cells get no entry.
- In `res4BirthCountryCache.ts`:
  - Build this map inside `storeRes4BirthCountryCache` with `(h3) => cellToParent(h3, 1)` from `h3-js`.
  - Store it next to the res4 map and clear it in `clearRes4BirthCountryCache`.
  - Add `getRes1MajorityCountryNamesFromSnapshot(): ReadonlyMap<string, string>`, which logs with `logTrace`. Unlike the res4 getter, it **does not throw**. When the cache is not loaded, it logs with `logError` and returns an empty map. This keeps snapshot assembly and combat resolution alive if terrain metadata failed to load.
- `fogState.ts` `getGameStateSnapshot`: only when `countryBonusEnabled` is true, call the getter once and set `countryName: names.get(h3Index) ?? null` on each hex row. When the flag is off, do not add the property and do not call the getter.

Tactical place data in `computeTacticalBattleSnapshot.ts`:

- Build `res4CountryNameByH3` for every footprint child that has a name, using `getRes4BirthCountryFromSnapshot(cell)?.name`. Do this inside `try`/`catch`. On error, log with `logError` and leave the field off; the battle must still start. Attach the field only when it is not empty, using the same conditional-spread style as `res4IsSeaportByH3`.
- In the `subUnits.push` literal, add `...(parent.origin ? { origin: parent.origin } : {})`.
- Search `src/main` for non-test sub-unit literals that list fields one by one. Only the creation site should exist. If you find another, stop and report it.

Tests:

- `src/main/unitOrigin/res1MajorityCountry.test.ts`: a clear majority, a tie broken by name, and a parent with no counted cells has no entry.
- `originBonusConfig.test.ts`: one more case. With the country bonus on, at least one hex row has a non-null `countryName`. With it off, no hex row has the property.
- `computeTacticalBattleSnapshotDb.test.ts`: one more case. Every placed sub-unit has `origin`, deeply equal to its parent's `origin`.

```text
npm run build:main
node dist/main/unitOrigin/res1MajorityCountry.test.js
node dist/main/gameDb/originBonusConfig.test.js
node dist/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.js
npm run check:circular
```

### 4. Strategic Combat

Thresholds:

- `CombatUnit` gains `originHitBonus?: OriginHitBonus`. Its field comment says the value is set when the unit array is built for a phase, from the unit's position in that phase, is present only when it is 1, and means 0 when absent.
- Create `src/main/combatHitThresholds.ts` with `attackHitThreshold(unit: { readonly unitType: string; readonly originHitBonus?: OriginHitBonus }): number` and `defenseHitThreshold(...)`. They return `getAttack` or `getDefense` plus `unit.originHitBonus ?? 0`. They do not log, matching `getAttack`.
- In `combatResolution.ts`, replace only the four hit comparisons with these helpers. Do not touch the sorts.

Lookups:

- Create `src/main/originBonus/originHitBonusLookup.ts` with no database imports:

```ts
export type OriginHitBonusLookup = (unitId: string, h3Index: string) => OriginHitBonus;
export const noOriginHitBonus: OriginHitBonusLookup = () => 0;

export function createStrategicOriginHitBonusLookup(input: {
  readonly settings: OriginBonusSettings;
  readonly units: ReadonlyArray<{ readonly id: string; readonly origin?: UnitOrigin }>;
  readonly countryNameAt: (res1H3Index: string) => string | null;
}): OriginHitBonusLookup;

export function createTacticalOriginHitBonusLookup(input: {
  readonly settings: OriginBonusSettings;
  readonly battle: TacticalBattleSnapshot;
}): OriginHitBonusLookup;

export function withOriginHitBonus(units: ReadonlyArray<CombatUnit>, lookup: OriginHitBonusLookup): CombatUnit[];
```

  - The strategic lookup returns `noOriginHitBonus` when the country bonus is off. The tactical lookup returns it when both flags are off.
  - Otherwise each builds an `id -> origin` map once (strategic from `units`, tactical from `battle.subUnits`). It returns a closure that calls `originBonusSources` with the right place helper and returns `originHitBonusFromSources`. An unknown id gives 0.
  - The factories log with `logDebug` (settings and unit count). The closures log with `logTrace` (`unitId`, `h3Index`, and the bonus).
  - `withOriginHitBonus` never mutates its input. For each unit it returns `{ ...u }` when the bonus is 0, and `{ ...u, originHitBonus: 1 }` when it is 1. Do not write `originHitBonus: 0`; existing tests compare these objects deeply.
- Create `src/main/originBonus/originHitBonusLookupDb.ts`. It uses the ops `{ hasDb: isDbReady, run: dbRun, getOne: dbGetOne }` from `../gameDb`:
  - `readOriginBonusSettingsFromDb(): OriginBonusSettings` calls `readPersistedOriginBonusSettings` with those ops.
  - `buildStrategicOriginHitBonusLookupFromDb()` reads the settings. When the country bonus is off, it returns `noOriginHitBonus` without listing units. Otherwise it calls `createStrategicOriginHitBonusLookup` with `listUnitsForSnapshot()` and `getRes1MajorityCountryNamesFromSnapshot()` (called once; `countryNameAt` reads that map).
  - `buildTacticalOriginHitBonusLookupFromDb(battle)` calls `createTacticalOriginHitBonusLookup` with the DB settings and the battle.

Wire `executeReadyStrategicTurn`:

- Build `const originHitBonusAt = buildStrategicOriginHitBonusLookupFromDb();` once, before `resolveAirStrikePhase`.
- `resolveAirStrikePhase(allAirStrikes, next, originHitBonusAt)` gets a new required parameter.
  - The air attack becomes `rollD6() <= getAttack('air') + originHitBonusAt(attacker.id, attacker.h3_index)`.
  - `resolveAirStrikeAgainstUnits` gets the lookup as a sixth parameter. Counter-fire becomes `rollD6() > getAttack(defender.unit_type) + originHitBonusAt(defender.id, defender.h3_index)`.
  - In `src/main/gameDb.test.ts`, the only test caller, pass `noOriginHitBonus`.
- Wrap `rangedInputUnits` and `combatUnitsAfter` with `withOriginHitBonus(..., originHitBonusAt)`. Leave `combatUnitsBefore` alone, because it is not rolled.
- Melee intercept needs no change. The pending copy keeps the field, and the resume path in `meleeInterceptStrategicResolve.ts` passes `pending.combatUnitsAfter` to `runMeleePhase`.

Tests:

- `combatResolution.test.ts`. Add a helper `rollExactly(roll)` that returns `() => (roll - 0.5) / 6`, so `rollD6` gives exactly `roll`.
  - Ranged: follow the same-hex pattern of `testRangedMixedStackTargetsEnemiesOnlyAndEnemyReturnFireOnly` (about line 78), using its `makeUnit` helper and hex `891f1d48b9fffff`. Place one opponent armor (attack 3) and one human infantry in that hex, with one order from the armor at that hex, and use `rollExactly(4)`. With `{ ...armor, originHitBonus: 1 }`, the infantry is in `removedUnitIds`. Without the bonus, `removedUnitIds` is empty. Infantry return fire (attack 1) misses a 4 either way.
  - Melee, through the exported `resolveOneMeleeEngagement` so the roles are fixed. An infantry defender with the bonus scores a hit on roll 3; without it, it does not.
  - Casualty order, also through `resolveOneMeleeEngagement` with `rollExactly(1)`. With one attacker against a defender stack of infantry (with the bonus) and armor, `defenderRemovedIds` is exactly the infantry id.
- `src/main/originBonus/originHitBonusLookup.test.ts`:
  - The strategic lookup gives 1 when the unit's birth country equals `countryNameAt`. It gives 0 at another hex, 0 with the flag off, and 0 for an unknown id.
  - The tactical lookup gives 1 for a terrain match on a cell. It gives 0 when only terrain matches and the terrain bonus is off.
  - `withOriginHitBonus` leaves no `originHitBonus` key on a unit whose bonus is 0.
- `src/main/originBonus/originHitBonusLookupDb.test.ts` (use `withTempGameDb`). With the country bonus on, at least one seeded unit gets 1 at its own hex. With it off, every seeded unit gets 0.

```text
npm run build:main
node dist/main/combatResolution.test.js
node dist/main/originBonus/originHitBonusLookup.test.js
node dist/main/originBonus/originHitBonusLookupDb.test.js
node dist/main/gameDb.test.js
node dist/main/gameActionsProduction.test.js
npm run check:circular
```

### 5. Tactical Combat

First, a pure move with no behavior change:

- Create `src/main/tacticalBattle/tacticalAirStrikeUnits.ts`. Move `expandedRemovalIdsForVictim`, `markTacticalSubUnitCasualty`, and `resolveTacticalAirStrikeAgainstUnitsOnSubUnits` there unchanged, with their comments. Export the last two. Import them back into `tacticalStrategicOrderPhases.ts`.
- Change `resolveTacticalAirStrikeAgainstUnitsOnSubUnits` to take one parameter object, `TacticalAirStrikeOnUnitsInput`, with today's seven values as `readonly` fields (`toRemove` and the two kill arrays are still mutated in place, so say so in their field comments). Update its one caller.

```text
npm run build:main
npm run check:circular
node dist/main/tacticalBattle/tacticalCompositeOrdersApply.test.js
node dist/main/tacticalBattle/tacticalBattleSession.test.js
```

These must pass with no test edits before you continue.

Then add the bonus:

- `applyTacticalAirStrikeThenRangedPhaseOnBattle`: at the top, `const originHitBonusAt = buildTacticalOriginHitBonusLookupFromDb(battle);`. Do not add a seventh positional parameter. When no database is open, the settings are off, so existing tests stay unchanged.
  - Add `originHitBonusAt` to `TacticalAirStrikeOnUnitsInput`. The air attack becomes `rollD6() <= getAttack('air') + originHitBonusAt(attacker.id, attacker.h3Index)`. Counter-fire becomes `rollD6() > getAttack(defender.unitType) + originHitBonusAt(defender.id, defender.h3Index)`.
  - The infrastructure air roll (about line 454) becomes `rollD6() > getAttack('air') + originHitBonusAt(attacker.id, attacker.h3Index)`.
  - The ranged-at-infrastructure roll (about line 646) becomes `rollRangedInfraStrikeD6() > getAttack(atk.unitType) + originHitBonusAt(atk.id, atk.h3Index)`.
  - `tacticalSubUnitsToRangedCombatUnits` gets the lookup as a third parameter and returns `withOriginHitBonus(...)` over its current result.
- `applyTacticalMeleeAfterSupportOrders`: build the same lookup from the incoming battle and wrap `tacticalSubUnitsAsCombatUnits(battle.subUnits)` with `withOriginHitBonus`.

Test in `tacticalMeleeApply.test.ts`. Naval attack and defense are both 2, so the result does not depend on which side the shuffle makes the attacker:

- Inside `withTempGameDb`, call `persistOriginBonusSettings({ run: dbRun, hasDb: isDbReady }, { countryBonusEnabled: false, terrainBonusEnabled: true })`.
- Build a snapshot like the existing tests, with one human and one opponent naval sub-unit on the same cell `h0`, and `res4TerrainKindByH3: { [h0]: 'coastal' }`. Give only the human unit an origin with `birthTerrainKind: 'coastal'`.
- Run `applyTacticalMeleeAfterSupportOrders(snap, () => (3 - 0.5) / 6)`. Assert that the opponent unit is the only removal.
- Persist both flags off, run again on the same snapshot, and assert that nothing is removed.

The air and ranged sites have no separate test. The required lookup parameter makes the compiler check that they are wired, and the melee test proves the lookup itself.

```text
npm run build:main
node dist/main/tacticalBattle/tacticalMeleeApply.test.js
node dist/main/tacticalBattle/tacticalCompositeOrdersApply.test.js
node dist/main/tacticalBattle/tacticalBattleSession.test.js
npm run check:circular
```

### 6. Combat Estimate Tool

- `CombatEstimationTheater` gains `originHitBonusAt: OriginHitBonusLookup`.
  - The strategic theater uses `createStrategicOriginHitBonusLookup({ settings: originBonusSettingsFromSnapshot(state), units: state.units, countryNameAt: (h3) => strategicHexCountryNameAt(state, h3) })`.
  - `buildTacticalCombatEstimationTheater(battle, settings)` gets a second parameter, and its lookup is `createTacticalOriginHitBonusLookup({ settings, battle })`. Update the one call in `executeEstimateCombat` to pass `originBonusSettingsFromSnapshot(state)`.
- `combatEstimationSides.ts`:
  - `buildRealAttackers`: after filtering `usable`, map each unit through `const bonus = theater.originHitBonusAt(u.id, engagementType === 'melee' ? targetHexH3 : u.h3Index);` and return `bonus === 0 ? u : { ...u, originHitBonus: bonus }`. Do not change `h3Index`. Do not use `withOriginHitBonus` here, because it always judges a unit at its own `h3Index`.
  - Real defenders and automatic defenders use the same mapping, judged at `targetHexH3`.
  - Assumed attackers and defenders get none.
  - Summary rows use `attackHitThreshold(u)` and `defenseHitThreshold(u)`. They add `originBonus: 1` only when `u.originHitBonus === 1`. Add the optional field to both summary row types, with comments.
- `combatEstimation.ts`: `attackProbs`, `defenseProbs`, the `evaluateReturnFire` `hitProbs`, and `leadAttack` use the threshold helpers.

Test support, reused by the tactical tests in this phase and the next:

- `tacticalToolFixtures.ts`: `TacticalToolFixtureUnit` gains `origin?: UnitOrigin`, copied onto the sub-unit when present. `TacticalToolFixtureOptions` gains `originBonusSettings?: OriginBonusSettings`, spread into the plan state's two flags when present. Both are optional, so existing callers are unchanged.

Tests:

- `combatEstimation.test.ts`:
  - With the country bonus on, a hex `countryName` equal to the attacker's birth country, and the attacker standing there, a ranged estimate reports `attackValue` equal to base plus one and `originBonus: 1`. With the flag off, the same fixture reports the base value with no `originBonus` key.
  - In a strategic melee estimate, the bonus follows the target hex, not the attacker's current hex.
- `combatEstimationTactical.test.ts`: one estimate with the terrain bonus on, where the defender's birth terrain matches its cell, shows `originBonus: 1` on the defender row.

```text
npm run build:main
node dist/main/tools/combatEstimation.test.js
node dist/main/tools/combatEstimationTactical.test.js
```

### 7. Assessments and Briefing

Create `src/main/tools/originBonusAssessment.ts`. Each function returns an object to spread into a tool result, and an empty object when its flags are off. Each logs with `logTrace`.

- `strategicOriginBonusUnitFields(state, unit)`: when the country bonus is on, returns `{ originBonusHere: originBonusSources({ settings, theater: 'strategic', origin: unit.origin, place: strategicOriginBonusPlace(state, unit.h3Index) }), birthCountry: unit.origin?.birthCountryName ?? null }`.
- `tacticalOriginBonusUnitFields(settings, battle, subUnit)`:
  - When either flag is on, adds `originBonusHere` from `subUnit.origin` with `tacticalOriginBonusPlace(battle, subUnit.h3Index)`. Use `subUnit.h3Index`, not the assessment anchor, so the answer matches the dice.
  - When the country bonus is on, adds `birthCountry`.
  - When the terrain bonus is on, adds `birthTerrain: normalizeOriginTerrainKind(subUnit.origin?.birthTerrainKind)`.
- `strategicOriginBonusHexFields(state, res1H3Index)`: when the country bonus is on, returns `{ country: strategicHexCountryNameAt(state, res1H3Index) }`.

Wire them:

- `assessment.ts`: spread `strategicOriginBonusUnitFields(state, unit)` at the end of the strategic `unit` block. Spread `strategicOriginBonusHexFields(state, hexH3)` into the `assess_hex` result after `terrain`.
- `tacticalAssessUnit.ts`: `TacticalAssessUnitArgs` gains a required `originBonusSettings: OriginBonusSettings`, with a field comment. The caller in `assessment.ts` passes `originBonusSettingsFromSnapshot(state)`. Spread `tacticalOriginBonusUnitFields(args.originBonusSettings, battle, self)` at the end of the `unit` block.
- `precomputation.ts`: add `originBonusHere?: readonly OriginBonusSource[]` to the `unit` type inside `UnitAssessmentResult`, with a field comment.

Briefing (`briefingFormatter.ts`):

- `buildUnitStatusTable`: `const showBonus = unitAssessments.some((a) => Array.isArray(a.result.unit?.originBonusHere));`. When it is true, insert a `Bonus` column after `Hex` in the header, the separator, and every row. The cell is `formatOriginBonusTableCell(a.result.unit?.originBonusHere ?? [])`. When it is false, the output is identical to today.
- `buildSupplementalHexIntelligenceBlock`: when `typeof r.country === 'string'`, append `; country ${r.country}` after the `passableBy` part of the bullet. Otherwise the bullet is unchanged.

Tests:

- `assessment.test.ts`: with the country bonus on, `assess_unit` has `originBonusHere` and `birthCountry`, and `assess_hex` has `country`. With it off, none of the three keys is present.
- `tacticalAssessUnit.test.ts`: with the terrain bonus on and a matching cell, the block has `originBonusHere: ['terrain']` and `birthTerrain`. Build it with the fixture options added in the previous phase.
- New `src/main/briefingUnitStatusBonus.test.ts`, not `briefingFormatter.test.ts` (that file is near 1000 lines). The `Bonus` column appears when one assessment carries `originBonusHere`, and the header is unchanged when none does.

```text
npm run build:main
node dist/main/tools/assessment.test.js
node dist/main/tools/tacticalAssessUnit.test.js
node dist/main/briefingUnitStatusBonus.test.js
node dist/main/briefingFormatter.test.js
node dist/main/openRouter/tacticalPromptSectionParity.test.js
```

### 8. Prompt Rule

- `GameRuleTextGates` gains a required field `originBonusSettings: OriginBonusSettings`, with a field comment. Set it in `openRouterBuildSystemPrompt.ts` from `originBonusSettingsFromSnapshot(state)`. In `gameRuleText.test.ts`, add `originBonusSettings: ORIGIN_BONUS_OFF` to the defaults in the `gates(overrides)` helper.
- Add `buildOriginBonusRule(gates: GameRuleTextGates): string | null`, logging with `logTrace`. In `buildCombatRulesParagraph`, compute it once and insert `...(rule ? [rule] : [])` right after `buildCasualtySortRule()` in the `parts` literal.
- Build the text from `ORIGIN_HIT_BONUS`, joining the parts that apply with single spaces:
  - Strategic mode, country bonus off: `null`. Terrain alone does nothing on the strategic map.
  - Strategic mode, country bonus on:
    - `Country bonus is on: a unit in a hex whose country is its birth country adds 1 to every attack or defense value it rolls there, including ranged fire, return fire, melee, and air-strike counter-fire.`
    - When `hasAirUnits`: `An air unit qualifies by the hex of its base, whatever it strikes.`
    - Always: `Casualty order still uses the printed defense values.`
  - Tactical mode, both flags off: `null`.
  - Tactical mode, otherwise:
    - Country on: `Country bonus is on: a unit on a cell whose country is its birth country adds 1 to every attack or defense value it rolls there.`
    - Terrain on: `Terrain bonus is on: a unit on a cell whose terrain kind matches its birth terrain kind adds 1 to every attack or defense value it rolls there; urban and rubble do not change a cell's terrain kind.`
    - Both on: `The two bonuses do not stack; the most is +1.`
    - When `hasAirUnits`: `An air unit qualifies by the cell of its base, whatever it strikes.`
    - Always: `Casualty order still uses the printed defense values.`

Tests in `src/main/openRouter/promptSpec/gameRuleText.test.ts`:

- The rule is absent with `ORIGIN_BONUS_OFF` in both modes, and absent on the strategic map with terrain only.
- It is present on the strategic map with country only, and its air sentence appears only when `hasAirUnits` is true.
- The tactical text includes the no-stacking sentence only when both flags are on.

```text
npm run build:main
node dist/main/openRouter/promptSpec/gameRuleText.test.js
node dist/main/openRouter/promptSpec/variantConformance.test.js
node dist/main/openRouter/promptContracts.test.js
```

### 9. New-Game Checkboxes and Flag Tooltip

New-game overlay:

- `static/index.html`: replace the single fog `<label class="game-over-options">` with this markup:

```html
<div class="game-over-options">
  <label><input type="checkbox" id="new-game-fog-checkbox" checked /> Fog of war</label>
  <label><input type="checkbox" id="new-game-country-bonus-checkbox" checked /> Country bonus</label>
  <label><input type="checkbox" id="new-game-terrain-bonus-checkbox" checked /> Terrain bonus</label>
</div>
```

  Keep any other attributes the existing fog label or input has. Change `.game-over-options` to add `gap: 1rem; flex-wrap: wrap;`. Add `.game-over-options label { display: inline-flex; align-items: center; gap: 0.35rem; }`. Keep its other rules.
- Create `src/renderer/gameplay/newGameOptionsUi.ts`, next to `newGameSizeUi.ts`:
  - `readNewGameOptionFlags()` returns `{ fogOfWarEnabled, countryBonusEnabled, terrainBonusEnabled }`. Fog keeps today's `!== false`. The two bonuses use `checked === true`.
  - `resetNewGameOptionCheckboxes()` sets all three to checked.
  - Use `readNewGameOptionFlags()` in `registerNewGameButton` and spread it into the `newGame` payload. Use `resetNewGameOptionCheckboxes()` in `openNewGameOverlayFromModelTab` and in `updateGameOverUI`. Remove the old inline fog lookups at those three sites.
- Search `src` tests for `game-over-options` and `new-game-fog-checkbox`. Update any source-string assertion to the new markup without weakening what it checks.

Flag tooltip:

- `src/shared/unitOriginTooltipText.ts`: `formatUnitOriginTooltipText(origin, bonusLine?: string | null)` appends `\n` and `bonusLine` when one is given. Leave `unitOriginsPresentTheSame` alone. Add one test case with a bonus line and keep the existing cases.
- Create `src/renderer/core/unitOriginBonusLine.ts` with `originBonusTooltipLineForUnit(unitId: string, origin: UnitOrigin): string | null`. It reads `S.gameState` and `S.tacticalBattleSnapshot`, and returns `null` when there is no state.
  - The settings come from `originBonusSettingsFromSnapshot(S.gameState)`.
  - If a battle is active and the id is one of its sub-units, use the tactical theater with `tacticalOriginBonusPlace(battle, subUnit.h3Index)`.
  - Otherwise, if the id is a unit in `S.gameState.units`, use the strategic theater with `strategicOriginBonusPlace(S.gameState, unit.h3Index)`.
  - Otherwise return `null`.
  - Use the `origin` argument, which is what `resolveUnitOrigin` returned, so old battles without a sub-unit `origin` still work.
- `createUnitOriginFlagImage(origin, bonusLine?: string | null)` passes the line to `formatUnitOriginTooltipText`. `setUnitNameContent` passes `originBonusTooltipLineForUnit(unitId, origin)`. The loss toast in `openRouterUiHelpers.ts` keeps calling it without a line.

```text
npm run build:main
npm run build:renderer
npm run check:renderer-types
npm run check:circular
node dist/shared/unitOriginTooltipText.test.js
```

Manual check:

- Run the app. The overlay shows all three checkboxes on one row, all checked.
- Uncheck the two bonuses, start a game, and confirm no `Bonus:` line appears on any unit flag tooltip.
- Click New, confirm all three are checked again, and start a game. Hover a flag for a unit in its home country and confirm `Bonus: +1 (country)`.
- Enter a battle and confirm that sub-unit flags show `(terrain)` or `(country, terrain)` where they qualify.

### 10. Living Docs

Update these documents in place. Do not add phase labels.

- `doc/combat-rules-v3.md`:
  - Rewrite the birth-origin paragraph in section 2. Origin is display data, and it also drives the optional origin bonuses.
  - Add a subsection under section 4.9, "Origin bonuses (optional)". State the rules from Locked Decisions: which rolls change, which do not, the majority-country rule, cell country and terrain in battles, the +1 cap, and the unchanged casualty order.
  - Add one sentence to section 12.5 pointing to it.
- `doc/ux/new-game-dialog.md`: Information Displayed, Inputs, Invariants (all three checkboxes are checked every time the overlay opens), and Code Entry Points (the two new ids and `newGameOptionsUi.ts`).
- `doc/ux/modes-and-transitions.md`: the New-game mode sentence lists the two new choices.
- `doc/ux/stack-callout.md`: the origin tooltip has an optional third line, `Bonus: +1 (...)`, and when it appears.
- `doc/ux/notifications-and-feedback.md`: loss-toast flags show only the two origin lines.
- `doc/ui-style-guide.md` and `doc/game-size-unit-caps.md`: wherever they describe the overlay controls or the fog checkbox placement.
- `doc/ai-tools.md`: `estimate_combat` effective values and `originBonus`; `assess_unit` `originBonusHere`, `birthCountry`, and `birthTerrain`; `assess_hex` `country`.
- `doc/ai-commander-prompts/information-decision-model.md`:
  - Add an `ORIGIN_BONUS` row to the "Rules the model must apply" table (section 3.6), jobs 3 and 17, scope both, status conditional on a mode-relevant flag.
  - Change the "Unit birth origin" exclusion row. The birth hex stays out. When a flag is on, the per-unit `originBonusHere`, `birthCountry`, and (in battle) `birthTerrain`, plus the hex `country`, are shown.
- `doc/ai-commander-prompts/crosswalk.md`: add `ORIGIN_BONUS` rows to both fact tables, following the `CASUALTY_PRIORITY` rows.
- `doc/ai-commander-prompts/source-inventory.md`: in the `buildCombatRulesParagraph` order sentence, add `buildOriginBonusRule` after `buildCasualtySortRule` and its gate. Note the conditional `Bonus` column and the hex `country` bullet.
- `doc/ai-commander-prompts/strategic-prompt.md` and `tactical-prompt.md`: add the rule to the combat paragraph's item list, and the conditional `Bonus` column where the unit status table is described.
- `doc/ai-commander-prompts/variants.md`: add the new gate.
- Code comments that say origin is "never used by rules, briefings, or prompts" (`src/shared/ipc/gameStateTypes.ts` and the header of `src/shared/unitOriginTypes.ts`) must now say that it drives origin bonuses when those match flags are on.

No test command. Re-read each edited section against Locked Decisions.

### 11. Final Check

```text
npm test
npm run check:circular
```

Expected: both exit 0.

Then check:

- Search `src` for `getAttack(` and `getDefense(` inside a `rollD6()` comparison. None may remain at the sites in the roll-site table, except the casualty sorts and infrastructure counter-fire listed as unchanged.
- Search `src` and `doc` for `display-only` or `never used by rules` next to unit origin. None may contradict the new rules.
- Search `src`, `doc`, and `static` for this document's phase numbers or headings. None may appear.
- Count lines. `src/main/gameDb.ts` is no longer than it was in preflight. Every new file is under 600 lines.

Report the files changed and any deviation from this plan.

## Known Limits

- A battle snapshot created before this change has no `origin` on its sub-units and no `res4CountryNameByH3`, so nothing qualifies in that battle.
- In battle, the AI sees its birth country and birth terrain and the terrain of each cell, but not the country of each cell. A battle footprint is one strategic hex, so this rarely matters.
- An enemy unit's bonus is visible to the AI through `estimate_combat` defender rows. The human already sees enemy flags, so this is parity, not new intel.
- A strategic hex counts as one country even when it spans a border. Units on the minority side get no strategic bonus there, and they can get a tactical bonus on their own cell.
- Assumed units in `estimate_combat` never qualify.
- A flag tooltip is computed when its label is built, so it can lag one refresh behind a move.
