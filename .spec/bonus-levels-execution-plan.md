# Bonus Levels Execution Plan

Replace the Country bonus, Terrain bonus, and Weather bonus checkboxes with Off / Low / High dropdowns. Low is today's rules. High makes each bonus stronger, but no unit is ever left unable to move or unable to hit. Fog of war stays a checkbox.

## Rules for the Implementer

- Never commit or push.
- Do not put this document's phase numbers, phase names, or headings into product code, comments, tests, configuration, lint messages, or docs. Test names describe the behavior they lock, not the step that added them.
- Every new or changed function, field, type, and constant gets an orienting comment in the house format. Functions use `Purpose:` / `When to use:` / `Expected outcome:` / `Exceptions:`. Fields use `Contract:` / `When to use:` / `Expected outcome:` / `Exceptions:`. Copy the style from `src/shared/gameSize.ts` and `src/main/gameDb/originBonusConfig.ts`. When a change makes an existing comment wrong (for example "always 1", "0 or 1", "checkbox"), fix that comment.
- Main-process code (`src/main`) logs with `../logger`: `logDebug` on public entry points that change state, `logTrace` on getters and pure lookups, `logError` in every `catch`. Add the new level values to the existing log objects. Shared (`src/shared`) and renderer modules do not log.
- Use `readonly`, `const`, `Readonly<Record<...>>`, `ReadonlyArray`, `Object.freeze`, and `as const` for anything that is not mutated.
- Names follow `doc/naming-conventions-contract-v1.md`: camelCase files, PascalCase types, camelCase functions, `UPPER_SNAKE` for frozen tables. The only role suffixes allowed are `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`. A `*Types.ts` file holds types only.
- Functions take at most 6 named parameters. Use a parameter object instead, as the existing weather rule functions do.
- File size:
  - `src/main/gameActions/gameActionsCore.ts` (about 1800 lines) and `src/main/gameDb.ts` (about 1550) are over the hard limit. Change only the lines this plan names, and add no net lines.
  - `src/main/tacticalBattle/tacticalStrategicOrderPhases.ts` (about 750), `src/main/briefingFormatter.ts` (about 710), and `src/main/tools/assessment.ts` (about 650) are over 600. Change only the lines this plan names, in place.
  - `src/main/tools/assessUnitProximity.ts` (598), `src/main/gameActions/airStrikeResolution.ts` (about 580), and `src/main/tacticalBattle/computeTacticalBattleSnapshot.ts` (about 580) are close to 600. Their changes must add no net lines.
  - Every other file must stay under 600 lines.
- Tests cover happy paths and essential failures only. Each test locks a rule, not an implementation detail. Add to the existing test file next to the module, in that file's style: `node:test` with `test(...)` (for example `src/shared/weatherBonusRules.test.ts`) or a plain `assert` script with `run()` (for example `src/main/gameDb/originBonusConfig.test.ts`).
- If an existing test asserts an exact object shape or exact key list that a new field joins, add the field to that assertion. Do not loosen anything else.
- If a fact in this document does not match the code, stop and report the difference. Do not invent a different rule.

## Commands

- Full check, required at the end of every phase: `npm test`. It rebuilds the native module for Node, compiles main, runs `eslint`, the naming check, the renderer type check, and every compiled test.
- Fast loop for one test: `npm run build:main` and then `node dist/main/<path>.test.js` or `node dist/shared/<path>.test.js`. If SQLite fails to load, run `npm run rebuild:native:node` once.
- Renderer bundle: `npm run build:renderer` (writes `static/renderer.js`).
- App: `npm start` (rebuilds the native module for Electron). Run `npm run rebuild:native:node` before the next `npm test`.

## Locked Decisions

### Levels

- A bonus level is `'off' | 'low' | 'high'`. The dialog default is `'low'`.
- The existing booleans (`countryBonusEnabled`, `terrainBonusEnabled`, `weatherBonusEnabled`) stay. They still answer "is this bonus on". The new level fields answer "how strong". A level field is read only when its boolean is `true`. A missing level means `'low'`.
- Saved matches and old in-progress battles have no level rows or fields. They play at Low, which is exactly the rules they were started under.
- A `game:newGame` payload or a `resetGameForNewMatch` call that omits a level means Off for that bonus. This keeps today's "missing means off" behavior for tests and callers.
- Each dropdown is independent. Country can be High while terrain is Low.

### Origin Bonus (Country and Terrain)

| Level | Added to a qualifying roll |
|---|---|
| Low | +1 |
| High | +2 |

- Everything that the origin bonus changes or leaves alone today stays the same. Only the amount changes.
- No stacking: a unit that qualifies for both country and terrain adds the larger of the two amounts. For example, country High and terrain Low on a unit that qualifies for both adds 2.
- Playability: the highest printed attack is 3, so the highest hit threshold is 5 and a 6 always misses. The highest defense threshold is 4. Casualty order keeps printed defense.

### Weather Bonus

| Rule | Low (today) | High |
|---|---|---|
| Weather that slows untagged armor | snow, rain | snow, rain, heat |
| Weather that slows untagged naval | snow | snow, rain |
| Strategic movement when slowed | 1 hex | 1 hex |
| Tactical point budget cap when slowed | 2 | 1 |
| Armor ranged attack in snow or heat | -1 | -2 |
| Air strike when base or target is snow, rain, or heat the unit lacks | -1 | -2 |
| Infantry open-ground enter cost in snow or rain | 2 | 2 (unchanged) |
| Strategic ferry into snow | 2 hexes | 2 hexes (unchanged) |
| Defense, melee, casualty order | printed | printed |

- Strategic movement still reads the weather of the hex the unit occupies now, never the destination. Every strategic caller keeps one budget per unit.
- One "slowing weather" table drives strategic movement, the tactical budget, the tactical slow-terrain tooltip label, and the prompt text, so they cannot disagree.
- Tactical budget when slowed: `Math.max(1, Math.min(budgetAfterTerrain, cap))`. A slowed unit never drops below 1 point. The march planner already guarantees one cell of progress when the budget is positive but cannot pay for the first step (`stopIdxWithMinimumOneHexProgress` in `src/shared/tacticalRes4MovementPlanner.ts`).
- Attack penalty: `attackHitThreshold` already floors the printed attack at 1 before adding the origin bonus. Armor and air print 3, so High leaves a threshold of 1 (a roll of 1 still hits).
- High origin and High weather can cancel. Home armor firing in snow ends at `max(1, 3 - 2) + 2 = 3`.

### Persistence

- Existing `game_config` keys stay exactly as they are: `country_bonus_enabled`, `terrain_bonus_enabled`, and `weather_bonus_enabled` (`'1'` / `'0'`), plus `start_month`.
- New keys: `country_bonus_level`, `terrain_bonus_level`, and `weather_bonus_level`. Values are `'low'` and `'high'`. Each new match writes all three. When a bonus is off, its level row is `'low'`.
- Reading a level: exactly `'high'` (after trim and lowercase) is High. A missing row, a missing database, or any other value is Low.

### AI Surfaces

- At Low, prompt text is byte-for-byte what it is today. The exact Low strings are pinned by tests before any rule changes.
- `assess_unit` gains `originBonusAmount` next to `originBonusHere`, in both theaters. It is present exactly when `originBonusHere` is present: 0 when the list is empty, otherwise the amount that unit adds where it stands. This is the only new tool field, and it is how the Unit Status Bonus cell knows the number.
- `estimate_combat` rows report `originBonus: 1` or `originBonus: 2`, matching the amount actually added.
- `rangedAttackPenalized` and `airStrikePenalizedAtBase` stay booleans. They become `true` for any penalty above 0.
- Tool names, tool catalog descriptions, and tool schemas do not change.

### New-Game Dialog

- One row: the Fog of war checkbox, then three labeled dropdowns: Country bonus, Terrain bonus, Weather bonus. Each lists Off, Low, High. The Starting month control stays below the row.
- Every time the overlay opens (startup, New, game over), Fog of war is checked, every dropdown is set to Low, and the month is January.
- DOM ids: `new-game-country-bonus-select`, `new-game-terrain-bonus-select`, and `new-game-weather-bonus-select`. They replace the three `*-bonus-checkbox` ids. `new-game-fog-checkbox` is unchanged.
- No CSS change is expected. `.game-over-options label` is already `inline-flex` with a gap, and `.game-over-box select` already styles selects.

### Out of Scope

- Fog of war levels.
- Showing the amount in the unit flag tooltip. It lists which bonuses apply, with no number, and stays that way.
- Any change to infantry open-ground cost, ferry range, melee, defense, casualty order, or Best Options ranking.

## Verified Facts

Line numbers are approximate. Search by name.

- Settings path: `src/renderer/gameplay/newGameOptionsUi.ts` (`readNewGameOptionFlags`, `resetNewGameOptionCheckboxes`), `src/renderer/gameplay/newGame.ts` (payload spread near line 233, reset near line 315), `src/renderer/core/uiState.ts` (reset near line 141), `NewGameIpcPayload` in `src/shared/ipc/ordersTypes.ts` (bonus fields near lines 366-389), the `game:newGame` handler in `src/main/main.ts` (near lines 300-330), `ResetGameForNewMatchOptions` and `resetGameForNewMatch` in `src/main/gameDb/resetGame.ts` (near lines 162-265), the facade in `src/main/gameDb.ts` (near line 1537), `persistOriginBonusSettings` and `readPersistedOriginBonusSettings` in `src/main/gameDb/originBonusConfig.ts`, and snapshot assembly in `getGameStateSnapshot` in `src/main/gameDb/fogState.ts` (near lines 187-269).
- `OriginBonusSettings` is in `src/shared/originBonusTypes.ts`. It already carries the weather flag and start month despite its name. Keep that.
- `originBonusSettingsFromSnapshot` in `src/shared/originBonusRules.ts` (near line 85) turns a snapshot into settings for tools, prompts, and the renderer.
- Battles: `computeTacticalBattleSnapshot.ts` (near lines 394-398 and 548) copies only weather onto `TacticalBattleSnapshot` (`weatherBonusEnabled`, `weather`). Country and terrain for battle dice are re-read from `game_config` through `readOriginBonusSettingsFromDb` in `src/main/originBonus/originHitBonusLookupDb.ts`. `gameActionsCore.ts` near line 974 builds a `terrainBattle` slice that copies `weatherBonusEnabled` and `weather`.
- Origin amount sites: `ORIGIN_HIT_BONUS` and `originHitBonusFromSources` and `formatOriginBonusTableCell` in `originBonusRules.ts`. `OriginHitBonus = 0 | 1` in `originBonusTypes.ts`. `withOriginHitBonus` in `src/main/originBonus/originHitBonusLookup.ts` (near line 107) keeps a bonus only when it is exactly 1. `originBonusSummaryField` in `src/main/tools/combatEstimationSides.ts` (near line 219) reports a bonus only when it is exactly 1. `buildOriginBonusRule` in `src/main/openRouter/promptSpec/gameRuleText.ts` (near line 185). The briefing Bonus cell is built in `buildUnitStatusTable` in `briefingFormatter.ts` (near line 425). `assess_unit` origin fields come from `src/main/tools/originBonusAssessment.ts`.
- Weather amount sites, all in `src/shared/weatherBonusRules.ts`: `strategicMovementHexesFor` (near line 250), `tacticalWeatherMovementBudget` (near line 271), and `weatherAttackPenalty` (near line 316, returns `0 | 1`). `weatherMatch.ts` wraps them in `strategicRangeOnState` and `weatherPenaltyForRoll`. `combatHitThresholds.ts` near line 61 treats any penalty other than exactly 1 as 0. The tactical tooltip label is `weatherBudgetSlowLabel` in `src/shared/orderPreviewSlowTerrainTooltip.ts` (near line 311), which hard-codes the Low weather list.
- `buildWeatherRule` in `gameRuleText.ts` (near line 222) is one fixed string. No test asserts it today.

## Phase 1: Pin Today's Behavior

Goal: tests that pass on the current code and must keep passing unchanged at Low. No product code changes in this phase.

1. Run `npm test` and confirm it passes. If it fails before any change, stop and report.
2. In `src/main/openRouter/promptSpec/gameRuleText.test.ts`, add exact-string tests (`assert.equal` against a literal) that capture what the current code returns:
   - `buildOriginBonusRule` on the strategic map with the country bonus on and air units present.
   - `buildOriginBonusRule` in a battle with both bonuses on and air units present.
   - `buildWeatherRule` with the weather bonus on.
   Get each literal by temporarily printing the current output, then paste it. Do not write the string by hand. Remove the temporary print.
3. In `src/shared/weatherBonusRules.test.ts`, add Low cases that are not covered today. Each must pass on the current code:
   - Strategic: untagged armor in rain moves 1. Untagged armor in heat moves 2. Untagged naval in rain moves 2.
   - Tactical (`tacticalWeatherMovementBudget`): untagged armor with printed budget 4 in snow gets 2. Untagged naval with printed budget 3 in snow gets 2. Untagged naval with printed budget 3 in rain keeps 3.
   - Attack: untagged armor ranged in snow returns 1. Untagged armor ranged in heat returns 1.
4. Create `src/main/combatHitThresholds.test.ts` (plain `node:test`) for `attackHitThreshold` and `defenseHitThreshold`: printed armor attack is 3, armor with penalty 1 is 2, armor with origin bonus 1 is 4, and infantry defense with origin bonus 1 is 3.

Verify: `npm test` passes. `git diff --stat` shows only test files.

## Phase 2: Level Vocabulary and Settings Plumbing

Goal: levels travel from the dialog to the database, the snapshots, and settings objects. Gameplay is identical: the checkboxes still exist and a checked box means Low.

### 2.1 New shared module `src/shared/bonusLevel.ts`

Model it on `src/shared/gameSize.ts`. No logging. Exports:

- `type BonusLevel = 'off' | 'low' | 'high'`.
- `type ActiveBonusLevel = Exclude<BonusLevel, 'off'>`.
- `BONUS_LEVELS: ReadonlyArray<BonusLevel>`, frozen, in the order off, low, high.
- `DEFAULT_BONUS_LEVEL: BonusLevel = 'low'`. This is the dialog default.
- `parseBonusLevel(raw: unknown, fallback: BonusLevel): BonusLevel`. Accepts the three strings after trim and lowercase. Anything else returns `fallback`.
- `parseActiveBonusLevel(raw: unknown): ActiveBonusLevel`. Returns `'high'` only for `'high'` after trim and lowercase. Anything else returns `'low'`. Used for persisted rows and snapshot fields.
- `bonusLevelOf(enabled: boolean | undefined, level: ActiveBonusLevel | undefined): BonusLevel`. Returns `'off'` unless `enabled === true`. Otherwise returns `level ?? 'low'`.

Add `src/shared/bonusLevel.test.ts` covering: every valid string parses, case and whitespace are tolerated, an unknown value returns the fallback, `parseActiveBonusLevel` returns low for `'off'` and junk, and `bonusLevelOf` returns off when disabled even when the level is high.

### 2.2 Settings types and helpers

- `OriginBonusSettings` (`src/shared/originBonusTypes.ts`): add optional `countryBonusLevel?`, `terrainBonusLevel?`, and `weatherBonusLevel?`, all `ActiveBonusLevel`. Contract: read only when the matching boolean is true. Missing means Low. Use `import type`.
- `src/shared/originBonusRules.ts`:
  - `originBonusSettingsFromLevels(input: { country: BonusLevel; terrain: BonusLevel; weather: BonusLevel; startMonth?: number }): OriginBonusSettings`. Each boolean is `level !== 'off'`. Each level field is present only when that bonus is on. `startMonth` is copied.
  - `originBonusLevelFor(settings: OriginBonusSettings, source: OriginBonusSource): BonusLevel`. Country uses `bonusLevelOf(settings.countryBonusEnabled, settings.countryBonusLevel)`, and terrain likewise.
  - `originBonusSettingsFromSnapshot`: add the three level fields to the `Pick`, and copy each level when its boolean is true (weather together with `weatherBonusEnabled` and `startMonth`, as today).
- `src/shared/weatherBonusRules.ts`:
  - `weatherBonusLevelOf(source: { readonly weatherBonusEnabled?: boolean; readonly weatherBonusLevel?: ActiveBonusLevel }): BonusLevel` returns `bonusLevelOf(source.weatherBonusEnabled, source.weatherBonusLevel)`. A `GameStateSnapshot`, a `TacticalBattleSnapshot`, and an `OriginBonusSettings` all fit this shape.
  - `weatherLevelFields(level: BonusLevel): { readonly weatherBonusEnabled: boolean; readonly weatherBonusLevel?: ActiveBonusLevel }` is the reverse. Off returns `{ weatherBonusEnabled: false }`. Low or High returns `{ weatherBonusEnabled: true, weatherBonusLevel: level }`. Use it to build a weather-state literal from a level in one expression.

### 2.3 Persistence (`src/main/gameDb/originBonusConfig.ts`)

- Add `COUNTRY_BONUS_LEVEL_CONFIG_KEY = 'country_bonus_level'`, `TERRAIN_BONUS_LEVEL_CONFIG_KEY = 'terrain_bonus_level'`, and `WEATHER_BONUS_LEVEL_CONFIG_KEY = 'weather_bonus_level'`, each with a "frozen persisted key" comment like the existing keys.
- `persistOriginBonusSettings`: also upsert the three level rows, writing `settings.<x>BonusLevel ?? 'low'`.
- `readPersistedOriginBonusSettings`: read each level row with `parseActiveBonusLevel`. Attach a level only when its boolean is true. `ORIGIN_BONUS_OFF` is unchanged.

### 2.4 New-match inputs

- `NewGameIpcPayload` (`src/shared/ipc/ordersTypes.ts`): replace `countryBonusEnabled?`, `terrainBonusEnabled?`, and `weatherBonusEnabled?` with `countryBonusLevel?`, `terrainBonusLevel?`, and `weatherBonusLevel?` of type `BonusLevel`. Contract: missing means Off. The dialog always sends all three.
- `ResetGameForNewMatchOptions` (`src/main/gameDb/resetGame.ts`): the same replacement. In `resetGameForNewMatch`, build the settings with `originBonusSettingsFromLevels`, parsing each option with `parseBonusLevel(options?.<x>BonusLevel, 'off')`.
- `src/main/main.ts` `game:newGame` handler: parse each payload level with `parseBonusLevel(payload?.<x>BonusLevel, 'off')`, log all three in the existing `logDebug`, and pass them to `resetGameForNewMatch`.
- `src/main/gameDb.ts` facade: update the comment only ("missing bonus levels mean off"). Line count unchanged.
- Update the callers that pass the old booleans. The compiler lists them. Today they are `originBonusConfig.test.ts` (`countryBonusEnabled: true` becomes `countryBonusLevel: 'low'`, and likewise for the others) and `src/main/originBonus/originHitBonusLookupDb.test.ts`. `tacticalMeleeApply.test.ts` passes an `OriginBonusSettings` literal to `persistOriginBonusSettings` and needs no change.

### 2.5 Snapshots

- `GameStateSnapshot` (`src/shared/ipc/gameStateTypes.ts`): add `countryBonusLevel?`, `terrainBonusLevel?`, and `weatherBonusLevel?` (`ActiveBonusLevel`). Each is present exactly when its boolean is true.
- `getGameStateSnapshot` (`fogState.ts`): add `countryBonusLevel` and `terrainBonusLevel` to `originFlags` when their booleans are true. Add `weatherBonusLevel` to the existing weather spread.
- `TacticalBattleSnapshot` (`src/shared/tacticalBattleTypes.ts`): add `weatherBonusLevel?: ActiveBonusLevel`, present with `weatherBonusEnabled`. The battle is saved as plain JSON (`tacticalBattlePersistence.ts`), so the field survives a restart. A battle saved before this change has no level and plays at Low.
- Object literals that copy the weather flag into a new object must carry the level too. A missed copy silently plays High as Low. These are all of them. Change each in place, with no net added lines:
  - `fogState.ts` near line 267 (strategic snapshot).
  - `originBonusSettingsFromSnapshot` in `originBonusRules.ts` near line 91 (snapshot to settings, covered in 2.2).
  - `computeTacticalBattleSnapshot.ts` near line 548: `weatherBonusLevel: weatherSettings.weatherBonusLevel ?? 'low'` inside the existing spread.
  - `gameActionsCore.ts` near line 974: add `weatherBonusLevel: preBattle.weatherBonusLevel` inside the existing spread.
  - `assessUnitProximity.ts`: replace the args field `weatherBonusEnabled?: boolean` (near line 399) with `weatherBonusLevel?: BonusLevel`, and rewrite its comment in place. Near line 511, build the state as `{ ...weatherLevelFields(args.weatherBonusLevel ?? 'off'), turnNumber, startMonth: args.startMonth }`. In `assessment.ts` near line 346, pass `weatherBonusLevel: weatherBonusLevelOf(state)` instead of `weatherBonusEnabled: state.weatherBonusEnabled === true`.
- Leave the two ferry-only literals alone: `airValidation.ts` near line 140 and `readyStrategicResolutionPipeline.ts` near line 333. Ferry range does not change by level, and `strategicFerryRangeOnState` keeps its `Pick` without the level. An extra property there is a compile error.
- Add `'weatherBonusLevel'` to the `Pick`s whose values reach the movement rules: `strategicRangeOnState` in `weatherMatch.ts` (near line 63), the battle `Pick` of `effectiveTacticalMovementPointBudgetForMarchLeg` in `tacticalTerrainCombatModifiers.ts` (near line 335), the two battle `Pick`s in `tacticalSnapshotGuards.ts` (near lines 57 and 285), and the one in `collectTacticalLegalMoveDestinationRes4Hexes.ts` (near line 41). Leave the `Pick` in `tacticalRulesAdapter.ts` (near line 89) alone. It feeds only the open-ground planner, whose rule does not change.
- Afterward, run `rg "weatherBonusEnabled: " src --glob '!*.test.ts'`. Every hit must be in the list above, a gate check such as `=== true`, or a type declaration. Report anything else instead of guessing.

### 2.6 Temporary renderer mapping

In `newGameOptionsUi.ts`, change `readNewGameOptionFlags` to return `countryBonusLevel`, `terrainBonusLevel`, and `weatherBonusLevel`: `'low'` when the box is present and checked, otherwise `'off'`. Update `NewGameOptionFlags` to match. `newGame.ts` already spreads the result into the payload. The dialog phase replaces this.

### 2.7 Tests

In `originBonusConfig.test.ts`, extend the existing cases:
- A match started with `countryBonusLevel: 'high'` and `weatherBonusLevel: 'high'` persists `'high'` rows, and both players' snapshots show `countryBonusLevel === 'high'` and `weatherBonusLevel === 'high'`.
- With every level omitted, all three level rows are `'low'`, all three booleans are false, and the snapshot has no level fields.
- A saved match: delete the three level rows after a reset with all three bonuses at `'low'`. `readPersistedOriginBonusSettings` then reports each enabled bonus at Low.

Verify: `npm test` passes. Run `npm run build:renderer`, then `npm start`. Start a match with the boxes checked, hover a unit flag, and confirm the Bonuses tooltip still lists bonuses that apply.

## Phase 3: Origin Bonus Amount by Level

Goal: High adds 2. Low output is identical, and the pinned tests prove it.

1. `originBonusTypes.ts`: `OriginHitBonus = 0 | 1 | 2`. Fix the "never past +1" comment so it says the bonus never stacks past the larger level.
2. `originBonusRules.ts`:
   - Remove `ORIGIN_HIT_BONUS`. Add `ORIGIN_HIT_BONUS_BY_LEVEL: Readonly<Record<ActiveBonusLevel, 1 | 2>>`, frozen, `{ low: 1, high: 2 }`. Removing the old constant makes the compiler list every site that must now choose a level.
   - `originHitBonusForSource(settings, source): OriginHitBonus`: 0 when that bonus is off, otherwise the table amount for its level.
   - `originHitBonusFromSources(sources, settings): OriginHitBonus`: the largest `originHitBonusForSource` over `sources`, or 0 for an empty list.
   - `formatOriginBonusTableCell(sources, amount: OriginHitBonus)`: `` `+${amount} ${sources.join(', ')}` `` when `sources` is non-empty and `amount > 0`, otherwise `'—'`.
3. `originHitBonusLookup.ts`: pass `settings` to `originHitBonusFromSources` at both call sites. In `withOriginHitBonus`, read `const bonus = lookup(u.id, u.h3Index)` once, return `{ ...u }` when it is 0, and otherwise count it and return `{ ...u, originHitBonus: bonus }`. Fix the "0 or 1" and "`originHitBonus: 1`" comments.
4. `combatEstimationSides.ts`: the `originBonus?` field type becomes `Exclude<OriginHitBonus, 0>`. `originBonusSummaryField` returns `{ originBonus: unit.originHitBonus }` whenever `unit.originHitBonus` is 1 or 2. Fix "Always 1 when present".
5. `originBonusAssessment.ts`: add `readonly originBonusAmount?: OriginHitBonus` to `OriginBonusUnitFields`. In both `strategicOriginBonusUnitFields` and `tacticalOriginBonusUnitFields`, compute the sources once into a `const`, then return `originBonusHere: sources` and `originBonusAmount: originHitBonusFromSources(sources, settings)`. Add the same optional `originBonusAmount` to the assessment unit type in `src/main/precomputation.ts` (next to `originBonusHere`, near line 92) so the briefing can read it. `tacticalBriefingAssessments.ts` and `tacticalAssessUnit.ts` already spread these fields, so they need no change.
6. `briefingFormatter.ts` near line 425: `formatOriginBonusTableCell(a.result.unit?.originBonusHere ?? [], a.result.unit?.originBonusAmount ?? 0)`. This is a one-line change.
7. `buildOriginBonusRule` (`gameRuleText.ts`):
   - Country clause: `adds ${originHitBonusForSource(settings, 'country')} to every attack or defense value it rolls there`.
   - Terrain clause: the same with `'terrain'`.
   - Stacking sentence: `The two bonuses do not stack; the most is +${Math.max(countryAmount, terrainAmount)}.`
   - Build the clause text once per source with a small local helper rather than repeating the template.
8. Fix the remaining comments that state "+1" or "adds 1": `combatHitThresholds.ts` header, `combatUnitTypes.ts` `originHitBonus`, `combatEstimationTheater.ts` `originHitBonusAt`, `tacticalAirStrikeUnits.ts`, `gameStateTypes.ts` country and terrain fields, `originBonusAssessment.ts`, and `unitOriginTooltipText.ts`.

Tests:
- `originBonusRules.test.ts`: High country adds 2. Country High plus terrain Low, qualifying for both, adds 2. Country Low plus terrain High, qualifying only for country, adds 1. The table cell reads `+2 country`.
- `originHitBonusLookup.test.ts`: `withOriginHitBonus` keeps a lookup result of 2.
- `combatEstimation.test.ts`: with the country bonus High, a qualifying armor attacker reports `attackValue: 5` and `originBonus: 2`.
- `combatHitThresholds.test.ts`: armor with origin bonus 2 is 5, and infantry defense with origin bonus 2 is 4.
- `gameRuleText.test.ts`: the pinned Low strings still pass unchanged. Add one High string test for the strategic country clause (`adds 2`) and one for the tactical stacking sentence with country High and terrain Low (`the most is +2`).
- `briefingUnitStatusBonus.test.ts`: the `assessment()` fixture builds `originBonusHere` by hand. Give it an `originBonusAmount` argument and set it next to `originBonusHere`: 1 for `['country']` and 0 for `[]`. The existing `| +1 country |` and `| — |` assertions must then pass unchanged. Add one row with amount 2 that shows `| +2 country |`.
- `assessment.test.ts` near line 554: next to the `originBonusHere` assertion, assert `originBonusAmount === 1`. The "off" case already asserts the bonus keys are absent. Add `originBonusAmount` to that check.

Verify: `npm test` passes. `rg ORIGIN_HIT_BONUS\\b src` finds nothing.

## Phase 4: Weather Rules by Level

Goal: High weather follows the table in Locked Decisions. Low output is identical.

### 4.1 Types and tables

- `src/shared/weatherBonusTypes.ts`: add `type WeatherAttackPenalty = 0 | 1 | 2`.
- `src/shared/weatherBonusRules.ts`, all frozen:
  - `WEATHER_SLOWING_STATES: Readonly<Record<ActiveBonusLevel, Readonly<Record<string, ReadonlyArray<WeatherState>>>>>` = `{ low: { armor: ['snow', 'rain'], naval: ['snow'] }, high: { armor: ['snow', 'rain', 'heat'], naval: ['snow', 'rain'] } }`. Keep each list in display order: snow, rain, heat.
  - `TACTICAL_WEATHER_BUDGET_CAP: Readonly<Record<ActiveBonusLevel, number>>` = `{ low: 2, high: 1 }`.
  - `WEATHER_ATTACK_PENALTY_BY_LEVEL: Readonly<Record<ActiveBonusLevel, 1 | 2>>` = `{ low: 1, high: 2 }`.
  - The strategic slowed move stays 1 hex. Keep it as a named constant, not a literal in two places.

### 4.2 Rule functions

Replace the `enabled: boolean` input with `level: BonusLevel` on these three functions. `level` is required, so the compiler lists every caller.

- New `weatherSlowsMovement(input: { unitType; weather; tags; level }): boolean`. False when `level === 'off'`, the weather is missing, or the unit is tagged for it. Otherwise true when `WEATHER_SLOWING_STATES[level][unitType]` includes the weather.
- `strategicMovementHexesFor({ unitType, weather, tags, level })`: printed hexes unless `weatherSlowsMovement`, in which case the slowed constant (1).
- `tacticalWeatherMovementBudget({ unitType, printedBudget, weather, tags, level })`: `printedBudget` unless `weatherSlowsMovement`, in which case `Math.max(1, Math.min(printedBudget, TACTICAL_WEATHER_BUDGET_CAP[level]))`.
- `weatherAttackPenalty({ unitType, kind, weatherAtUnit, weatherAtTarget, tags, level }): WeatherAttackPenalty`: the same conditions as today, decided by the existing private helpers. When they apply, return `WEATHER_ATTACK_PENALTY_BY_LEVEL[level]`. Return 0 when `level === 'off'`.
- Leave `tacticalWeatherOpenGroundCost` and `strategicFerryRangeHexes` with their `enabled` input. Their rules do not change by level.

### 4.3 Callers

Use `weatherBonusLevelOf(x)` wherever a caller had `enabled: x.weatherBonusEnabled === true`. Where the code checks `x.weatherBonusEnabled === true` and then passes `enabled: true`, pass `level: weatherBonusLevelOf(x)`.

- `src/main/weather/weatherMatch.ts`: `strategicRangeOnState` (add `'weatherBonusLevel'` to its `Pick`). `weatherPenaltyForRoll`: replace `enabled: boolean` with `level: BonusLevel` and return `WeatherAttackPenalty`. Include `level` in both `logTrace` calls.
- `weatherPenaltyForRoll` callers: `combatEstimationTheater.ts` near line 233 (state), `readyStrategicResolutionPipeline.ts` near line 228 (`weatherSettings` from `readPersistedOriginBonusSettings`), and `airStrikeResolution.ts` near line 340 (`penaltyForDbUnit`).
- Direct `weatherAttackPenalty` callers: `precomputation.ts` near line 271, `assessment.ts` near line 507, `tacticalAssessUnit.ts` near line 361, `tacticalStrategicOrderPhases.ts` near lines 144, 381, and 584, `tacticalAirStrikeUnits.ts` near lines 188 and 218, and `combatEstimationTheater.ts` near line 311.
- `strategicMovementHexesFor` callers: `weatherMatch.ts`; `src/main/pathfinding.ts` near line 346, where `getMovementBudgetForUnit` takes an optional `weather` object (rename its `enabled: boolean` member to `level: BonusLevel`; with no `weather` it still returns the printed budget, and its only caller, `briefingFormatter.ts` near line 278, passes none); and `src/renderer/rendering/hoverPreview.ts` near line 83 (use `weatherBonusLevelOf(state)`).
- `tacticalWeatherMovementBudget` caller: `effectiveTacticalMovementPointBudgetForMarchLeg` in `tacticalTerrainCombatModifiers.ts` (add `'weatherBonusLevel'` to the battle `Pick`, then pass `level: weatherBonusLevelOf(battle)`).
- `weatherBudgetSlowLabel` (`orderPreviewSlowTerrainTooltip.ts`): replace the hard-coded snow, rain, and naval checks with `weatherSlowsMovement({ unitType: moveType, weather: battle.weather, tags: subUnit.weatherTags, level: weatherBonusLevelOf(battle) })`. When true, return `formatWeatherLabel(battle.weather)`, which already returns `Heat` for heat. Fix its comment.
- Do not change the tactical march planners (`planTacticalRes4March` and its callers' `weatherEnabled` inputs) or the hover memo key in `tacticalMarchHoverPreview.ts`. The planners use the weather only for the open-ground cost, which does not change by level. The memo key already includes the budget, so a High budget never reuses a Low entry.

### 4.4 Threshold and flags

- `combatHitThresholds.ts` and `combatUnitTypes.ts`: the `weatherAttackPenalty?` field becomes `WeatherAttackPenalty`. `attackHitThreshold` uses `const penalty = unit.weatherAttackPenalty ?? 0`. Keep `Math.max(1, printed - penalty)`. Fix "Only 1 changes the threshold" and "lose one point".
- `rangedAttackPenalized` and `airStrikePenalizedAtBase` in `precomputation.ts`, `assessment.ts`, and `tacticalAssessUnit.ts`: compare with `> 0` instead of `=== 1`.

### 4.5 Prompt text

In `buildWeatherRule` (`gameRuleText.ts`), keep the null return when `gates.originBonusSettings.weatherBonusEnabled !== true`. Then read `const level = weatherBonusLevelOf(gates.originBonusSettings)`, add `level` to its `logTrace`, and build the movement and attack sentences from the tables:

- Add a private `formatWeatherList(states: ReadonlyArray<WeatherState>): string` that returns `snow`, `snow or rain`, or `snow, rain, or heat` (an Oxford comma before "or" with three items). Put it in `gameRuleText.ts`, or in `weatherBonusRules.ts` if a second caller appears.
- The armor and naval lists come from `WEATHER_SLOWING_STATES[level]`. The battle budget comes from `TACTICAL_WEATHER_BUDGET_CAP[level]`. Both "N lower" amounts come from `WEATHER_ATTACK_PENALTY_BY_LEVEL[level]`. Export the three tables, or small getters for them, from `weatherBonusRules.ts`.
- Every other sentence stays word for word.
- The High text must be exactly:

```text
Weather bonus is on: the month is on the turn line and every beat of a battle shares the enclosing hex's weather. Armor strategic movement is 1 in snow, rain, or heat, and naval strategic movement is 1 in snow or rain, unless the unit is tagged for that weather. In battle, armor's point budget is 1 in snow, rain, or heat and naval's is 1 in snow or rain; infantry pays 2 to enter open ground in snow or rain. Armor ranged attack is 2 lower in snow or heat, including return fire and air-strike counter-fire. An air strike is 2 lower once when its base or its target is snow, rain, or heat the unit lacks. A strategic ferry into snow is 2 hexes unless the unit is tagged for snow. Defense, melee, and casualty order keep their printed values. A tag is earned by the birth hex. The Unit Status Weather column names the weather where that unit stands. Birth tags, when the unit has any, follow in parentheses.
```

### 4.6 Tests

- `weatherBonusRules.test.ts`:
  - Update the existing calls from `enabled: true/false` to `level: 'low'` and `level: 'off'`. The expected values do not change.
  - High strategic: untagged armor in heat moves 1. Untagged naval in rain moves 1. Heat-tagged armor in heat moves 2.
  - High tactical: untagged armor with printed budget 4 in heat gets 1. Untagged naval with printed budget 3 in rain gets 1. Armor with a terrain budget of 1 (urban) in snow stays 1.
  - High attack: untagged armor ranged in snow returns 2. An untagged air strike into rain returns 2.
  - High air strike from a rain base into a heat target, untagged, returns 2. The penalty still applies once.
  - A playability test that loops over `infantry`, `armor`, `naval`, every weather (`mild`, `rain`, `snow`, `heat`), untagged, and every level. Strategic movement is at least 1. For every printed tactical budget in {1, 2, 3, 4}, the tactical budget is at least 1.
- `combatHitThresholds.test.ts`: armor with penalty 2 is 1. Armor with penalty 2 and origin bonus 2 is 3. A loop over every unit type with penalty 2 shows every threshold is at least 1. With origin bonus 2, every threshold is at most 5.
- `gameRuleText.test.ts`: the pinned Low weather string still passes unchanged. Add the exact High string above.

Verify: `npm test` passes. Because `enabled` was removed from the three rule functions, the compile errors from `npm run build:main` and `npm run check:renderer-types` are the complete caller checklist. Fix every one with a level. Never fix one by passing `'low'` as a literal.

## Phase 5: New-Game Dialog Dropdowns

Goal: the dialog shows Off / Low / High, opens at Low, and sends what the player picks.

1. `static/index.html` `.game-over-options` (near lines 90-95): keep the Fog of war label as it is. Replace each bonus checkbox label with:

```html
<label for="new-game-country-bonus-select">Country bonus
  <select id="new-game-country-bonus-select">
    <option value="off">Off</option>
    <option value="low" selected>Low</option>
    <option value="high">High</option>
  </select>
</label>
```

Do the same for `terrain` ("Terrain bonus") and `weather` ("Weather bonus"), in that order. Option values must match `BonusLevel`.

2. `src/renderer/gameplay/newGameOptionsUi.ts`:
   - Keep the fog checkbox id as its own constant. Replace the bonus ids with `NEW_GAME_BONUS_LEVEL_SELECT_IDS = { countryBonusLevel: 'new-game-country-bonus-select', terrainBonusLevel: 'new-game-terrain-bonus-select', weatherBonusLevel: 'new-game-weather-bonus-select' } as const`.
   - `export type NewGameOptionChoices = Readonly<{ fogOfWarEnabled: boolean } & Record<keyof typeof NEW_GAME_BONUS_LEVEL_SELECT_IDS, BonusLevel>>`. This replaces `NewGameOptionFlags`.
   - `readNewGameOptionChoices()` replaces `readNewGameOptionFlags`. Fog keeps its current rule: on unless the box is present and unchecked. Each level is `parseBonusLevel(select?.value, 'off')`, so a missing control is Off, matching a missing checkbox today.
   - `resetNewGameOptionControls()` replaces `resetNewGameOptionCheckboxes`. It checks fog, sets every present bonus select to `DEFAULT_BONUS_LEVEL`, and sets the month to `'1'`.
   - Rename the callers: `newGame.ts` (payload near line 233, reset near line 315) and `uiState.ts` (near line 141).
3. Run `npm run build:renderer` so `static/renderer.js` is regenerated.

Verify:
- `npm test` passes, including `check:renderer-types`.
- `rg "bonus-checkbox|readNewGameOptionFlags|resetNewGameOptionCheckboxes|NewGameOptionFlags" src static --glob '!static/renderer.js'` finds nothing.
- `npm start`: the overlay shows Fog of war checked and three dropdowns at Low. Set Country to High and Weather to Off, then start. Open New again: every dropdown is back to Low. With the game in progress, the turn line shows no month when Weather is Off.

## Phase 6: Documentation

Update the living docs in place. Describe the rules, not this plan.

- `doc/combat-rules-v3.md` §4.9: the origin bonus amount by level, no stacking takes the larger amount, the weather table from Locked Decisions, the tactical floor of 1, and the attack floor. Also fix the "checkbox" wording at the §4.9 origin and weather intros and in §2 and §12.4.
- `doc/ux/new-game-dialog.md`: the row is one checkbox and three dropdowns, defaults are Low on every open, and the Code Entry Points list uses the new ids.
- `doc/ui-style-guide.md` near line 183, `doc/region-vs-region.md` near line 15, and `doc/game-size-unit-caps.md` near line 17: the controls are dropdowns.
- `doc/ux/modes-and-transitions.md` near line 13: "country bonus, terrain bonus, weather bonus" are levels.
- `doc/ai-tools.md` near lines 37-38 and 48: `originBonusAmount`, the `originBonus` value of 1 or 2, and penalized flags meaning any penalty.
- `doc/ai-commander-prompts/strategic-prompt.md` (near lines 45-46 and 81), `tactical-prompt.md` (near lines 48-52 and 66), `variants.md` (§8 and §9: gates read the level, Low matches the earlier on-state, High changes only the amounts and lists), and `crosswalk.md` near line 207.
- `doc/README.md` near line 36: point to `ORIGIN_HIT_BONUS_BY_LEVEL`. Add a row for the weather level tables in `src/shared/weatherBonusRules.ts`.

Verify: `rg -i "bonus checkbox|bonus.{0,20}checked|checkbox.{0,40}bonus" doc` finds no live doc that still calls the Country, Terrain, or Weather bonus a checkbox. Older plans under `doc/` that are not living docs can be left as they are. `rg "ORIGIN_HIT_BONUS\b" doc` finds nothing.

## Phase 7: Final Verification

1. `npm test` passes.
2. `git status` and `git diff --stat`: only files this plan names changed, plus `static/renderer.js`. No file outside the file-size rules grew past 600 lines (`gameActionsCore.ts` and `gameDb.ts` have no net added lines).
3. `git diff -- src doc static/index.html | rg -i "phase [1-7]|bonus-levels-execution|pin today|level vocabulary|settings plumbing"` finds nothing. "Phase" alone is a normal word in this codebase (resolution phases), so do not search for it by itself.
4. Play check with `npm start`:
   - All three at High, starting month July. Find untagged armor in a hot hex: its hover preview and Ready both allow 1 hex. Open `debug-last-strategic-prompt.txt` after an AI turn and confirm it says `adds 2` and `2 lower`, and lists heat for armor.
   - Start a battle in snow or rain with armor that lacks the tag. The march preview stops after one cell and the slow-terrain tooltip names the weather.
   - All three at Low: the prompt says `adds 1` and `1 lower`, and armor in heat moves 2.
   - All three at Off: no Bonus or Weather column in the prompt, and no month on the turn line.
5. Report what changed per phase, the test results, and anything in this document that did not match the code.
