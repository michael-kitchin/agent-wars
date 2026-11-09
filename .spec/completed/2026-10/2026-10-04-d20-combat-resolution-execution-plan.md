# d20 Combat Resolution Execution Plan

The executing agent follows this plan phase by phase, in order.

## Goal

Replace the d6 hit roll with a d20, give origin, weather, and terrain their own modifier sizes, and add terrain cover as a new hit-roll modifier. Keep one die per unit, one hit removes one unit, the resolution order, the casualty order, and the random attack-versus-defense melee.

Decisions already made by the user:

- Every match uses the d20 after the upgrade. There is no per-match dice setting and no migration.
- Terrain cover is always on. It has no new-game option.
- Melee keeps its current rule: one side rolls attack and the other rolls defense, chosen at random.

## Final Rules

These are the target numbers. Every phase that changes a number points back here.

### The Die and the Hit Number

- One d20 per roll. A roll hits when it is at or below the hit number.
- Attack hit number: `min(17, max(2, printed attack − weather penalty − target cover) + origin bonus)`.
- Defense hit number (melee only): `min(17, printed defense + origin bonus)`.
- The floor of 2 is applied before the origin bonus, so a home unit always gets its full bonus. The cap of 17 means a roll of 18, 19, or 20 always misses.
- Every roll still consumes exactly one `next()` draw from the seeded RNG. The melee-intercept resume depends on that count (`rngInvocationsBeforeMelee` in `readyStrategicResolutionPipeline.ts`).

### Printed Values

| Unit | Attack | Defense | d6 today |
|---|---|---|---|
| Infantry | 3 (15%) | 7 (35%) | 1 / 2 (17% / 33%) |
| Armor | 10 (50%) | 7 (35%) | 3 / 2 (50% / 33%) |
| Naval | 7 (35%) | 7 (35%) | 2 / 2 (33% / 33%) |
| Air | 10 (50%) | 3 (15%) | 3 / 1 (50% / 17%) |

Casualty order still sorts by printed defense, then infantry, armor, naval, air. The relative order is unchanged: air first, then the three types tied at 7.

### Origin Bonus

Low adds 2, High adds 4. Country and terrain still do not stack; the larger amount applies. Every other origin rule is unchanged.

### Weather Penalty

Low removes 3, High removes 5. It applies to the same rolls as today: armor ranged fire, return fire, and anti-air counter-fire in snow or heat the unit lacks, and air strikes when the base or target is snow, rain, or heat the unit lacks. Defense and melee never take it. Movement, budgets, and ferry rules do not change.

### Terrain Cover (New)

Cover lowers the shooter's attack hit number based on the target's terrain.

| Target terrain | Against ground and naval fire | Against air strikes |
|---|---|---|
| Forest | 2 | 1 |
| Mountain | 2 | 0 |
| Wetlands | 1 | 0 |
| Urban or rubble (battle cells only) | 2 | 1 |
| Everything else | 0 | 0 |

- **Cover belongs to the target hex or cell, not to each defender.** Every unit there shares it, including fleets and embarked cargo in a coastal hex whose main terrain is forest or mountain. Cover is applied once per shot, before hits are assigned by casualty order.
- **Strategic map:** the target hex's terrain is `hexes.terrain_kind`, the dominant detail-cell kind that the terrain pipeline already stores. Urban does not give cover on the strategic map. The column is written once at seeding and never changes during a match.
- **Battle:** the target cell's effective terrain kind plus its urban and rubble flags. The effective kind is the one movement already uses: a cell without its own kind takes the battle hex's kind (`effectiveRes4TerrainKindString`). When a cell has both a terrain kind and a flag, use the larger cover in each column.
- **Applies to:** ranged fire at units (strategic and battle), and air strikes on units (strategic and battle).
- **Never applies to:** melee, return fire, anti-air counter-fire, air strikes on infrastructure, battle ranged fire at infrastructure, or infrastructure counter-fire.

### Infrastructure Counter-Fire

Fixed rolls, unchanged by origin, weather, or cover: an urban hex or seaport destroys the striker on 3 or less (15%, was 17%). An airport destroys it on 7 or less (35%, was 33%).

### Reference Odds

Use these to sanity-check tests and docs. All are single-roll hit chances.

| Situation | d6 today | d20 |
|---|---|---|
| Armor ranged, clear | 50% | 50% |
| Armor ranged, High origin | 83% | 70% |
| Armor ranged, untagged Low snow | 33% | 35% |
| Armor ranged, untagged High snow | 17% | 25% |
| Armor ranged, High snow and High origin | 50% | 45% |
| Armor ranged at a forest hex, clear / Low snow / High snow | 50% / 33% / 17% | 40% / 25% / 15% |
| Naval bombarding a forest coast | 33% | 25% |
| Air strike, untagged High weather | 17% | 25% |
| Air strike on units in forest | 50% | 45% |
| Battle infantry firing at an urban cell | 17% | 10% (floor) |
| Infantry melee defense, High origin | 67% | 55% |
| Melee, 1 armor attacking 1 infantry (average over roles): defender lost / attacker lost | 41.7% / 25% | 42.5% / 25% |

Why these numbers: base odds stay where players know them. The bonus and penalty steps are smaller than a straight ×20/6 scale, so High weather and High origin no longer cancel exactly, and two or three effects can stack before a shot hits the floor.

## Ground Rules (Apply to Every Phase)

1. **One phase at a time.** Finish a phase's verification before starting the next. If verification fails and the cause isn't clear after two focused attempts, stop and report the failing command and output. Do not revert files you didn't change in this phase.
2. **Never commit or push.** The user reviews every change.
3. **No plan identifiers.** Never write "Phase N", "Step N", or this plan's name in code, comments, tests, or docs.
4. **Naming** (`doc/naming-conventions-contract-v1.md`): files and directories are camelCase; exported functions are camelCase; exported types are PascalCase. Never use the suffixes `Utils`, `Impl`, `Manager`, `Service`, `Processor`, `Controller`, or `Facade`. Use the exact file names in this plan.
5. **Frozen strings.** Do not rename IPC channels, LLM tool names, SQL columns, or JSON keys returned to the model (`attackValue`, `defenseValue`, `originBonus`, `originBonusAmount`, `rangedAttackPenalized`, `airStrikePenalizedAtBase`).
6. **Orienting comments.** Every new or changed declaration gets a real block comment in this format. Do not use the boilerplate "Supports maintainability by documenting why X exists" text. When you change the value of a declaration that has a boilerplate comment (for example `ATTACK` and `DEFENSE` in `combatConstants.ts`), replace that comment with a real one.

```ts
/**
 * One-sentence summary of what this does.
 *
 * Purpose: Why it exists.
 * When to use: Which callers or situations.
 * Expected outcome: What it returns or changes.
 * Exceptions: What it throws, or "None".
 */
```

7. **Logging.**
   - Main process (`src/main/logger.ts`): new public functions call `logDebug`. Read-only getter-style functions call `logTrace`. Every `catch` calls `logError`.
   - Hot paths (a die roll, a per-roll threshold, a per-roll lookup closure) log nothing or a `logTrace` with a short string and no payload. Say so in the orienting comment.
   - Shared code (`src/shared`) must not import the logger, Electron, or Node built-ins.
   - Renderer code keeps its existing `console.error` pattern in `catch` blocks.
8. **Mutability.** Use `const` unless a binding is reassigned. Use `readonly` on properties never written after construction. Freeze exported tables with `Object.freeze`, as `weatherBonusRules.ts` does.
9. **Size and arguments.** No new file over 600 lines. No new function with more than 6 named parameters; use a parameter object instead. `combatResolution.ts` (705 lines) and `tacticalStrategicOrderPhases.ts` (748 lines) are already over 600. Add only the few lines this plan names to them, and put new logic in the new modules.
10. **No import cycles.** A new module must never value-import from a module that imports it. `import type` is allowed.
11. **Tests.** Cover happy paths and essential failure cases of the new or changed contracts only. Do not add source-text assertions. When you extend a test file, follow its style: `combatResolution.test.ts` and `combatEstimation.test.ts` use plain functions called from a `run` function at the bottom, and most others use `node:test`. New test files use `node:test` with `node:assert/strict`.
12. **Reuse.** Every die roll goes through `createCombatDieRoller`. Every cover value goes through `terrainCoverFor`. Do not copy the cover table or the die size anywhere else.

## Verification Toolkit

Run these from the repo root (PowerShell):

- Full gate: `npm test`. This rebuilds native modules for Node, then runs `build:main`, `lint`, `naming:check`, `check:renderer-types`, and every `dist/**/*.test.js`.
- Before `npm test` in any phase that adds or renames test files, run `npm run clean:dist`. Otherwise stale compiled tests can still run.
- Focused test: `npm run build:main` then `node dist/main/<path>.test.js`. Shared tests compile to `dist/shared/<path>.test.js`. Run `npm run rebuild:native:node` once first.
- Cycles: `npm run check:circular`
- Renderer bundle: `npm run build:renderer`
- Renderer types: `npm run check:renderer-types`. The error count must not grow past `scripts/renderer-typecheck-baseline.json`.
- Line count: `(Get-Content <path>).Count`
- Search: `rg -n "<pattern>" src doc`

### Manual Smoke Checks (Agent-Attempted)

1. Start the app in the background with debug logging: `$env:AGENT_WARS_LOG_LEVEL='debug'; npm start`. `npm start` rebuilds the native module for Electron; the next `npm test` rebuilds it for Node again, which is expected.
2. Wait for startup, then read the terminal output. **Pass** means the window process stays up, there are no uncaught exceptions, and there are no `logError` lines that weren't present in the baseline launch.
3. Stop only the process you started, by its PID. Never kill other Electron or Node processes.
4. Interactive steps (starting a match, playing a turn, hovering) can't be driven reliably. List each one in the phase report as "Not verified (needs human)", with exact steps, so the user can run them together at the end.

## Phase 0: Baseline

1. Run `git status --short` and record the output. If the tree isn't clean, stop and ask the user how to proceed.
2. Run `npm test`, `npm run check:circular`, and `npm run build:renderer`. All three must pass. If any fails, stop and report.
3. Record line counts for: `src/main/combatResolution.ts`, `src/main/tacticalBattle/tacticalStrategicOrderPhases.ts`, `src/main/gameActions/airStrikeResolution.ts`, `src/main/tools/combatEstimation.ts`, `src/main/openRouter/promptSpec/gameRuleText.ts`, `src/shared/orderPreviewEffectsTooltip.ts`, `src/renderer/map/terrainTooltipHtml.ts`.
4. Do one baseline app launch (Manual Smoke Checks steps 1–3). Record which `logError` lines, if any, appear on a normal startup.

## Phase 1: One Die Roller and Shared Dice Constants (No Behavior Change)

**Goal:** every roll and every die-size assumption goes through one module, while the game still plays a d6. All existing test assertions keep their values.

### 1.1 Create `src/main/combatDice.ts`

Exports, each with an orienting comment:

```ts
export const COMBAT_DIE_SIDES = 6;
export const MIN_ATTACK_HIT_THRESHOLD = 1;
export const MAX_HIT_THRESHOLD = 5;
export const INFRASTRUCTURE_COUNTER_FIRE_THRESHOLD: Readonly<Record<'urban' | 'airport' | 'seaport', number>> =
  Object.freeze({ urban: 1, airport: 2, seaport: 1 });
export function createCombatDieRoller(next: () => number): () => number;
export function hitChanceForThreshold(threshold: number): number;
```

- `createCombatDieRoller(next)` returns `() => Math.floor(next() * COMBAT_DIE_SIDES) + 1`. Each call consumes exactly one draw. Log `logTrace('combatDice createCombatDieRoller')` in the factory only; the returned closure does not log.
- `hitChanceForThreshold(threshold)` returns `Math.min(Math.max(threshold, 0), COMBAT_DIE_SIDES) / COMBAT_DIE_SIDES`. No logging (called per die in estimates); say so in the comment.
- The values `6`, `1`, and `5` reproduce today's behavior: the highest reachable threshold today is 3 + 2 = 5.
- Type the counter-fire key as `Exclude<AirStrikeTargetType, 'units'>`, with `import type { AirStrikeTargetType } from '../shared/ipc/ordersTypes'`. That file is shared and creates no cycle. The strategic caller already receives that narrowed type. In the battle loop, `s.targetType` is already narrowed because the `'units'` branch ends in `continue`. Do not add casts.

### 1.2 Thresholds

In `src/main/combatHitThresholds.ts`:

- `attackHitThreshold`: `Math.min(MAX_HIT_THRESHOLD, Math.max(MIN_ATTACK_HIT_THRESHOLD, printed - penalty) + origin)`.
- `defenseHitThreshold`: `Math.min(MAX_HIT_THRESHOLD, getDefense(unitType) + origin)`.
- Rewrite the module and function comments to say "die face" and name the constants, not "d6", "1", or "5". The `When to use` lines become `rollDie() <= attackHitThreshold(unit)`.

### 1.3 Replace Every Roller

Replace each `Math.floor(next() * 6) + 1` lambda with `createCombatDieRoller(next)`, and rename every `rollD6` identifier to `rollDie`:

- `src/main/combatResolution.ts`: the two lambdas in `runRangedPhase` and `runMeleePhase`, and the `rollD6` parameters of `resolveOneRangedEngagement` and `resolveOneMeleeEngagement`. Update the module header comment ("One d6 per unit") and the `resolveOneMeleeEngagement` comment ("integers 1–6") to name `COMBAT_DIE_SIDES`.
- `src/main/gameActions/airStrikeResolution.ts`: the lambda in `resolveAirStrikePhase`, and the `rollD6` parameters of `resolveAirStrikeAgainstUnits` and `resolveAirStrikeAgainstInfrastructure`. Replace `order.targetType === 'airport' ? 2 : 1` with `INFRASTRUCTURE_COUNTER_FIRE_THRESHOLD[order.targetType]`.
- `src/main/tacticalBattle/tacticalStrategicOrderPhases.ts`: `rollD6Strike`, `rollD6`, and `rollRangedInfraStrikeD6` become one `const rollDie = createCombatDieRoller(next);` created once, before the air loop. Replace `s.targetType === 'airport' ? 2 : 1` with the constant.
- `src/main/tacticalBattle/tacticalAirStrikeUnits.ts`: rename the input field `rollD6` to `rollDie` and its comment ("Integers 1–6") to name the die constant. Also fix the "d6 resolution" wording in the `tacticalMeleeApply.ts` comment.
- Leave the draws that are not die rolls exactly as they are: the side shuffle in `runMeleePhase` (`Math.floor(next() * (i + 1))`) and the urban-cell pick in `airStrikeResolution.ts` (`Math.floor(next() * pool.length)`). Changing them would shift every later roll in a turn.

### 1.4 Estimator

In `src/main/tools/combatEstimation.ts`, replace each `attackHitThreshold(u) / 6`, `defenseHitThreshold(u) / 6`, and `(leadAttack / 6)` with `hitChanceForThreshold(...)`.

### 1.5 Test Helpers (Rename Only)

- `src/main/tacticalBattle/testSupport/tacticalDiceFixtures.ts`: rename `tacticalUniformForD6Face` to `tacticalUniformForCombatDieFace(face: number)`. It throws `RangeError` unless `face` is an integer from 1 to `COMBAT_DIE_SIDES`, and returns `(face - 1) / COMBAT_DIE_SIDES`. Rewrite the module comment without "d6".
- `src/main/tacticalBattle/tacticalStrategicOrderingAlignment.test.ts`: update the import and calls. Keep the same faces. Reword inline comments from `d6=1` to `roll 1`.
- `src/main/combatResolution.test.ts`: `rollExactly` returns `() => (roll - 0.5) / COMBAT_DIE_SIDES`. Reword its comment and the `// d6 => 1` comment.
- `src/main/tacticalBattle/tacticalMeleeApply.test.ts`: `rollThree` becomes `() => (3 - 0.5) / COMBAT_DIE_SIDES`.

### Verify

- `npm run clean:dist`, then `npm test`, `npm run check:circular`. No assertion value may change in this phase.
- `rg -n "\* 6\) \+ 1|rollD6|D6Face" src` returns nothing.
- `rg -n "/ 6\b" src` returns only test files: the Poisson fixture in `src/main/tools/combatEstimation.test.ts` (it tests the math helper, not the die), and the expected-probability literals in `combatEstimation.test.ts` and `combatEstimationTactical.test.ts`. The probability literals change in the d20 phase.

## Phase 2: Switch to the d20 and the New Printed Values

**Goal:** the game plays the d20 with the printed values, origin amounts, weather amounts, and infrastructure thresholds from Final Rules. There is no terrain cover yet.

### 2.1 Constants

- `src/main/combatDice.ts`: `COMBAT_DIE_SIDES = 20`, `MIN_ATTACK_HIT_THRESHOLD = 2`, `MAX_HIT_THRESHOLD = 17`, `INFRASTRUCTURE_COUNTER_FIRE_THRESHOLD = { urban: 3, airport: 7, seaport: 3 }`. Update each comment with the percentage it gives.
- `src/main/combatConstants.ts`: `ATTACK` becomes infantry 3, armor 10, naval 7, air 10. `DEFENSE` becomes infantry 7, armor 7, naval 7, air 3. Replace the boilerplate comments on `ATTACK`, `DEFENSE`, and their properties with one real comment per table that states the d20 hit chance. Leave the unknown-type fallbacks in `getAttack` and `getDefense`, but change them to the infantry values (`?? 3` and `?? 7`).
- `src/shared/originBonusTypes.ts`: `OriginHitBonus = 0 | 2 | 4`.
- `src/shared/originBonusRules.ts`: `ORIGIN_HIT_BONUS_BY_LEVEL = { low: 2, high: 4 }`. Rewrite its comment: the highest attack is 10 + 4 = 14, under the cap of 17.
- `src/shared/weatherBonusTypes.ts`: `WeatherAttackPenalty = 0 | 3 | 5`.
- `src/shared/weatherBonusRules.ts`: `WEATHER_ATTACK_PENALTY_BY_LEVEL = { low: 3, high: 5 }`. Rewrite its comment and the `weatherAttackPenalty` comment ("1 at Low, 2 at High").
- `src/main/combatUnitTypes.ts`: rewrite the `originHitBonus` and `weatherAttackPenalty` comments with the new amounts and the floor of 2.

### 2.2 Prompt Text

In `src/main/openRouter/promptSpec/gameRuleText.ts`, `buildCombatStatsLine` says `d20 per shot` instead of `d6 per shot`. Make no other wording change yet. Origin and weather sentences read their amounts from the tables, so they update automatically.

### 2.3 Comment Sweep

Run `rg -n "\bd6\b|1–6|1-6|faces|roll ≤ 3|1 \(Low\)|2 \(High\)|1 at Low|2 at High" src` and fix every comment or string that states an old number. Do not change movement or budget numbers; they share some of these words (the tactical budget cap is still 2 at Low and 1 at High).

### 2.4 Test Updates

Use these exact replacements. Face 1 still always hits (floor 2) and face 20 always misses (cap 17); everything else is recomputed.

- `src/main/combatHitThresholds.test.ts`: rewrite to:
  - armor: no modifiers 10; weather 3 → 7; weather 5 → 5; origin 2 → 12; origin 4 → 14.
  - floor: infantry with weather 5 → 2; infantry with weather 5 and origin 4 → 6.
  - every type with origin 4: attack and defense ≤ 17. Every type with weather 5: attack ≥ 2.
  - defense: infantry origin 2 → 9; origin 4 → 11.
- `src/main/combatResolution.test.ts`:
  - `testRangedOriginBonusTurnsMissIntoHit`: `originHitBonus: 2`, `rollExactly(11)`. Armor 10 misses 11; with the bonus, 12 hits it. Update the comment.
  - `testMeleeDefenderOriginBonusScoresOnThree`: rename to `testMeleeDefenderOriginBonusRaisesDefense`. Use `originHitBonus: 2` and a roller `() => 8`. Infantry defense 7 misses 8; with the bonus, 9 hits it. Infantry attack 3 misses 8 either way. Update the comment and the `run` call.
  - `testCasualtyOrderIgnoresOriginBonus`: `originHitBonus: 2 as const`.
  - `rollAlwaysMiss = () => 0.999` stays (it becomes face 20).
- `src/main/tacticalBattle/tacticalMeleeApply.test.ts`: replace `rollThree` with a face-8 roller, `() => (8 - 0.5) / COMBAT_DIE_SIDES`, and rename it `rollEight`. Naval 7 misses 8; with the Low terrain bonus, 9 hits it.
- `src/main/tacticalBattle/tacticalStrategicOrderingAlignment.test.ts`: face 1 stays 1. Every face 6 becomes 20. Reword comments, for example `roll 20 misses armor attack 10`. Four tests in this file use raw draws instead of the face helper. They keep the same outcome on a d20, so do not change their values:
  - `[0.15, 0.95]` (urban air strike): 0.15 is face 4, under air attack 10, so the strike still hits. 0.95 is face 20, so urban counter-fire still misses.
  - `[0.99]`: face 20, still a miss.
  - `[0.5]` (infantry ranged shot at infrastructure misses): face 11, above infantry attack 3, so it still misses.
  - `[0.01]`: face 1, still a hit.
- `src/main/tools/combatEstimation.test.ts`:
  - In `testResolveOneMeleeDeterministic`, `rollAlways3` becomes `rollAlways8`, `() => 8` (armor 10 hits, infantry defense 7 misses).
  - In `testExactCombatProbabilities`, write the expectations as fractions so the `1e-12` tolerance stays safe: `probabilityDefenderEliminated` and `defenderLossesExpected` `17 / 40` (0.425); `probabilityAttackerLosesUnit` and `attackerLossesExpected` `1 / 4`; assessment `'even'` (difference 0.175). Role cases: attackers roll attack `1 / 2` / `7 / 20`; attackers roll defense `7 / 20` / `3 / 20`. Change the comment to "1 armor (attack 10, defense 7) melee vs 1 infantry (attack 3, defense 7)" and "armor rolls 10/20 vs infantry 7/20" / "armor rolls 7/20 vs infantry 3/20".
  - Country bonus test: on → `attackValue` 12, `originBonus` 2; High → 14, 4; off → 10. Update its comment ("attack 4 ... attack 5").
  - Melee-at-target test: `attackValue` 12, `originBonus` 2.
  - Leave the Poisson fixture (`1 / 6`, `3 / 6`) unchanged.
- `src/main/tools/combatEstimationTactical.test.ts`: infantry ranged `probabilityDefenderEliminated` `3 / 20` and armor return fire `probabilityAttackerLosesUnit` `1 / 2`. Melee `17 / 40` / `1 / 4`. Terrain bonus defender `defenseValue: 9, originBonus: 2`.
- `src/shared/weatherBonusRules.test.ts`: ranged penalty 3 at Low, 5 at High. Leave movement caps.
- `src/shared/originBonusRules.test.ts`: Low adds 2, High adds 4, cell text `+4 country`. Rename the test titled "a High bonus adds 2 ..." to say "adds 4".
- `src/main/originBonus/originHitBonusLookup.test.ts`: lookups return 2 at Low and 4 at High; the `withOriginHitBonus` fixtures use 2 and 4.
- `src/main/briefingUnitStatusBonus.test.ts`: the helper parameter type `0 | 1 | 2` becomes `OriginHitBonus` (imported as a type), the fixture amounts become 2 and 4, and the expected cells are `| +2 country |` and `| +4 country |`.
- `src/main/tools/assessment.test.ts`: `originBonusAmount` is 2.
- `src/main/openRouter/promptSpec/gameRuleText.test.ts`: every `adds 1` becomes `adds 2` and every `adds 2` (High) becomes `adds 4`, including the tactical terrain line. Every `the most is +1` / `+2` becomes `+2` / `+4`. Weather sentences say `3 lower` (Low) and `5 lower` (High). The assembler check looks for `d20 per shot`.
- `src/main/openRouter/promptHexExclusiveAudit.test.ts`: `infantry: 3 attack / 7 defense`.

If any other test fails, read its intent, recompute with Final Rules, and list the change in the phase report.

### Verify

- `npm test`, `npm run check:circular`.
- `rg -n "\bd6\b" src` returns nothing.
- Manual smoke launch (steps 1–3). Needs human: start a new match, end one turn with an armor unit firing on an adjacent enemy, and confirm resolution completes.

## Phase 3: Terrain Cover Rules and Lookups (Not Wired Yet)

**Goal:** one pure source for cover values, plus lookup builders for the strategic map and battles. Nothing calls them yet, so game behavior is unchanged.

### 3.1 Create `src/shared/terrainCoverRules.ts`

No logger. Imports allowed: `normalizeDbTerrainKindToTacticalCategory` and `TacticalMovementCategory` from `./tacticalTerrainMovement`; `effectiveRes4TerrainKindString` and `TacticalBattleTerrainPick` from `./tacticalTerrainCombatModifiers`. `tacticalTerrainCombatModifiers.ts` must not import this file.

```ts
export type TerrainCover = 0 | 1 | 2;
export type TerrainCoverShooter = 'surface' | 'air';
export type TerrainCoverPair = { readonly surface: TerrainCover; readonly air: TerrainCover };
export type TerrainCoverPlace = {
  readonly terrainKind?: string | null;
  readonly isUrban?: boolean;
  readonly isRubble?: boolean;
};
export const TERRAIN_COVER_BY_CATEGORY: Readonly<Record<TacticalMovementCategory, TerrainCoverPair>>;
export const URBAN_OR_RUBBLE_TERRAIN_COVER: TerrainCoverPair;
export function terrainCoverShooterForUnitType(unitType: string): TerrainCoverShooter;
export function terrainCoverPairFor(place: TerrainCoverPlace): TerrainCoverPair;
export function terrainCoverFor(place: TerrainCoverPlace, shooter: TerrainCoverShooter): TerrainCover;
export function tacticalCellCoverPlace(battle: TacticalBattleTerrainPick, res4H3: string): TerrainCoverPlace;
export function tacticalCellTerrainCover(battle: TacticalBattleTerrainPick, res4H3: string, shooter: TerrainCoverShooter): TerrainCover;
export function terrainCoverSourceLabel(place: TerrainCoverPlace): string | null;
export function formatTerrainCoverTooltipText(pair: TerrainCoverPair): string | null;
```

Behavior:

- `TERRAIN_COVER_BY_CATEGORY`: `forests` 2/1, `mountains` 2/0, `wetlands` 1/0, and `plains`, `desert`, `arctic`, `coastal`, `water` 0/0. Frozen.
- `URBAN_OR_RUBBLE_TERRAIN_COVER`: 2/1. Frozen.
- `terrainCoverShooterForUnitType`: `'air'` for `'air'`, otherwise `'surface'`.
- `terrainCoverPairFor`: category is `normalizeDbTerrainKindToTacticalCategory(place.terrainKind ?? '', 'land')`. When `isUrban` or `isRubble` is true, take the larger value per column from the category pair and the urban/rubble pair. Unknown or empty kinds give 0/0.
- `terrainCoverFor`: `terrainCoverPairFor(place)[shooter]`.
- `tacticalCellCoverPlace`: `{ terrainKind: effectiveRes4TerrainKindString(battle, res4H3), isUrban: battle.res4IsUrbanByH3?.[res4H3] === true, isRubble: battle.res4IsRubbleByH3?.[res4H3] === true }`. `TacticalBattleTerrainPick` already includes both flag maps.
- `tacticalCellTerrainCover`: `terrainCoverFor(tacticalCellCoverPlace(battle, res4H3), shooter)`.
- `terrainCoverSourceLabel`: `'Rubble'` when `isRubble`, else `'Urban'` when `isUrban`, else `'Forest'`, `'Mountain'`, or `'Wetlands'` for those categories, else null. These are the words `orderPreviewSlowTerrainTooltip.ts` already uses, so the swatch helper recognizes them.
- `formatTerrainCoverTooltipText`: `-2 ground and naval fire, -1 air strikes` when both are non-zero; `-2 ground and naval fire` when only surface; `-1 air strikes` when only air; null when both are 0. Use the actual numbers.

### 3.2 Create `src/main/terrainCover/terrainCoverLookup.ts`

Mirror the shape of `src/main/originBonus/originHitBonusLookup.ts`.

```ts
export type TerrainCoverLookup = (targetH3Index: string, shooter: TerrainCoverShooter) => TerrainCover;
export const noTerrainCover: TerrainCoverLookup;
export type StrategicTerrainCoverHex = { readonly h3Index: string; readonly terrainKind?: string | null };
export function createStrategicTerrainCoverLookup(hexes: ReadonlyArray<StrategicTerrainCoverHex>): TerrainCoverLookup;
export function createTacticalTerrainCoverLookup(battle: TacticalBattleTerrainPick): TerrainCoverLookup;
export function withTargetCover<T extends object>(unit: T, cover: TerrainCover): T;
```

- The strategic lookup builds a `Map` from `h3Index` to `terrainKind` once, then returns `terrainCoverFor({ terrainKind: map.get(h3) }, shooter)`. Strategic hexes never pass urban or rubble. A hex missing from the list gets 0. Its input rows match both the `preMoveState.hexes` rows the strategic pipeline already loads and `GameStateSnapshot.hexes`, so neither caller needs a new query.
- The tactical lookup returns `tacticalCellTerrainCover(battle, h3, shooter)`.
- `withTargetCover` returns a shallow copy with `targetCover` set when `cover > 0`. When `cover === 0`, it returns a shallow copy without the key, so deep comparisons of uncovered units don't change. The `targetCover` field is added to `HitThresholdUnit` in Phase 4; tighten the generic to `T extends HitThresholdUnit` then.
- Creators call `logDebug` once, with the hex count or battle id. Returned closures do not log (per-roll hot path).
- No database access in this module.

### 3.3 Tests

- `src/shared/terrainCoverRules.test.ts` (new): forest 2/1, mountain 2/0, wetlands 1/0, plains 0/0; an unknown kind and a missing kind give 0; an urban plains cell 2/1; urban mountain 2/1 (larger per column); air shooter mapping; `formatTerrainCoverTooltipText` for forest, mountain, and plains (null); `terrainCoverSourceLabel` prefers Rubble over Urban over the terrain kind.
- `src/main/terrainCover/terrainCoverLookup.test.ts` (new): the strategic lookup gives 2 for a forest hex against a surface shooter, 1 against air, and 0 for a hex missing from the list; the tactical lookup reads a forest cell and an urban cell from a minimal battle object; `withTargetCover(unit, 0)` has no `targetCover` key.

### Verify

- `npm run clean:dist`, then `npm test`, `npm run check:circular`.
- No existing assertion changes.

## Phase 4: Apply Cover in Combat Resolution

**Goal:** live dice use cover exactly as Final Rules describes.

### 4.1 Threshold and Unit Fields

- `src/main/combatUnitTypes.ts`: add `readonly targetCover?: TerrainCover` with an orienting comment ("Set only on ranged attackers and air strikes on units; return fire, anti-air, and melee rows leave it unset").
- `src/main/combatHitThresholds.ts`: add `readonly targetCover?: TerrainCover` to `HitThresholdUnit`. `attackHitThreshold` becomes `Math.min(MAX_HIT_THRESHOLD, Math.max(MIN_ATTACK_HIT_THRESHOLD, printed - penalty - cover) + origin)`. `defenseHitThreshold` ignores cover. Update the comments.
- Tighten `withTargetCover` in `terrainCoverLookup.ts` to `T extends HitThresholdUnit` (type import only).

### 4.2 Ranged Phase

In `src/main/combatResolution.ts`, add a sixth optional parameter to `runRangedPhase`: `targetCoverAt: TerrainCoverLookup = noTerrainCover`, with an orienting comment (production callers always pass one). Inside the engagement loop, just before `resolveOneRangedEngagement`:

```ts
const coveredAttackers = attackerUnits.map((u) =>
  withTargetCover(u, targetCoverAt(group.defenderHex, terrainCoverShooterForUnitType(u.unitType)))
);
```

Pass `coveredAttackers` as the attackers. Defenders are not covered, so return fire ignores cover. Keep using `attackerUnits` for kill attribution; the ids are the same. `resolveOneRangedEngagement` itself does not change.

### 4.3 Strategic Turn

In `src/main/gameActions/readyStrategicResolutionPipeline.ts`, right after `const originHitBonusAt = ...`, add `const targetCoverAt = createStrategicTerrainCoverLookup(preMoveState.hexes);`. `preMoveState` is already loaded earlier in `executeReadyStrategicTurn` (it selects `terrain_kind AS terrainKind` from `hexes`), and the column doesn't change during a turn, so this adds no query and no RNG draw. Pass the lookup to `resolveAirStrikePhase` and as the last argument of `runRangedPhase`. Melee does not change.

In `src/main/gameActions/airStrikeResolution.ts`:

- `resolveAirStrikePhase` gains a fourth parameter, `targetCoverAt: TerrainCoverLookup`. Update its comment.
- The attack roll adds `targetCover: order.targetType === 'units' ? targetCoverAt(order.targetH3Index, 'air') : 0` to the `attackHitThreshold` input.
- Counter-fire and infrastructure counter-fire do not change.
- `src/main/gameDb.test.ts` (around line 681): pass `noTerrainCover` as the new argument.

### 4.4 Battles

In `src/main/tacticalBattle/tacticalAirStrikeUnits.ts`, add `readonly targetCover: TerrainCover` to `TacticalAirStrikeOnUnitsInput` with a comment, and add it to the attack threshold only. Anti-air rolls do not take it.

In `src/main/tacticalBattle/tacticalStrategicOrderPhases.ts`:

- Air on units: pass `targetCover: tacticalCellTerrainCover(battle, s.targetH3Index, 'air')` into `resolveTacticalAirStrikeAgainstUnitsOnSubUnits`.
- Air on infrastructure: no cover.
- Ranged at units: pass `createTacticalTerrainCoverLookup(workBattle)` as the last argument to `runRangedPhase`. Build it right before that call, from the same `workBattle` the ranged phase reads. An air strike earlier in the same step can turn an urban cell into rubble before the snapshot is refreshed, but urban and rubble give the same cover, so no refresh is needed.
- Ranged at infrastructure only (`rangedOrdersInfraOnly`): no cover.
- Keep the additions to these lines; do not refactor the file.

### 4.5 Tests

- `src/main/combatHitThresholds.test.ts`: armor with cover 2 → 8; armor with weather 5 and cover 2 → 3; infantry with cover 2 and origin 2 → 4 (floor 2, then +2); defense ignores cover.
- `src/main/combatResolution.test.ts`: add `testRangedTargetCoverAppliesToAttackersOnly`, using the adjacent-hex setup from `testRangedAdjacentReturnFireEmitsShotLinesIncludingMisses`. Use armor against armor, a cover lookup that returns 2 for both hexes, and `rollExactly(9)`. The attacker's 8 misses, and the defender's return fire at 10 hits, so only the attacker is removed. Register it in `run`.
- `src/main/tacticalBattle/tacticalStrategicOrderingAlignment.test.ts`: add one test based on "tactical infantry in the target hex can AA a striking air sub-unit", with only one air sub-unit. Set the target cell's kind in the fixture's `res4TerrainKindByH3`. With the target cell set to `forest` and faces `[10, 20]`, the strike misses (10 > 9) and anti-air misses: no kills. With the target cell set to `plains` and faces `[10]`, the strike hits, the sole defender is removed, and no anti-air roll is drawn.

### Verify

- `npm run clean:dist`, then `npm test`, `npm run check:circular`.
- Manual smoke launch. Needs human: play a turn where armor fires at an enemy in a forest-dominant hex, and confirm resolution completes. Look for the `terrainCoverLookup createStrategicTerrainCoverLookup` debug line in the log.

## Phase 5: Combat Estimate and AI Prompt Text

**Goal:** `estimate_combat` and the commander prompt describe exactly what the dice do.

### 5.1 Estimate Theaters

In `src/main/tools/combatEstimationTheater.ts`, add to `CombatEstimationTheater`:

```ts
targetCoverFor(unit: CombatUnit, targetH3: string, engagement: CombatEstimationEngagementType): TerrainCover;
```

- It returns 0 for melee in both theaters.
- Strategic: build `createStrategicTerrainCoverLookup(state.hexes)` once, when the theater is built, then use `lookup(targetH3, terrainCoverShooterForUnitType(unit.unitType))`. If the AI's snapshot masks terrain on unexplored hexes, cover reads 0 there. That is expected, because the estimate only uses what that player can know.
- Battle: `tacticalCellTerrainCover(battle, targetH3, 'surface')`. Battle estimates already reject air attackers.

In `src/main/tools/combatEstimationSides.ts`, stamp `withTargetCover(u, ctx.theater.targetCoverFor(u, ctx.targetHexH3, ctx.engagementType))` in `buildRealAttackers` (after the weather stamp) and on assumed attackers in `buildAttackers`. Do not stamp defenders or return-fire rows. `attackValue` in the summary already reads `attackHitThreshold`, so it includes cover.

### 5.2 Prompt Rules

In `src/main/openRouter/promptSpec/gameRuleText.ts`:

- Rename the private `formatWeatherList` to `formatOrList(items: readonly string[])` and use it for both weather and cover lists. `WeatherState` values are strings, so existing calls compile unchanged.
- `buildCombatStatsLine` returns exactly: `Combat: d20 per shot — an attack hits on a roll at or below its attack value and a defensive melee roll hits at or below its defense value, after the changes below. Penalties and cover never lower an attack value below 2 before bonuses, and no value exceeds 17. ${summary}.` The `summary` part is unchanged.
- Add `export function buildTerrainCoverRule(mode: PromptCoordinateMode): string`. Build the terrain lists from `TERRAIN_COVER_BY_CATEGORY` and `URBAN_OR_RUBBLE_TERRAIN_COVER`, grouping kinds by value and naming them `forest`, `mountain`, `wetlands`, `urban`, `rubble` (urban and rubble only in battle mode). For today's table the output must be exactly:
  - Strategic: `Terrain cover: ranged fire at a hex whose main terrain is forest or mountain needs a roll 2 lower, or 1 lower for wetlands. An air strike on units in a hex whose main terrain is forest needs a roll 1 lower. Melee, return fire, anti-air fire, and strikes on infrastructure ignore cover.`
  - Battle: `Terrain cover: ranged fire at a forest, mountain, urban, or rubble cell needs a roll 2 lower, or 1 lower for wetlands. An air strike on units in a forest, urban, or rubble cell needs a roll 1 lower. Melee, return fire, anti-air fire, and shots at infrastructure ignore cover.`
- In `buildCombatRulesParagraph`, insert `buildTerrainCoverRule(gates.coordinateMode)` right after the weather rule (and before `buildResolutionOrderRule`). It is always included.
- `logTrace` in the new builder, matching its neighbors.

### 5.3 Tests

- `src/main/tools/combatEstimation.test.ts`: add a strategic ranged test. Armor fires at infantry in a `forest` hex: `attackValue` 8. The same at a `plains` hex: 10. Register it in the run function.
- `src/main/tools/combatEstimationTactical.test.ts`: add a battle ranged test with `terrainByCell: { far: 'forest' }`. Infantry at `near` fires at armor at `far`: `probabilityDefenderEliminated` is 0.10 (3 − 2 = 1, floor 2), and armor return fire stays 0.5.
- `src/main/openRouter/promptSpec/gameRuleText.test.ts`: pin both cover sentences exactly. Assert that the paragraph contains the cover sentence after the weather sentence when weather is on, and that the cover sentence is present when every bonus is off. Update the stats-line assertions to the new wording.

### Verify

- `npm test`, `npm run check:circular`.
- Needs human: with debug prompt capture on, play one turn against the AI and confirm `debug-last-strategic-prompt.txt` shows the d20 stats line and the strategic cover sentence.

## Phase 6: Tooltips

**Goal:** the player can see cover on a hovered hex or cell, and when aiming a shot at covered units.

### 6.1 Hex Tooltip

In `src/renderer/map/terrainTooltipHtml.ts`, add a `coverLine(state, namingTarget)` helper with an orienting comment, and push `<strong>Cover:</strong> ${text}` right after the Effects line and before Production when it returns text.

- World hex (resolution 1): use `S.gameState?.hexes.find((h) => h.h3Index === namingTarget.h3Index)?.terrainKind`, the same column the engine reads. Do not use `state.terrainKind` or the renderer's recounted terrain summary. No urban or rubble. When the snapshot has no kind for the hex (missing or masked), there is no line.
- Detail cell (resolution 4, in a battle or zoomed in): `terrainCoverPairFor({ terrainKind: state.terrainKind, isUrban: state.isUrban, isRubble: state.isRubble })`. These are the same fields the Effects line beside it uses.
- Text comes from `formatTerrainCoverTooltipText`. Omit the line when it returns null or when `namingTarget` is null.
- Add the cover text (or `''`) to `terrainTooltipContentKey`, the same way `weatherKey` is added. The world-hex value doesn't come from `state`, so without this key a cached tooltip could show a stale line.

### 6.2 Effects Tooltip While Aiming

In `src/shared/orderPreviewEffectsTooltip.ts`:

- Add `readonly targetCover?: TerrainCoverPlace | null` to `OrderPreviewEffectsTooltipInput`, with a comment: it is set only when the hovered target holds a visible enemy unit.
- `rangedHtml`: when `targetCover` is set, at least one selected unit is not air, and `terrainCoverFor(targetCover, 'surface') > 0`, append a line `<strong>Cover:</strong> ${labelHtml(terrainCoverSourceLabel(targetCover))}`. Join it to the Effects line with `TOOLTIP_SECTION_GAP_HTML`. Return null only when both lines are empty.
- `airStrikeHtml`: the same, with shooter `'air'`.
- Update the module and function comments.

In `src/renderer/gameplay/orderPreviewEffectsContext.ts`, set `targetCover` for `ranged` and `airStrike` kinds only, and only when the hovered target holds an enemy unit the player can see:

- Battle: a sub-unit with `player !== 'human'` on `preview.hoveredH3Index` → `tacticalCellCoverPlace(battle, hovered)`. This is the engine's own cover source.
- Strategic: a unit with `player !== 'human'` in `S.gameState.units` on the hovered hex → `{ terrainKind }` from `S.gameState.hexes` for that hex. The main process already removes enemy units the player can't see from this list, so the tooltip never reveals hidden units.
- Otherwise null.
- The formatter only adds the line when cover is above 0, so `terrainCoverSourceLabel` is never null there. Still guard against null rather than using a non-null assertion.

### 6.3 Tests

`src/main/orderPreviewEffectsTooltip.test.ts`: a legal ranged hover with forest `targetCover` shows a Cover line naming Forest; a legal air-strike hover with mountain `targetCover` shows no Cover line (mountain is 0 against air); a hover with `targetCover: null` returns the same HTML as before. The renderer has no runtime unit tests; rely on typecheck and manual checks.

### Verify

- `npm test`, `npm run check:circular`, `npm run build:renderer`, `npm run check:renderer-types`.
- Needs human: hover a forest-dominant world hex (Cover line shows `-2 ground and naval fire, -1 air strikes`); hover a plains hex (no Cover line); in a battle, hover an urban cell; select armor, aim at an enemy in forest, and confirm the effects tooltip shows `Cover: Forest`.

## Phase 7: Living Documentation

**Goal:** every living doc states the d20 rules. Numbers must match Final Rules. Do not edit `doc/devleopment-plan-v3.3.md`; it is a historical plan.

- `doc/combat-rules-v3.md`:
  - Header: version 3.2, October 2026, aligned to the current engine version in `package.json`.
  - §1 Design principles: one d20 per unit; the hit number formula; floor 2 and cap 17.
  - §2 roster table: new attack and defense values.
  - §3.1–§3.4: new values. §3.5: replace "Strategic terrain combat modifiers: None" with a pointer to the new cover rules. Keep "not blocked by terrain or intervening units" for line of sight.
  - §4.8: rename "d6" wording.
  - §4.9: die and hit rules; the origin table (+2 / +4) and its "highest threshold" sentences (14 attack, 11 defense); the weather table rows for attack (−3 / −5), with the worked example rewritten as `max(2, 10 − 5) + 4 = 9`; a new "Terrain cover" subsection with the cover table, what it applies to and what it doesn't, the strategic dominant-kind source, the battle per-cell source (including the inherited hex kind), and the rule that every unit in the target hex or cell shares its cover, fleets in a coastal hex included.
  - §5 flow: air hit "roll ≤ 10 minus cover", counter-fire, and a cover note in the ranged step.
  - §6: the line-of-sight bullet stays; add one bullet saying cover lowers hit numbers but never blocks a shot.
  - §8.1, §8.3, §8.5: hit numbers and percentages (air 10 = 50%; urban and seaport counter-fire ≤ 3 = 15%; airport ≤ 7 = 35%).
  - §10: change "Strategic terrain modifiers: Not implemented" to say strategic cover is live and strategic movement modifiers are not.
  - §11 summary and §12.5: d20 wording, amounts, and cover.
  - Add the reference-odds table from this plan as a short appendix or under §4.9.
- `doc/README.md`: in the "When you change one of these" table, add rows for die size, hit-number limits, and infrastructure counter-fire (`src/main/combatDice.ts`), and for terrain cover (`src/shared/terrainCoverRules.ts`).
- `doc/ai-tools.md`: `estimate_combat` is a Poisson-binomial over d20 rolls; ranged `attackValue` includes target cover; origin `originBonus` is 2 or 4.
- `doc/ai-commander-prompts/strategic-prompt.md` §1.5: clause 1 says d20 and the floor and cap; clause 4 says 2 (Low) or 4 (High); clause 5 says 3 lower at Low and 5 at High; insert a terrain cover clause after clause 5 and renumber the clauses after it. Then search the doc for "clause" references and fix their numbers. §1.6 Unit Status: `+2 country` / `+4 country`.
- `doc/ai-commander-prompts/tactical-prompt.md` §2.5: origin and weather amounts; add a terrain cover row (battle wording). §2.6: bonus examples.
- `doc/ai-commander-prompts/source-inventory.md`: the literal stats string and the `buildCombatRulesParagraph` clause order, including `buildTerrainCoverRule` after the weather rule.
- `doc/ai-commander-prompts/information-decision-model.md`: `COMBAT_STATS` says d20; `ORIGIN_BONUS` says 2 or 4; add a `TERRAIN_COVER` row (both modes, always included, source `TERRAIN_COVER_BY_CATEGORY` and `buildTerrainCoverRule`).
- `doc/ai-commander-prompts/crosswalk.md`: add a `TERRAIN_COVER` row next to `ORIGIN_BONUS`.
- `doc/ai-commander-prompts/variants.md`: the High origin amounts (`adds 4`, `+4`); weather High amounts.
- `doc/ux/hex-tooltips.md`: add the Cover line to the hex tooltip contents (world hex, zoomed cell, battle cell) and the Cover line to the effects tooltip; update the comparison table rows; add `src/shared/terrainCoverRules.ts` to Code Entry Points.

### Verify

- `rg -n "\bd6\b" doc` returns only `doc/devleopment-plan-v3.3.md`.
- `rg -n "adds 1|\+1 \(Low\)|1 at Low, 2 at High|roll ≤ 3|≤ 1 \(17%\)|≤ 2 \(33%\)" doc` returns only the historical plan. Lines about movement budgets that legitimately say "2 at Low, 1 at High" stay.
- Read §4.9 once end to end and check every number against Final Rules.

## Phase 8: Final Gate and Report

1. `npm run clean:dist`, `npm test`, `npm run check:circular`, `npm run build:renderer`, `npm run check:renderer-types`. All must pass.
2. Record the final line counts for the files from Phase 0 and the new files. No new file may exceed 600 lines.
3. Spot-check three rows of the Reference Odds table against `attackHitThreshold` by reading the Phase 4 threshold tests.
4. Final smoke launch (steps 1–3).
5. Report: what changed per phase, any test that changed beyond what this plan listed and why, and the consolidated "Not verified (needs human)" list.

## Out of Scope

- Cover from urban areas on the strategic map.
- Redesigning melee (for example, both sides rolling attack with defense as cover).
- Cover fields on `assess_unit` or `assess_hex`, and cover in Best Options rows.
- A per-match dice setting or a new-game cover option.
- Splitting `combatResolution.ts` or `tacticalStrategicOrderPhases.ts`.
- Editing `doc/devleopment-plan-v3.3.md`.
