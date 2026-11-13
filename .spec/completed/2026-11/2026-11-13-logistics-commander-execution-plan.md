# Logistics Commander: Execution Plan

This plan covers what the commander is told about missiles, naval units, mercenaries, and production. Sealift, airlift, and posture are in the six `2026-11-13-operations-*-execution-plan.md` plans, which run after this one in the order their names give. Finish this plan first; the first of those plans uses the `countNeighborTerrain` helper added in Phase 4 here.

## Why This Change

A 250-turn AI-only match on the global map (no fog of war, no tactical battles, balanced doctrine) showed heavy ground and air construction and fighting, and almost none of the following: missile construction and launches, naval construction, mercenary hires, and mercenary hires in remote hexes.

Agent Wars is a logistics game anchored in production capacity. The winner is the side that:

1. Creates and delivers the necessary force where it is needed, when it is needed.
2. Best prevents its enemies from doing the same, chiefly by hindering production and movement.

Neither goal is in the commander prompt. No match log was available, so every cause below is a reading of the builders, not an observation of the run. The verification run in Phase 9 is the observation.

| Cause | Where |
|-------|-------|
| The strategic goals no longer name production denial. Only the aggressive doctrine says to strike cities, airports, and seaports. | `buildStrategicGoalsBlock` in `src/main/openRouter/promptSpec/coachingTextStrategic.ts`; `buildDoctrineBlock` in `promptSpec/doctrineText.ts` |
| The missile rule prints only when the seat owns a missile. A seat without one sees a cost and a cap. | `buildMissileEmploymentRule` in `promptSpec/gameRuleMissileText.ts` |
| The naval rule prints only when the seat owns a naval unit. | `buildRulesSections` in `promptSpec/gameRuleText.ts` |
| Production coaching is "queue something". Nothing says what a type is for or which city should build it. | `PRODUCTION_BULLET` in `coachingTextStrategic.ts`; `formatProductionAttentionBullet` in `productionAttention.ts` |
| Credits are coached only when every unit type is at cap, so the treasury stays at 0. | `PRODUCTION_CAP_QUEUE_GUIDANCE` in `src/main/productionCaps.ts` |
| With 0 credits, no mercenaries, and no rehire candidate, the Mercenaries section is one line. The raise rule and Raise Options never print. | `buildMercenariesBriefingBlock` in `src/main/openRouter/briefingSectionsMercenaries.ts` |
| An owned missile gets a target table and no attention flag and no coaching bullet. | `briefingSectionsMissiles.ts`; `buildStrategicCoachingSections` |

## Requirements

| Id | Requirement |
|----|-------------|
| R1 | The strategic goals state both logistics goals. |
| R2 | Strategic Context carries a "Your tools" block. Each line ties one capability to a goal and prints only when its gate holds. |
| R3 | Every doctrine carries a production-denial line. |
| R4 | The naval rule and a missile rule print when the seat owns the type or can build it. The missile launch instruction and the `missileLaunches` envelope field still require an owned missile. |
| R5 | The full Mercenaries section prints whenever production is enabled and at least one raise option or rehire candidate exists, including at 0 credits. |
| R6 | Raise Options carries the distance to the campaign target, the count of enemy units nearby, and whether the hex is a chokepoint. |
| R7 | Production Status carries a Production Priorities subsection. It names one city and a reason for a missile, for a naval unit, and for credits, each only when its condition holds. |
| R8 | The production coaching tells the commander to keep one city on credits and to queue what Production Priorities names. |
| R9 | A seat with a missile that has a listed target gets an attention flag and a coaching bullet to launch it. |
| R10 | An attention flag fires when the treasury can pay for a raise and three turns of upkeep. It prefers a hex outside the seat's own home region. |
| R11 | Every number that is a count of cities or credits scales with game size through `GAME_SIZE_MULTIPLIER`. |
| R12 | The tactical prompt is unchanged, character for character. |
| R13 | Living docs in `doc/ai-commander-prompts/` match the builders in the same change. |

## Decisions Already Made

Do not reopen these.

- The engine may name a city and a reason for a build. The commander may ignore it. The user confirmed this.
- Capability text is gated on "owns or can build". The gate reads controlled hexes, their urban, seaport, and airport counts, and the unit caps. It does not read the production queue snapshot.
- The `missileLaunches` field, its example, and the JSON schema stay gated on an owned missile.
- There is no missile row in Best Options. The Missile Forces table is the source the commander copies from. This keeps `possibleUnitActions.ts` and `possibleUnitActionsTableAssembly.ts` out of this plan; both are already over 600 lines.
- New attention bullets use the append path that the production bullet uses. They do not go through `buildAttentionFlags`, which keeps at most five flags.
- No unit cap, cost, range, or hire rule changes.
- New code goes in new files where a target file is over 600 lines. `briefingFormatter.ts` is 944 lines. A new field needs an orienting block, so it may grow past 950 lines. It must stay under 1000. The only addition is the optional `additionalAttention` field and a `reduce` around the existing attention-bullet nest. `consultPromptParts.ts` is 560 lines and must stay under 600.
- The Naval priority line stops once the seat has half its naval cap. Operations and fire support need ships; a full cap of them is not the goal.
- The credits city is the smallest controlled city with at least `12 × GAME_SIZE_MULTIPLIER` urban cells. Twelve credits per turn sustains about four infantry mercenaries on the Small size.
- Production-denial doctrine is strategic only. `buildDoctrineBlock` is shared with the tactical prompt. Do not change its strings. Add `buildStrategicDoctrineBlock` and call it only from `buildStrategicContextCoaching`.
- A raise is affordable when `credits >= fee + MERCENARY_UPKEEP_RESERVE_TURNS * option.upkeep`. Current roster upkeep is not part of the check. `credits` already excludes pending hire fees.
- The enemy-units column excludes Neutral units (`NEUTRAL_OWNER_ID`). A unit on the raise hex already blocks the raise.
- Wording in this plan is final. If a test or a doc contract forces a different wording, stop and report. Do not edit files under `.spec/completed/` or `doc/ai-commander-prompts/example-tactical-prompt.md`.

## Constants

| Name | File | Value | Status |
|------|------|-------|--------|
| `NAVAL_PRIORITY_CAP_SHARE` | `src/main/openRouter/productionPriorities.ts` | 0.5 | new |
| `CREDITS_CITY_MIN_URBAN_PER_SIZE` | `src/main/openRouter/productionPriorities.ts` | 12 | new |
| `CREDITS_TREASURY_CEILING_TURNS` | `src/main/openRouter/productionPriorities.ts` | 10 | new |
| `MERCENARY_UPKEEP_RESERVE_TURNS` | `src/main/openRouter/mercenaryRaiseAttention.ts` | 3 | new |
| `RAISE_OPTIONS_ENEMY_RADIUS` | `src/main/openRouter/briefingSectionsMercenaries.ts` | 2 | new |
| `CHOKEPOINT_MAX_PASSABLE_NEIGHBORS` | `src/main/tools/hexNeighborTerrain.ts` | 3 | new, replaces the literal `3` in `assessment.ts` |
| `GAME_SIZE_MULTIPLIER` | `src/shared/gameSize.ts` | 1, 2, 3 | existing |

## Rules for the Implementing Agent

Read these before Phase 1. They apply to every phase.

- Never commit or push.
- Source files under `src/` use CRLF line endings. Keep CRLF when you edit them. `.spec` files may stay LF.
- Do not put plan words in code, comments, test names, or docs: no "Phase", "Step", "R1", and so on. Those labels exist only in this file.
- Every new or changed function, constant, and interface field needs an orienting comment block with at least 5 non-empty lines: a summary line, then `Purpose:` (or `Contract:` on interface fields), `When to use:`, `Expected outcome:`, `Exceptions:`. Copy the style of the neighbouring comments. ESLint rule `orienting-comments/require-orienting-block` enforces this.
- Logging: every new exported function logs its call. Use `logDebug` when it changes state or makes a per-turn or per-consult decision, `logTrace` when it only reads and returns, and `logError` for every caught exception. Use the existing `../logger` import of each file.
- Documentation follows `AGENTS.md`. In the documentation phase, also read `doc/README.md`: add every new exported constant this plan introduces to the engine-constants section there, beside the campaign constants, naming its file. Search `doc/` for any sentence the change makes wrong. End your final summary with the list of documents you updated.
- Mark every new binding `const` and every new interface field `readonly`.
- No function takes more than 6 named arguments. Use one `args` object where more are needed, as the neighbouring builders do.
- Tests cover happy paths and essential failure cases only. Never delete a content assertion. When wording changes, change the expected string. Never replace an assertion with `assert.ok(true)`.
- PowerShell does not support `&&`. Chain commands with `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`.
- If a database test fails with a `NODE_MODULE_VERSION` error, run `npm run rebuild:native:node` once, then rerun it.
- When a step says "replace", replace exactly the quoted text. If the quoted text is not found, stop and report. Do not guess.
- When a step says "read first", open the named function before editing. If it does not do what this plan says it does, stop and report.
- Numbers in prompt text come from the named helper or constant. Never type a literal that a helper already returns.
- A new file under `src/main/openRouter/` is named in camelCase and has a matching `.test.ts` when this plan lists tests for it.

## Phase 1: Capability Gates

Goal: the prompt assembler knows whether the seat can build a naval unit or a missile, and whether it can hire. Nothing prints differently yet.

### Step 1: New file `src/main/openRouter/seatBuildCapabilities.ts`

- [ ] Create the file with one exported interface and one exported function:

```ts
export interface SeatBuildCapabilities {
  readonly canBuildNaval: boolean;
  readonly canBuildMissile: boolean;
}

export function seatBuildCapabilities(state: GameStateSnapshot, ownSeat: string): SeatBuildCapabilities
```

- [ ] Rules for the function:
  - Build `infraByH3` from `state.strategicInfrastructure ?? []`.
  - A controlled hex is a row of `state.strategicControl ?? []` whose `controllerPlayerId === ownSeat`. Skip a hex for which `isNeutralBorderHex(h3Index)` is true (`src/shared/h3Resolutions.ts`).
  - `maxed = new Set(getMaxedUnitTypesForPlayer(state.units, ownSeat, parseGameSize(state.gameSize)))` from `src/main/productionCaps.ts`.
  - For each controlled hex call `getAvailableBuildUnitTypes(urbanHexCount, seaportCount, airportCount)` from `src/main/productionRules.ts`.
  - A controlled hex with no infrastructure row counts as urban 0, seaports 0, and airports 0.
  - `canBuildNaval` is true when `maxed` lacks `'naval'` and at least one hex's list includes `'naval'`. `canBuildMissile` is the same for `'missile'`.
  - This function only reads. Log with `logTrace('seatBuildCapabilities', { ownSeat, canBuildNaval, canBuildMissile })`.

### Step 2: Tests in `src/main/openRouter/seatBuildCapabilities.test.ts`

Copy the snapshot-building helpers from `briefingSectionsMissiles.test.ts`. Read it first.

- [ ] A seat controlling one hex whose urban count is `Math.max(buildMinimumUrbanCells('missile'), buildMinimumUrbanCells('naval'))` and whose seaport count is 1 returns both true. On the global map those minimums are 21 and 10.
- [ ] The same seat with naval units equal to `getMaxUnitsPerType(parseGameSize('small')).naval` returns `canBuildNaval: false`, `canBuildMissile: true`. That cap is 8 on the Small table.
- [ ] A seat whose only hex has that same urban count and seaports 0 returns `canBuildNaval: false`.
- [ ] A hex controlled by another seat does not count.
- [ ] A controlled hex with no infrastructure row does not make either flag true.

### Step 3: New gate fields

- [ ] In `src/main/openRouter/promptSpec/coachingGates.ts`, add to `CoachingGates` (all optional, all `readonly`): `hasMissileUnits?: boolean`, `canBuildNaval?: boolean`, `canBuildMissile?: boolean`, `mercenariesAvailable?: boolean`.
- [ ] In `src/main/openRouter/promptSpec/gameRuleText.ts`, add to `GameRuleTextGates`: `readonly canBuildNaval?: boolean;` and `readonly canBuildMissile?: boolean;`.
- [ ] In `src/main/openRouter/promptSpec/gameRuleSituationGates.ts`, add the same two optional fields to `CombatRuleGateInput`, and copy them into the `gates` object in `combatRuleGatesForPrompt` (`canBuildNaval: input.canBuildNaval === true`, same for missile).

### Step 4: Compute the gates in `src/main/openRouter/consultPromptParts.ts`

Read `buildConsultPromptParts` first.

- [ ] Directly after the line `const hasMissile = opponentUnits.some((u) => isMissileUnitType(u.unitType));` add:

```ts
  const strategicProduction = flags.productionEnabled && coordinateContext.mode !== 'tactical';
  const capabilities = strategicProduction
    ? seatBuildCapabilities(state, ownSeat)
    : { canBuildNaval: false, canBuildMissile: false };
```

- [ ] In the `coachingGates` literal add: `hasMissileUnits: hasMissile && coordinateContext.mode !== 'tactical'`, `canBuildNaval: capabilities.canBuildNaval`, `canBuildMissile: capabilities.canBuildMissile`, `mercenariesAvailable: strategicProduction && state.mercenaryEconomy != null`.
- [ ] In the `combatRuleGatesForPrompt({ ... })` call add `canBuildNaval: capabilities.canBuildNaval` and `canBuildMissile: capabilities.canBuildMissile`.

### Phase 1 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/seatBuildCapabilities.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptContracts.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/variantConformance.test.js`
- [ ] `consultPromptParts.ts` is still under 600 lines.
- [ ] Every existing test still passes with no assertion change. If one needs a change in this phase, stop and report. New gate fields stay optional so existing gate literals still typecheck.

## Phase 2: Goals, Tools, and Doctrine

Goal: R1, R2, R3. All edits are in `promptSpec/coachingTextStrategic.ts` and `promptSpec/doctrineText.ts`.

### Step 1: Goals

- [ ] In `buildStrategicGoalsBlock`, replace the whole first template (the `includeScenarioWinPaths` branch) with:

```text
- Your goals are, in priority order:
    (1) Take and hold enemy cities. Taking cities is how you knock sides out.
    (2) Bring more force to each fight than the enemy can. Mass your ground units before an attack, and use ships, aircraft, and mercenaries to put units where the enemy is weak.
    (3) Stop the enemy doing the same. Destroy the city cells, airports, and seaports that build and move its units.
    (4) Keep enough units at home to stop a raid on your cities.
    (5) Keep every city building, and keep credits coming in for mercenaries.
    (6) Scout with a few units, not your main force.
```

- [ ] Replace the second template (the other branch) with:

```text
- Your goals are, in priority order:
    (1) Destroy enemy forces where you outnumber them.
    (2) Mass your ground units before each attack. Units that arrive one at a time are destroyed one at a time.
    (3) Destroy the city cells, airports, and seaports that build and move enemy units.
    (4) Keep every city building.
```

Keep the four-space indent of the numbered lines exactly as the existing templates have it.

### Step 2: Tools block

- [ ] Add a function `buildStrategicToolsBlock(gates: CoachingGates): string` in `coachingTextStrategic.ts`. It builds a list of lines, keeps those whose gate is true, numbers the kept lines from 1, and returns the block. It returns `''` when no line is kept. It only reads. Log with `logTrace`.

| Line text | Gate |
|-----------|------|
| `Missiles destroy city cells, airports, and seaports up to ${missileRangeHexes()} hexes away, beyond the reach of aircraft. Build one in a city that reaches a large enemy city, then launch it.` | `gates.hasMissileUnits === true \|\| gates.canBuildMissile === true` |
| `Naval units shell any hex within ${getRange('naval')} of them, and carry ground units to a coast the enemy has left open.` | `gates.hasNavalUnits \|\| gates.canBuildNaval === true` |
| `Air units strike within ${AIR_STRIKE_RANGE_HEXES} hexes of their airport, carry one infantry unit between airports, and drop it within ${AIR_STRIKE_RANGE_HEXES} hexes.` | `gates.hasAirUnits` |
| `Mercenaries are raised for credits in any explored city outside an enemy home region that holds no enemy unit. They do not count toward unit caps. Raise them beside ${objective}, or behind the enemy to split its force.` | `gates.mercenariesAvailable === true` |

  - `objective` is `'the campaign target'` when `gates.campaignEnabled === true`, otherwise `'your objective'`.
  - Imports: `missileRangeHexes` from `../../../shared/gameRules`, `getRange` from `../../combatConstants`, `AIR_STRIKE_RANGE_HEXES` from `../../../shared/tacticalRanges`.
  - Output shape, for two kept lines:

```text
- Your tools are:
    (1) <first kept line>
    (2) <second kept line>
```

- [ ] In `buildStrategicContextCoaching`, add `const tools = buildStrategicToolsBlock(gates);` and `const toolsLine = tools.length > 0 ? `\n${tools}` : '';`. Then replace

```ts
${buildStrategyBlock('strategic')}${doctrineLine}
```

with

```ts
${buildStrategyBlock('strategic')}${toolsLine}${doctrineLine}
```

- [ ] Do not touch `buildTacticalContextCoaching`.

### Step 3: Doctrine

Do not change the strings inside `buildDoctrineBlock`. It is shared with the tactical prompt.

- [ ] Add `buildStrategicDoctrineBlock(doctrine, campaignEnabled)` in `doctrineText.ts`. It returns `buildDoctrineBlock(doctrine, campaignEnabled)`, then appends one line for balanced and one for cautious. Aggressive returns the existing block unchanged.
  - Balanced appends `\n    (3) Strike the cities, airports, and seaports your ground units cannot reach. Production the enemy loses is force it cannot bring.`
  - Cautious appends `\n    (4) Strike enemy cities, airports, and seaports from range before you commit ground units.`
- [ ] In `buildStrategicContextCoaching`, call `buildStrategicDoctrineBlock` instead of `buildDoctrineBlock`. Do not change `buildTacticalContextCoaching`.
- [ ] Update the comments on `buildStrategicGoalsBlock` and on `includeScenarioWinPaths` in `coachingGates.ts`. The scenario list is six goals. The other branch is four. The home-region goals are (5) and (6).

### Step 4: Tests

- [ ] `promptSpec/coachingText.test.ts`: update the expected goal strings. Both branches contain `Destroy the city cells, airports, and seaports`. Add: a strategic context with `hasAirUnits: true` and every other tools gate false prints `Your tools are:` and exactly one numbered tool line, numbered `(1)`. Add: with every tools gate false the text does not contain `Your tools are:`. Add: `buildContextCoaching` for tactical gates with every new gate set true does not contain `Your tools are:` and does not contain `Production the enemy loses` or `before you commit ground units`.
- [ ] `promptSpec/doctrineText.test.ts`: leave the existing `buildDoctrineBlock` assertions unchanged. Add: `buildStrategicDoctrineBlock` for balanced contains `Production the enemy loses`, for cautious contains `before you commit ground units`, and for aggressive equals `buildDoctrineBlock`.
- [ ] `src/main/openRouter/openRouterMatrix.test.ts` asserts the old goal sentences exactly, including `(4) Keep every city building. At your unit caps, bank credits and hire mercenaries.` Update those strings.
- [ ] Run `rg -n "Take and hold enemy cities|Keep every city building|Mass your ground units|Your doctrine is balanced|Your doctrine is cautious" src --glob "*.test.ts"` and update every other hit. Do not edit files under `.spec/completed/`.

### Phase 2 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/coachingText.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/doctrineText.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptContracts.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/openRouterMatrix.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/variantConformance.test.js`

## Phase 3: Naval and Missile Rules Before Ownership

Goal: R4.

### Step 1: Naval rule in `promptSpec/gameRuleText.ts`

- [ ] In `buildRulesSections`, replace `const naval = gates.hasNavalUnits` with `const naval = gates.hasNavalUnits || (gates.coordinateMode !== 'tactical' && gates.canBuildNaval === true)`. Leave the two array elements as they are. `buildNavalClause` says "Naval units fire...", so it is safe before the seat owns a ship. `navalPlanRouteHint` is already empty for a seat with no naval unit. Tactical mode still prints the naval subsection only when `hasNavalUnits` is true.
- [ ] Do not change the naval coaching bullets (`NAVAL_ROUTING_BULLET`, `SEALIFT_BULLET`), the Transport guide line, or `buildSealiftBriefingBlock`. They name a section that prints only for an owned naval unit.

### Step 2: Missile rule in `promptSpec/gameRuleMissileText.ts`

- [ ] Replace the body of `buildMissileEmploymentRule` so that it returns, in this order:
  1. `''` when `gates.hasMissileUnits !== true && gates.canBuildMissile !== true`.
  2. `'Missile sub-units never move or fire.'` when `gates.coordinateMode === 'tactical'` and `gates.hasMissileUnits === true`. Return `''` in tactical mode otherwise.
  3. Today's strategic sentence, unchanged, when `gates.hasMissileUnits === true`.
  4. Otherwise this text:

```text
A missile is built in a city with at least ${buildMinimumUrbanCells('missile')} urban cells. It never moves and is spent when it launches. It reaches any explored hex within ${missileRangeHexes()} hexes of the hex where it was built. A launch always hits: each city, airport, and seaport cell in the target hex is destroyed when its own d20 roll is at or below the air unit's attack of ${getAttack('air')}, and every air unit based there is destroyed when an airport cell is destroyed. Other units in the hex are unharmed.
```

  - Import `buildMinimumUrbanCells` from `../../../shared/gameRules`.
- [ ] Keep the `logTrace` call and add `canBuildMissile` to its payload.

### Step 3: Tests in `promptSpec/gameRuleText.test.ts`

- [ ] Strategic gates with `hasNavalUnits: false, canBuildNaval: true` include the Naval Units subsection.
- [ ] Strategic gates with `hasMissileUnits: false, canBuildMissile: true` include the Missiles subsection, and its text contains `is built in a city` and does not contain `missileLaunches`.
- [ ] Strategic gates with `hasMissileUnits: true` produce today's sentence.
- [ ] Tactical gates with `canBuildNaval: true, canBuildMissile: true, hasNavalUnits: false, hasMissileUnits: false` produce the same text as the same gates with both new fields false.

### Phase 3 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/gameRuleText.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptContracts.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptCacheBreakpoint.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/systemPromptStability.test.js`
- [ ] `systemPromptStability.test.ts` must still pass: static system text stays identical when a unit moves and explored hexes are cleared. If it fails for another reason, stop and report.

## Phase 4: Mercenaries Section

Goal: R5, R6.

### Step 1: Shared neighbour helper, new file `src/main/tools/hexNeighborTerrain.ts`

Read `executeAssessHex` in `src/main/tools/assessment.ts` first. It counts adjacent land, adjacent water, and passable neighbours in one loop over `gridDisk(hexH3, 1)`.

- [ ] Copy the loop exactly. Skip `ring[0]`, the center hex (`for (let i = 1; i < ring.length; i++)`). A neighbor of terrain `land` increments `adjacentLand`. `water` increments `adjacentWater`. `coastal` and `wetlands` increment both. Then increment `passableNeighbors` when `terrainIsPassableForDomain(t, passableFor)`.
- [ ] Move that loop into an exported function:

```ts
export function countNeighborTerrain(args: {
  readonly hexH3: string;
  readonly hexSet: ReadonlySet<string>;
  readonly terrainByH3: ReadonlyMap<string, string>;
  readonly passableFor: PassableDomain;
}): { readonly adjacentLand: number; readonly adjacentWater: number; readonly passableNeighbors: number }
```

- [ ] Export `CHOKEPOINT_MAX_PASSABLE_NEIGHBORS = 3` from the same file.
- [ ] Keep the `try`/`catch` around `gridDisk` inside the new function. On a throw, `logError('hexNeighborTerrain countNeighborTerrain: gridDisk threw', err)` and return three zeros. No test asserts the old message.
- [ ] The function only reads. Log with `logTrace` and the three counts.
- [ ] In `assessment.ts`, keep the existing `passableFor` choice and pass it into the new function. Replace the literal in `if (passableNeighbors <= 3)` with the constant. The notes it pushes must not change. `PassableDomain` and `terrainIsPassableForDomain` come from `../pathfinding`; import them in the new file the same way and type `passableFor` as `PassableDomain`.
- [ ] Add `src/main/tools/hexNeighborTerrain.test.ts`: a hex with two passable land neighbours returns `passableNeighbors: 2`; a hex with one water neighbour returns `adjacentWater: 1`.
- [ ] Run the existing assessment tests (`rg -l "executeAssessHex" src --glob "*.test.ts"`). None may need a change.

### Step 2: Structured raise rows in `briefingSectionsMercenaries.ts`

- [ ] Add and export:

```ts
export interface RaiseOptionRow {
  readonly h3Index: string;
  readonly capacityLeft: number;
  readonly resumes: boolean;
  readonly options: readonly HireRaiseOption[];
}

export function listRaiseOptionRows(args: {
  readonly context: ReturnType<typeof buildHireContext>;
  readonly orders: ReturnType<typeof listHireOrdersForSeat>;
  readonly ownHexes: readonly string[];
  readonly resumable: ReadonlySet<string>;
  readonly campaignTargetH3: string | null;
}): RaiseOptionRow[]
```

  It holds the row building and the sort that `raiseTable` has today, and returns every row in that order, not only the first ten. `HireRaiseOption` comes from `../../shared/ipc/mercenaryTypes`. It only reads. Log with `logTrace`.
- [ ] Add `raiseOptionRowsForSeat(state, ownSeat, campaignTargetH3): RaiseOptionRow[]`. It builds `context`, `orders`, `ownHexes`, and `resumable` and calls `listRaiseOptionRows`. `buildMercenariesBriefingBlock` calls it, including the zero-credit check, so those paths never build the inputs separately.
- [ ] `raiseTable` calls `listRaiseOptionRows`, takes the first `MERCENARY_BRIEFING_MAX_ROWS`, and formats them. Its parameter list becomes one `args` object that adds `state` and `ownSeat`.

### Step 3: New columns

- [ ] Add `export const RAISE_OPTIONS_ENEMY_RADIUS = 2;`.
- [ ] The table header becomes `['Hex', 'To Campaign Target', `Enemy Units Within ${RAISE_OPTIONS_ENEMY_RADIUS}`, 'Chokepoint', 'Capacity', 'Resumes building', 'Options']`.
  - To Campaign Target: `computeGridDistanceWithPathFallbackPure(row.h3Index, campaignTargetH3)` as a string, or the em dash `—` when there is no campaign target or the distance is `null`. Use that character, the same one the other prompt tables use for an empty cell.
  - Enemy Units Within 2: the count of `state.units` whose `player !== ownSeat` and `player !== NEUTRAL_OWNER_ID`, and for which `isWithinGridRangePure(row.h3Index, unit.h3Index, RAISE_OPTIONS_ENEMY_RADIUS)` is true. The function's argument order is origin, destination, max range. A neutral within two hexes is not an enemy. A unit on the raise hex already blocks the raise.
  - Chokepoint: `yes` when `countNeighborTerrain({ ..., passableFor: 'land' }).passableNeighbors <= CHOKEPOINT_MAX_PASSABLE_NEIGHBORS`, otherwise `no`. Build `hexSet` and `terrainByH3` once per call from `state.hexes`. `adjacentWater > 0` is the same test as the assessment note "Adjacent to water", because the helper counts water, coastal, and wetlands neighbors.

### Step 4: Print the section at 0 credits

- [ ] In `buildMercenariesBriefingBlock`, the early return that produces `Treasury: 0 credits. No one to rehire.` must also require that no raise option exists. Inside that `if`, after the `hasRehireCandidate` check, add a second condition so the one-line form returns only when both are absent:

```ts
    const hasRaise = raiseOptionRowsForSeat(state, ownSeat, options.campaignTargetH3 ?? null).length > 0;
    if (!hasRehireCandidate(state, context, orderedRehires) && !hasRaise) {
```

  The helper applies the same capacity filter as the table, so a hex whose options do not fit the remaining capacity does not keep the full section open.

- [ ] Nothing else in that function changes order. The rule, the funds line, the warning, Your Mercenaries, Rehire Candidates, and Raise Options print as today.

### Step 5: Tests in `briefingSectionsMercenaries.test.ts`

- [ ] Update the expected Raise Options header and rows.
- [ ] A seat with 0 credits, no mercenaries, no rehire candidate, and one raise option gets the full section, including the text of `buildMercenaryRule()` and a Raise Options table.
- [ ] A seat with 0 credits and neither a raise option nor a rehire candidate still gets the one-line form.
- [ ] A raise hex with one enemy unit at distance 2, one enemy unit at distance 3, and one Neutral unit at distance 1 shows `1` in the enemy column.
- [ ] A raise hex whose land-passable neighbor count is at most `CHOKEPOINT_MAX_PASSABLE_NEIGHBORS` shows `yes` in the chokepoint column. One with more shows `no`.

### Phase 4 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/tools/hexNeighborTerrain.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsMercenaries.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptContracts.test.js`

## Phase 5: Production Priorities

Goal: R7, R8, R11.

### Step 1: Heading

- [ ] In `promptSpec/sectionHeadings.ts`, directly after `SECTION_TITLE_PAUSED_QUEUES`, add `export const SECTION_TITLE_PRODUCTION_PRIORITIES = 'Production Priorities' as const;` with an orienting block copied from its neighbour.
- [ ] Run `rg -n "SECTION_TITLE_PAUSED_QUEUES" src`. Wherever that constant appears in a registry, list, or heading test, add the new constant beside it. `sectionHeadings.test.ts` has a `CURRENT_TITLES` record and one `assert.equal` per title. Add both.

### Step 2: Reusable target list in `briefingSectionsMissiles.ts`

- [ ] Extract the first three `.filter` calls of `missileTargetRows` (infrastructure present, controlled by another seat, explored) into an exported function `enemyInfrastructureHexes(state, ownSeat)` that returns the filtered `strategicInfrastructure` rows. `missileTargetRows` calls it. Its output must not change. The function only reads. Log with `logTrace`.

### Step 3: New file `src/main/openRouter/productionPriorities.ts`

- [ ] Constants:

```ts
export const NAVAL_PRIORITY_CAP_SHARE = 0.5;
export const CREDITS_CITY_MIN_URBAN_PER_SIZE = 12;
export const CREDITS_TREASURY_CEILING_TURNS = 10;
```

- [ ] Function:

```ts
export function buildProductionPriorityLines(args: {
  readonly state: GameStateSnapshot;
  readonly ownSeat: string;
  readonly queues: readonly ControlledHexQueueSnapshot[];
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
  readonly formatHexLabel: (ll: [number, number]) => string;
}): string[]
```

- [ ] Shared definitions inside the file:
  - A queue row is a builder for a type when `row.availableUnitTypes` includes the type, `row.buildPaused !== true`, `row.pausedReasons` is not a non-empty array, and `row.hex` is a two-number array.
  - A type is queued when any entry of any row has that `unitType`.
  - `counts`, `caps` come from `getPlayerUnitCountsByType(state.units, ownSeat)` and `getMaxUnitsPerType(parseGameSize(state.gameSize))`.
  - `buildTurns(row, itemType)`: `cost = buildQueueItemCostFor(itemType)` from `src/shared/gameRules.ts`. The urban field is `urbanHexCount`. `stored` is `Number(row.storedPoints ?? 0)` when the row has no entries or its next entry (`selectNextQueueEntry`) has that type, otherwise 0. Result: `Math.max(1, Math.ceil(Math.max(0, cost - stored) / urbanHexCount))`. Skip a row whose `urbanHexCount` is 0 or whose `resolveToH3` result is missing. Display the city with `formatHexLabel`. Break ties on the h3 string from `resolveToH3`, not on the label. Credits comparisons use `CREDITS_QUEUE_ITEM` from `src/shared/creditsRules.ts`.
  - `turnsWord(n)`: `1 turn` or `${n} turns`.
  - Owner name of a hex: `state.seats?.find((seat) => seat.seatId === controller)?.homeRegion ?? controller`, as `missileTargetRows` does.
- [ ] Missile line. Conditions: `counts.missile < caps.missile`, missile is not queued, and at least one (builder, target) pair exists where the target is a row of `enemyInfrastructureHexes(state, ownSeat)` with `urbanHexCount > 0` inside `missileReachSet(builderH3)`. Choose the pair whose target has the most urban cells. Break ties by fewer build turns, then by builder hex id, then by target hex id, using `<` on the strings. Text:

```text
- Missile: ${builder} can build one in ${turnsWord} and reaches ${target}, a ${owner} city with ${urban} city cells.
```

  Use `city cell` when `urban` is 1. `builder` and `target` are `formatHexLabel` results. The tie-break ids are the h3 strings.
- [ ] Naval line. Conditions: `counts.naval < Math.ceil(caps.naval * NAVAL_PRIORITY_CAP_SHARE)`, naval is not queued, at least one builder exists, and `coastal > 0`, where `coastal` is the number of `enemyInfrastructureHexes` rows with `urbanHexCount > 0` and `countNeighborTerrain(...).adjacentWater > 0`. Choose the builder with the fewest build turns, then the lowest hex id. Text:

```text
- Naval: ${builder} can build one in ${turnsWord}. ${coastal} enemy cities are on the coast, where a ship can shell them and land ground units.
```

  Use `1 enemy city is on the coast` when `coastal` is 1.
- [ ] Credits line. Conditions: `state.mercenaryEconomy != null`; credits is not the next entry of any row; `state.mercenaryEconomy.credits < minUrban × CREDITS_TREASURY_CEILING_TURNS`, where `minUrban = CREDITS_CITY_MIN_URBAN_PER_SIZE × GAME_SIZE_MULTIPLIER[parseGameSize(state.gameSize)]`; and at least one builder for `credits` has urban at least `minUrban`. Choose the builder with the fewest urban cells that meets `minUrban`, then the lowest hex id. Text:

```text
- Credits: no city is producing credits. Queue credits in ${builder}.
```

- [ ] Return the lines in the order missile, naval, credits. Log `logDebug('productionPriorities buildProductionPriorityLines', { ownSeat, lineCount })`.

### Step 4: Print the subsection in `briefingSections.ts`

- [ ] In `buildProductionBriefing`, directly after the block that pushes the Paused Queues subsection and before `if (queues.length === 0) {`, add:

```ts
  const priorityLines = buildProductionPriorityLines({
    state: args.state,
    ownSeat,
    queues: queues as ControlledHexQueueSnapshot[],
    resolveToH3: args.resolveToH3,
    formatHexLabel: args.formatHexLabel,
  });
  if (priorityLines.length > 0) {
    lines.push('');
    lines.push(subHeading(SECTION_TITLE_PRODUCTION_PRIORITIES));
    lines.push('');
    lines.push(...priorityLines);
  }
```

### Step 5: Coaching in `coachingTextStrategic.ts`

- [ ] In `PRODUCTION_BULLET`, replace

```ts
  '- When a controlled cell can build and its queue is empty, queue something.\n\n  ' +
```

with

```ts
  '- When a controlled cell can build and its queue is empty, queue something.' +
  '\n\n  Keep one city queued on credits at all times. Credits are the only way to raise mercenaries, and mercenaries are the only units you can place away from your own cities.' +
  `\n\n  ${SECTION_TITLE_PRODUCTION_PRIORITIES}, under ${SECTION_TITLE_PRODUCTION_STATUS}, names a city for a missile, a naval unit, or credits when one is worth building. Queue what it names before filling the other cities.\n\n  ` +
```

- [ ] Add `SECTION_TITLE_PRODUCTION_PRIORITIES` to the existing import from `./sectionHeadings`.
- [ ] Do not change `PRODUCTION_CAP_QUEUE_GUIDANCE`. `productionSubmitText.ts` reuses it.

### Step 6: Tests in `src/main/openRouter/productionPriorities.test.ts`

Build queue rows by hand as plain objects; the function takes them as an argument.

- [ ] Missile: two builders and two enemy cities in reach. The line names the larger city.
- [ ] Missile: no line when a missile is already queued, when the seat is at the missile cap, and when the only builder is paused.
- [ ] Naval: no line when no enemy city has adjacent water, and no line when the seat already has half its naval cap.
- [ ] Credits: on Small, cities of 5, 12, and 40 urban cells give a line naming the 12-cell city. On Large the same three cities give a line naming the 40-cell city. With only the 5-cell city there is no line.
- [ ] Credits: no line when a row's next entry is credits, and no line when the treasury is at the ceiling.
- [ ] Order: missile, naval, credits.

Also update `promptSpec/coachingText.test.ts` for the new production paragraphs, and add to the production briefing test (`rg -l "buildProductionBriefing" src --glob "*.test.ts"`) one case that the subsection heading prints between Paused Queues and Controlled Hex Queues.

### Phase 5 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/productionPriorities.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsMissiles.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSections.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/coachingText.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/sectionHeadings.test.js`

## Phase 6: Attention Flags and the Missile Bullet

Goal: R9, R10.

### Step 1: Missile attention in `briefingSectionsMissiles.ts`

- [ ] Add and export `formatMissileLaunchAttention(state, format): string | null`. It returns `null` when the seat has no missile or `missileTargetRows` returns no row. Otherwise, with `first` as the first target row:

```text
Missiles: ${ids} can launch. Best target: ${first[0]}, a ${first[1]} city with ${first[2]} city cells. Add a missileLaunches entry.
```

  Use `city cell` when `first[2]` is `1`. `ids` is the row's In Range Of cell (its last element). Reuse the reach computation of `buildMissileForcesBriefingBlock`; extract a private helper so the two functions share it. The function only reads. Log with `logTrace`.

### Step 2: Mercenary attention, new file `src/main/openRouter/mercenaryRaiseAttention.ts`

- [ ] `export const MERCENARY_UPKEEP_RESERVE_TURNS = 3;`
- [ ] Export:

```ts
export function formatMercenaryRaiseAttention(args: {
  readonly state: GameStateSnapshot;
  readonly ownSeat: string;
  readonly format: (h3Index: string) => string;
  readonly campaignTargetH3: string | null;
}): string | null
```

  - Return `null` when `state.mercenaryEconomy` is null or undefined.
  - Build rows with `raiseOptionRowsForSeat` from Phase 4. Do not build a second copy of those inputs.
  - An option is affordable when `economy.credits >= option.fee + MERCENARY_UPKEEP_RESERVE_TURNS * option.upkeep`. Do not add `economy.upkeepPerTurn`. `economy.credits` already excludes pending hire fees.
  - Walk every row, including rows past the tenth displayed Raise Options row. The bullet carries the hex, the type, and the fee, so the commander can place the order when the table cut the hex off. Prefer the first row with an affordable option whose hex is not in `state.homeRegionHexesBySeat?.[ownSeat]`. Do not call `ownHomeHexes(state)`; that helper follows the briefing seat and can disagree with `ownSeat`. If there is none, take the first row with an affordable option. If there is none, return `null`.
  - In the chosen row take the affordable option with the lowest fee, then the type that comes first in `HIREABLE_UNIT_TYPES`.
  - This function chooses a hex. Log with `logDebug`.
  - Text:

```text
Mercenaries: your treasury of ${credits} credits can raise ${unitType} at ${hex} for ${fee}. Add a raise_mercenaries row to productionOrders.
```

### Step 3: Carry the bullets to the briefing

- [ ] In `requestOrdersInjection.ts`, add `readonly additionalAttention: readonly string[];` to `StatusInjectionTexts`. In `buildStatusInjectionTexts`, build it only when `args.coordinateContext.mode !== 'tactical'`:
  - the missile bullet, when not null;
  - the mercenary bullet, when `args.productionEnabled` and not null. Pass `campaignPlan?.objective.targetH3 ?? null`.
  Use the existing `formatCampaignHex` closure as `format`.
- [ ] In `consultPromptParts.ts`, the `else` branch that builds an `injection` literal needs `additionalAttention: []`.
- [ ] In `briefingFormatter.ts`, add an optional field `additionalAttention?: readonly string[];` beside `campaignAttention` in the shared-context interface, with an orienting block. In `formatBriefing`, wrap the existing nested `appendProductionAttentionBullet(...)` expression in a `reduce` over `sharedContext?.additionalAttention ?? []` that calls `appendProductionAttentionBullet(text, bullet)` for each. The file must stay under 1000 lines.
- [ ] In `requestOrdersFlow.ts`, pass `additionalAttention: injection.additionalAttention` in the object given to `formatBriefing`.

### Step 4: Missile coaching bullet

- [ ] In `coachingTextStrategic.ts` add:

```ts
const MISSILE_LAUNCH_BULLET =
  '- Launch every missile that Missile Forces lists a target for. Copy the first target row that names the missile into missileLaunches. A missile that is never launched destroys nothing.';
```

- [ ] In `buildStrategicCoachingSections`, after the naval line, add `if (gates.hasMissileUnits === true) airAndNaval.push(MISSILE_LAUNCH_BULLET);`.

### Step 5: Tests

- [ ] `briefingSectionsMissiles.test.ts`: a missile with a target in reach gives the bullet with that target; no missile gives `null`; a missile with no target gives `null`.
- [ ] New `mercenaryRaiseAttention.test.ts`: a treasury that covers the fee and three turns of that option's upkeep gives the bullet even when `upkeepPerTurn` for the current roster is larger than the treasury; one credit under `fee + 3 * option.upkeep` gives `null`; with one affordable row inside the home region and one outside, the bullet names the outside hex.
- [ ] `promptSpec/variantConformance.test.ts` or the briefing test that already checks the production bullet: one case that an `additionalAttention` entry appears as a `- ` line under Attention Flags, after the production bullet.
- [ ] `promptSpec/coachingText.test.ts`: the missile bullet prints for `hasMissileUnits: true` and not otherwise.

### Phase 6 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsMissiles.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/mercenaryRaiseAttention.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/variantConformance.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/briefingFormatter.test.js`
- [ ] `briefingFormatter.ts` is under 1000 lines.

## Phase 7: Living Documentation

Goal: R13. Describe what the builders emit now. Do not use plan labels.

- [ ] `doc/ai-commander-prompts/strategic-prompt.md`: goals, the tools block and its gates, doctrine lines, the naval and missile rule conditions, Production Priorities, the production bullet, the Mercenaries collapse condition and new columns, the two attention bullets, and the missile coaching bullet.
- [ ] `doc/ai-commander-prompts/assembly-contract.md`: the include and omit matrix rows for the Naval Units and Missiles rules, the tools block, and Production Priorities.
- [ ] `doc/ai-commander-prompts/information-decision-model.md`: the "Keep production running" job gains the priorities; add rows for the new information items beside `PRODUCTION_CAP_QUEUE_RULE`.
- [ ] `doc/ai-commander-prompts/variants.md`: the "owns or can build" gates.
- [ ] `doc/ai-commander-prompts/source-inventory.md` and `crosswalk.md`: new builders and files.
- [ ] `doc/ai-commander-prompts/example-strategic-prompt.md`: update the goals, add the tools block, the doctrine line, the production paragraphs, a Production Priorities subsection, and the full Mercenaries section. In the Controlled Hex Queues table, add `missile` to Available Unit Types for every row with at least 21 urban cells; `getAvailableBuildUnitTypes` lists it there today.
- [ ] `doc/README.md`: add the six new exported constants to the paragraph that lists `PRODUCTION_EXPOSED_RADIUS`, naming each file. Update the `When to use` line on `GAME_SIZE_MULTIPLIER` in `src/shared/gameSize.ts` so the credits-city urban floor is an allowed caller. Do not scale costs or starting armies.
- [ ] `doc/hybrid-ai.md` and `doc/combat-rules-v3.md`: only if a sentence there now disagrees with the builders. Run `rg -n "No one to rehire|queue something|Take and hold enemy cities" doc` and fix each hit. Do not edit `doc/ai-commander-prompts/example-tactical-prompt.md` or anything under `.spec/completed/`.
- [ ] Run `node scripts/check-doc-links.cjs` and fix any broken link it reports.

## Phase 8: Final Verification

- [ ] `npm test` passes.
- [ ] `npm run check:circular` reports the same cycles as before this change and no new one.
- [ ] `rg -n "Phase [0-9]|Step [0-9]|\bR[0-9]+\b" src doc` shows no hit introduced by this change.
- [ ] Line counts: no file touched here crossed 600 lines that was under it before, and none is over 1000.
- [ ] Tactical prompt: the tactical cases in `promptContracts.test.ts` and `variantConformance.test.ts` pass with no expected-string change.

## Phase 9: Verification Run

This phase is for the user, not the implementing agent. The agent stops after the previous phase and reports. The run needs the game window and a model key.

Logging slows the engine, so this is a short run.

- [ ] Set `AGENT_WARS_LOG_LEVEL=debug` and `AGENT_WARS_LOG_FULL_PROMPTS=1`. Run 40 turns of a global-map, no-fog, no-tactical-battle, balanced-doctrine match. Keep `debug.log` and the `debug-last-*` files from that run.
- [ ] From `debug.log`, per seat, count: `openRouter requestOrders: orders applied` lines with `missileLaunches` above 0; `openRouter applyProductionOrdersFromEnvelope` lines and their `droppedReasons`; `mercenaryTools executeMercenaryTools` lines.
- [ ] From the last `debug-last-user-prompt-N.txt` of each seat, read the unit counts line of Production Status.
- [ ] Pass when: every seat that could build a missile or a naval unit queued at least one; at least one seat placed a raise order outside its home region; at least one missile launched.
- [ ] Report the counts whether or not the run passes.

## Out of Scope

- Sealift and airlift. See the `2026-11-13-operations-*-execution-plan.md` plans.
- A missile row in Best Options.
- Unit costs and caps. A missile costs 200 and destroys about half the cells of one hex once. An air unit costs 60 and destroys 9 urban cells per hit each turn within 3 hexes. If missiles stay rare after this change, the price is the next thing to examine, not the prompt.
- New logging.
