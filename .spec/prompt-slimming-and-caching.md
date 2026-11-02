# Prompt slimming and caching

Execution plan for the AI commander prompts. The builders under `src/main/openRouter/` and `src/main/briefing/` are the authority. This file tells a coding agent what to change. It is not product documentation. Do not copy it into `doc/`.

Work the phases in order. Do not start a phase until the previous phase's exit check passes. Do not commit. Do not push.

## 1. Outcome

A tactical consultation sends less text, and the text it still sends is the text the decision depends on.

- Best Options attack rows carry engine-computed odds, so the model does not have to call `estimate_combat` before a listed fight.
- Rule sections appear only when they can change an order in the current situation. Anything left out is available from `rules(topic)`.
- The tactical map shows the cells around units and listed targets. The rest of the footprint is available from `get_map(center, radius)`.
- The empty overlay glyph is `-`, so it is no longer the same character as water.
- Rules and the response format sit in a system message that stays byte-identical across calls while the situation gates are unchanged. The turn, the map, and the tables sit in a later user message.
- Models that accept structured outputs get a shorter response-format section. The example stays.
- Requests for `anthropic/` and `google/` models mark that system message as a cache breakpoint. Consult telemetry records how many prompt tokens were cached.

The studied tactical prompt was about 29,600 characters, with about 13,280 input tokens. The tactical prompt produced by the last phase should be on the order of 40 to 50 percent smaller than a prompt for the same kind of fight built the old way. Phase 11 measures and reports the number. It does not fail a test on the percentage, because the fixture is not that studied prompt.

## 2. Locked decisions

These are settled. Do not reopen them in code comments or by picking a different behavior.

1. **Odds cell.** For a `ranged` row and a `move/melee` row, the cell is `wipe 62%, lose 18%`. `wipe` is `probabilityDefenderEliminated` and `lose` is `probabilityAttackerLosesUnit`, both from `executeEstimateCombat`, rounded with `Math.round(probability * 100)`. The attackers are every unit id on that merged row, together. `engagementType` is `ranged` for a ranged row and `melee` for a move/melee row. Defenders are omitted so the estimator uses the units on the target cell. Air strike, approach, ferry, uncontested, and failed estimates render `—` (em dash, the same character the other empty cells use).
2. **Bad trades.** The prompt tells the model not to copy a ranged or move/melee row whose odds show wipe below 50% and lose at least 50%. Other listed shots are still copied. A shot still does not spend the move. An em dash is not a bad trade. The engine does not reject the order.
3. **`assess_unit`.** Optional. The prompt no longer tells the model to call it on every sub-unit near the enemy.
4. **`estimate_combat`.** Stays a tool. The prompt no longer says to call it before every attack. It says Best Options already has odds for listed fights, and the tool is for a fight the table does not list.
5. **Weather.** Tactical weather rules are included only when the battle's single weather value is not mild. Strategic weather rules are included when any hex on the strategic map is not mild. A missing weather value includes the rules. Tactical weather text never contains the strategic movement sentence or the strategic ferry sentence, even when the weather rules are included.
6. **Armor terrain entry.** The birth-terrain entry sentence is included only when the consulted side has an armor unit, or a naval unit born on wetlands. If birth terrain cannot be read, include the sentence.
7. **Mountain line of sight.** Included only when either side has armor or naval. An all-infantry battle omits it.
8. **Tactical combat stats.** Name only unit types that are present on either side in the battle. Strategic prompts keep the full type line.
9. **Fortifications.** Tactical keeps today's gate (`hasFortifiedCells`). Strategic includes the fortification rule when production tools are on, or when some strategic infrastructure has a fortified count above zero. If that list cannot be read, include the rule.
10. **Missiles.** "Missiles are always hit last" is included only when any unit in the snapshot, either side, is a missile.
11. **Mercenaries.** One line when the treasury is 0, nobody can be rehired, and the seat owns no mercenary. Owned mercenaries keep the full section, including at 0 credits, because upkeep and desertion still apply.
12. **Map window.** Radius is `TACTICAL_MAP_WINDOW_RADIUS` = 2. The window is every footprint cell within that many grid steps of a sub-unit, plus every Best Options target cell. `get_map` is battle-only. Its radius argument defaults to 2 and is capped at 8.
13. **New tools** belong to the Planning group. There is no new toggle. `get_map` is removed from strategic consults even when Planning is on.
14. **Message layout.** Three messages, in this order:
    - `system`: static rules, tools, and response format, with one `cache_control` breakpoint.
    - `user`: the fixed sentence `The current situation is in the next message.`
    - `user`: the clock, warnings, briefing, live counts, and the opening instruction.
    The fixed user message exists because OpenRouter sticky routing hashes the first system message and the first user message. A briefing in the first user message would change that hash every call and the cache would miss. Gemini also treats the system instruction as immutable, so the dynamic briefing must not be a tail on the system message. Source: OpenRouter prompt-caching guide, the Gemini section.
15. **Cache breakpoint.** On the wire, the system message content is one text block with `cache_control: { "type": "ephemeral" }` (the 5-minute default, not the 1-hour write). Apply it only when the model id starts with `anthropic/` or `google/`. In-memory chat messages stay plain strings. The tool loop does not handle content arrays.
16. **Structured outputs.** When the request will attach the JSON schema, drop the format skeleton, the "strict schema" sentence, and the sentence that forbids a top-level array and the legacy fields. Keep every sentence about what the fields mean, which actions are legal, and the example.
17. **Situation-gated rules stay in the system message.** The cache breaks when a gate flips, such as the last armor unit dying or the month changing the weather. That is accepted.

## 3. Do not do these

- Do not compute air-strike odds. Air strike rows get an em dash.
- Do not window the strategic map.
- Do not add a tool-group toggle.
- Do not change the human player's map. `renderHexAsciiMap` is only called from the two briefing map builders. Keep it that way.
- Do not enforce the bad-trade sentence in the order parser. It is prompt advice.
- Do not put turn numbers, dates, unit ids, hex codes, credit counts, or progress counts in the system message.
- Do not mention `get_map` or `rules` anywhere in a prompt that does not list that tool.
- Do not let a tactical prompt contain `memoryUpdates`, `productionOrders`, `query_production`, `enemyIntel`, or `set_build_queue`.
- Do not let a strategic prompt that has a briefing mention `estimate_combat`, `assess_unit`, or `assess_hex` as something to call. The existing test `testBriefingGuidanceDoesNotNameUncallableAssessmentTools` must still pass. The Odds column and its explanation must not name the tool.
- Do not rename existing tool-name strings, heading strings, IPC channels, or envelope actions. Add the new tool names to the frozen list (phase 7).
- Do not write phase names, phase numbers, or this file's name into source, tests, comments, configuration, or `doc/`.
- Do not grow a file past 600 lines. Files already at or over the desirable limit: `requestOrdersFlow.ts` (600), `briefingFormatter.ts` (914), `combatEstimation.ts` (592), `possibleUnitActions.ts` (570), `possibleUnitActionsTableAssembly.ts` (576), `promptText.ts` (564), `openRouterBuildSystemPrompt.ts` (541), `gameRuleText.ts` (511). Put new code in the new files named below. `requestOrdersFlow.ts` must end the work no larger than it started.
- Do not give a function more than six parameters. Pass one object.
- Do not commit.

## 4. Rules for the code

- New and changed exported functions, classes, and fields get an orienting comment with Purpose, When to use, Expected outcome, and Exceptions. Match the comment shape already in the file you are editing.
- A new or changed public function logs at debug level on entry. A getter that does not change state logs at trace level. A caught exception logs at error level with the error object. Log counts and modes, not the prompt text and not a full map.
- Use `const` and `readonly` for values that do not change.
- Tests cover the happy path and the essential failures named in each phase. Do not add tests for constructors, accessors, or a function that only forwards to another.
- Match the voice of the prompt sentence you are editing. The sentences in section 2 and in each phase are the sentences to emit. Do not paraphrase them.
- When a `doc/` page describes a behavior this change alters, update that page in the same phase. The index is `doc/README.md`. Prompt wording lives in `doc/ai-commander-prompts/`. The builders win if a doc sentence disagrees with them. Leave `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, `doc/market-research.md`, and everything under `.spec/completed/` unchanged.

## 5. How to check a phase

Tests compile from `src/` to `dist/` and then run as plain Node scripts.

```text
npm run build:main
node dist/main/path/to/the.test.js
```

Run every test file the phase names. Then run `npx eslint` on each file the phase touched. Fix failures before the next phase.

After phase 8, and again after phase 11, run `npm test`. That target rebuilds native code, lints, checks names, and runs the whole suite. It is slow. Do not skip it at those two points.

New `*.test.ts` files are picked up by the suite on their own. There is no manifest to edit.

## 6. Read before phase 1

- `doc/ai-commander-prompts/README.md`
- `doc/ai-commander-prompts/assembly-contract.md` sections 2, 4, and 6
- `doc/ai-commander-prompts/tactical-prompt.md` sections 2.5, 2.11, and 4
- `doc/naming-conventions-contract-v1.md`, the frozen-names table
- This file, sections 2 and 3

## Phase 1. Map legend and row parity

### Why this is first

The window in phase 6 and `get_map` in phase 7 both render through this path. The glyph and the indent have to be right before either of those exists.

### Read

- `src/main/briefing/map/hexMapRenderer.ts`
- `src/main/briefing/map/hexGridProjection.ts` (`HexGrid`)
- `src/main/briefing/map/tacticalAsciiGridProjection.ts`
- `src/main/briefing/map/briefingMapSection.ts` (both legend strings)
- `src/main/briefing/map/briefingMapSection.test.ts`

### Changes

1. In `structuralOverlay`, the final return is `-`, not `.`. Export a constant `emptyOverlayGlyph` with that value from `hexMapRenderer.ts` and use it in the renderer, so the legend and the displaced-feature check cannot drift.
2. The displaced-feature condition is `presence && struct !== '?' && struct !== emptyOverlayGlyph`. Leaving the old `struct !== '.'` lists every occupied empty cell as a displaced feature. That is the bug this step prevents.
3. Terrain stays `.` for water and `x` for land. Bare land is `x-`. Bare water is `.-`. Own unit on land is `x*`. Enemy on water is `.!`.
4. Trim the end of each map line before joining, in `renderHexAsciiMap`. Do not trim the leading indent space.
5. Add optional `indentFirstRow?: boolean` to `HexGrid`. When it is absent or false, indent displayed row `r` when `r % 2 === 1`, which is today's behavior. When it is true, indent when `r % 2 === 0`.
6. Both legend overlay lines start with `- = nothing here`, then the existing `*`, `!`, and `#` clauses. The strategic line still ends with the undiscovered-intel clause. The tactical line does not. Do not describe `-` as water.

Do not change `projectToGrid`. Strategic maps leave `indentFirstRow` unset. Do not window any map in this phase.

### Tests

Extend `briefingMapSection.test.ts`:

- An empty discovered land cell renders `x-`. An empty water cell renders `.-`.
- A land cell with the consulted side's unit and no feature renders `x*` and does not appear in the displaced-features line.
- A land cell with a unit and an airport still appears as `code(A)` on the displaced-features line.
- A grid with `indentFirstRow: true` indents row 0 and does not indent row 1.

### Docs

In `doc/ai-commander-prompts/tactical-prompt.md` and `strategic-prompt.md`, the legend contract: `-` is an empty overlay, `.` is water. The same sentence in `source-inventory.md` if it shows the old overlay.

### Exit check

`npm run build:main`, then `node dist/main/briefing/map/briefingMapSection.test.js`. Eslint on the files touched. A full tactical map of the same footprint still has the same odd-row indent as before this phase, because `indentFirstRow` is unset.

## Phase 2. Odds on Best Options rows

### Read

- `src/main/briefing/map/briefingTables.ts` (`renderThisTurnOptionsTableMarkdown`, `groupThisTurnOptionRowsByTarget`)
- `src/main/briefing/map/briefingMapSection.ts` (both call sites of the renderer)
- `src/main/tools/combatEstimation.ts` (`executeEstimateCombat`, `EngagementPrediction`)
- `src/main/openRouter/promptText.ts` (`buildToolUsageGuidance`)
- `src/main/openRouter/promptSpec/coachingTextTactical.ts` and `coachingTextStrategic.ts` (the tempo bullets)
- `src/main/openRouter/openRouterToolCatalog.ts` (the `estimate_combat` entry and `TACTICAL_TOOL_PROMPT_LINES`)

### New file

`src/main/briefing/map/bestOptionsOdds.ts`

- `formatBestOptionsOdds(prediction)` returns `wipe N%, lose M%` for a real prediction and `—` for null, for `uncontested`, and for a thrown error.
- `resolveBestOptionsOdds(input)` takes the grouped row's action label, its unit ids, its target H3, the snapshot, `latLngByH3`, `resolveToH3`, and the optional tactical battle. It returns the cell string.
- It calls `executeEstimateCombat` only for `ranged` and `move/melee`. One call per distinct key: engagement type, the sorted unit ids, and the target H3. A later row with the same key reuses the string.
- On a throw, log at error level and return `—`. One bad row must not drop the briefing.
- Do not print a raw probability. `Math.round(p * 100)` only.

### Wiring

`renderThisTurnOptionsTableMarkdown` has three parameters. Add an optional fourth: the odds resolver. That is within the six-argument limit. When the argument is absent, the Odds column is still present and every cell is `—`. Both map builders pass a resolver bound to their snapshot. The column is last. Header cell: `Odds`.

The function currently maps each row to `{ unitId, action, hex, targetUnits, infrastructure }` and drops `targetH3`. Carry `targetH3` on that object and on the grouped row. Do not parse the hex code back to an H3. Pass `latLngByH3.get(targetH3)` into `executeEstimateCombat` as the target. Pass the grouped row's unit ids as `attackers.units`. Do not estimate a merged row once per unit.

Under the table, when the table is non-empty, one line:

`Odds is the chance this row wipes out the defenders, and the chance you lose a unit, if every listed unit takes part. An em dash is not a fight, or it could not be estimated.`

### Prompt sentences

Replace the tactical tempo bullet and the strategic `tempoBullet` with this sentence. It must not say to give every listed shot and then say to skip some. An air-strike row has an em dash, so the bad-trade clause does not drop it. Keep naming an air-strike row only when that side has air, as today.

`Copy a listed shot from Best Options unless its Odds show wipe below 50% and lose at least 50%. An em dash is not that case. A shot resolves before movement and does not use the move. Do not invent a target.`

In `buildToolUsageGuidance`, delete these sentences and do not leave a paraphrase of them:

- `Use estimate_combat before any ranged or melee attack. Do not guess at combat odds.`
- `Use estimate_combat before any attack. Do not guess at combat odds.`
- `Use assess_unit on sub-units near the enemy to understand the tactical picture. Skip assessment for sub-units far from all enemies.`
- The strategic twin of that assess sentence.

Replace the assess guidance, when assessment tools are on. Tactical:

`assess_unit is optional. Call it only when the briefing does not show what that sub-unit can reach or shoot. On a shared cell, assess one sub-unit per parent.`

Strategic, and only on the no-briefing path where the tool is still callable:

`assess_unit is optional. Call it only when you cannot tell what that unit can reach or shoot.`

Do not use the word `sub-unit` in a strategic prompt.

In the `estimate_combat` description and in both prompt lines, delete `Always check before committing to an attack.` Strategic prompt line gains: `Best Options already gives Odds for a listed fight. Use this for a fight the table does not list.` Tactical prompt line keeps the statement that battle estimates do not cover air strikes, and gains the same Best Options sentence.

The no-briefing hint in `openRouterBuildSystemPrompt.ts` (`(e.g. use estimate_combat to pick the best)`) stays only on the no-briefing path. Do not add it when a briefing is present.

### Tests

New `src/main/briefing/map/bestOptionsOdds.test.ts`:

- Probabilities `0.62` and `0.19` render `wipe 62%, lose 19%`. Use values that are multiples of `0.01`. Do not use a fixture such as `0.185`, which is not exact in binary and can round the wrong way.
- Null and `uncontested` render `—`.
- An `air strike` action does not call the estimator. Inject a fake caller that throws if it is called, and assert the cell is `—`.
- Two rows with the same ids and target call the estimator once. Pass a counter.

Search tests for the Best Options header and for a row pattern that assumes five cells. Update those. Do not add an Odds column to the legacy possible-actions table (`buildPossibleUnitActionsMarkdown`).

Update `briefingFormatter.test.ts`, which locks the header string, so the header includes `Odds`.

Update `tacticalToolPromptText.test.ts` and `promptContracts.test.ts` so they lock the new sentences and still forbid `estimate_combat` in strategic briefing guidance.

Update `coachingText.test.ts` expectations that quote the old tempo sentence.

### Docs

`tactical-prompt.md` and `strategic-prompt.md`: the Best Options columns, and the tempo coaching item. `doc/ai-tools.md`: the `estimate_combat` paragraph no longer says to check before every attack. `assembly-contract.md` section 6 item 1 stays about firing and moving. Add that a listed row with wipe below 50% and lose at least 50% is a row the prompt says to skip.

### Exit check

Build, then the new odds test, `briefingFormatter.test.js`, `promptContracts.test.js`, `coachingText.test.js`, and `tacticalToolPromptText.test.js`. Eslint on the files touched.

## Phase 3. Remove duplicated coaching and format text

### Why

The rules block already states these. The coaching block repeats them word for word, and the response format repeats the movement clamp. Removing them does not remove the rule.

### Read

- `src/main/openRouter/promptSpec/coachingTextTactical.ts` (`REACH_BULLET`, `INFANTRY_REACH_BULLET`, and the pushes of `buildCasualtySortRule` and `buildDestinationOccupancyRule`)
- `src/main/openRouter/promptSpec/coachingTextStrategic.ts` (the same two pushes, `RESOLUTION_ORDER_BULLET`, and the hold-fire push)
- `src/main/openRouter/promptContracts.ts` (`buildFinalJsonContractInstruction`)
- `src/main/openRouter/promptSpec/gameRuleText.ts` (`tacticalLandEnterCostRule`, `buildMovementBudgetRule`)

### Delete from coaching

Delete the bullet, or the part of the bullet, that repeats the rules block. Keep a bullet when it says something the rules block does not say.

- Delete the coaching copies of `buildCasualtySortRule()` and `buildDestinationOccupancyRule()`.
- Delete `REACH_BULLET`'s road, rail, urban, and rubble sentences, and its 1-point budget sentence. Those come from `tacticalLandEnterCostRule()` and the budget sentence in `buildMovementBudgetRule`.
- Keep one short clamp sentence in tactical coaching, because the rules sentence and the coaching sentence are not the same idea for the model. The sentence to keep: `A destination beyond this beat's point budget is clamped to the first reachable leg. When that shortened step is not the ordered cell and the sub-unit can already shoot, the move is dropped unless the step enters a cell that holds an enemy.`
- Delete `INFANTRY_REACH_BULLET`. The tactical rules block already has the baselines, the range cap, and the mountain sentence. Phase 4 gates the mountain sentence. Do not leave a second copy here.
- Delete strategic `RESOLUTION_ORDER_BULLET`. Keep the half that is not in the rules block, as its own bullet: `A unit that fires can still move, and a ferried air unit arrives after ground movement.`
- Delete the strategic coaching push of `buildHoldFireRule()`. The rules block already includes it when standing orders are on.

### Delete from the response format

In `buildFinalJsonContractInstruction`, remove paragraphs that restate first-leg clamping, the one-step fallback, road and rail costs, or "raw H3 strings are never valid" when `buildInvalidOutputRulesClause` already says the coordinate rule. Read `buildInvalidOutputRulesClause` before deleting. If a sentence is the only place that states a drop rule (already-arrived, friendly stacking as a format rule, missing fields), keep it.

Delete a repeated `Do not emit assign_order or cancel_order for tactical sub-unit ids` when the tactical action list already ends with `TACTICAL_STANDING_ORDER_PROHIBITION`.

### Tests

Update `coachingText.test.ts`. It currently requires `for every terrain, for infantry and armor`, `lowest-defense`, and `stack` inside coaching. Those assertions move: the rules tests in `gameRuleText.test.ts` keep them, and the coaching test asserts the coaching text does not contain `1/2 point`, `lowest-defense`, or `Friendly units may stack`.

Keep the coaching test that the clamp sentence is present in tactical coaching.

### Docs

`tactical-prompt.md` section 4 items 4, 5, and 7, and `strategic-prompt.md` section 4 items that say coaching restates casualty order, stacking, or the resolution order. `assembly-contract.md` section 6: casualty order and stacking are rules-block items, not coaching items. `crosswalk.md` if it names coaching as a second carrier for those two.

### Exit check

Build, then `coachingText.test.js` and `gameRuleText.test.js`. Eslint on the files touched. Search the tactical coaching output for `1/2 point` and expect no hit.

## Phase 4. Include rule text only when it applies

### Read

- `src/main/openRouter/promptSpec/gameRuleText.ts` (`GameRuleTextGates`, `buildCombatRulesParagraph`, `buildCombatStatsLine`, `buildRangedReachRule`, `buildOriginBonusRule`)
- `src/main/openRouter/promptSpec/gameRuleEnvironmentText.ts` (`buildWeatherRule`)
- `src/main/openRouter/promptSpec/gameRuleMissileText.ts`
- `src/main/openRouter/promptSpec/gameRuleFortificationText.ts`
- `src/shared/terrainBonusMarch.ts` (`TERRAIN_BONUS_MOVEMENT_PROMPT_SENTENCE`, `terrainBonusMarchCategoryFor`)
- `src/main/openRouter/openRouterBuildSystemPrompt.ts` (the `buildCombatRulesParagraph` call)
- `src/main/tacticalBattle/buildTacticalAiPlanState.ts` (it drops `origin` and `weatherTags`)
- `src/main/openRouter/requestOrdersFlow.ts` around the `coordinateContext` object (lines 195–203)

### Gates, and where the fact comes from

Add fields to `GameRuleTextGates`. Each one fails open, as section 2 says.

| Gate | Include the text when | Source |
| --- | --- | --- |
| `weatherApplies` | Tactical: `battleWeather !== 'mild'`. Strategic: some `state.hexes[].weather` is not mild | Tactical value from `TacticalBattleSnapshot.weather`, passed on the coordinate context. Strategic value from the snapshot hexes. Unknown includes the text |
| `includeArmorTerrainEntry` | Own seat has armor, or own naval whose birth category makes `terrainBonusMarchCategoryFor` return non-null | Tactical birth terrain from `tacticalBattle.subUnits[].origin`, not from plan-state units. Thread the battle snapshot into the prompt builder. Unknown birth terrain includes the text |
| `includeMountainLineOfSight` | Any unit, either side, is armor or naval | `state.units` |
| `tacticalTypesPresent` | Tactical stats line names only these types | Types present in `state.units`. Empty or unknown prints every type |
| `includeMissileCasualty` | Any unit, either side, is a missile | `isMissileUnitType` over `state.units` |
| `includeFortificationRule` | Tactical: today's `hasFortifiedCells`. Strategic: production on, or some infrastructure `fortifiedCount > 0` | Confirm the field name in `gameStateTypes.ts` before using it. Unknown includes the text |
| `includeWeatherAirSentence` | Own seat has an air unit | Existing `hasAirUnits` |

`requestOrdersFlow.ts` is at 600 lines. Do not add the weather lookup inline. Add `battleWeather` on `CoordinateContext` in `coordinateContext.ts`, and set it through a helper of a few lines in a file that has room, or by replacing a larger block. The net line count of `requestOrdersFlow.ts` must not rise.

### Weather text

Split `buildWeatherRule` so the tactical string is built without these two sentences:

- `Armor strategic movement is 1 in snow or rain, and naval strategic movement is 1 in snow.`
- `A strategic ferry into snow is 2 hexes.`

The strategic string keeps both. Shared sentences (the date line, the tag exemption, the Unit Status column line) stay in both. When `weatherApplies` is false, `buildWeatherRule` returns null and the Unit Status table omits the Weather column. Find the column in the briefing table builder and gate it on the same flag. When the rules are included, the column stays, including the birth-tag parentheses.

### Other clauses

- `buildOriginBonusRule` appends `TERRAIN_BONUS_MOVEMENT_PROMPT_SENTENCE` only when `includeArmorTerrainEntry` is true.
- `buildRangedReachRule` includes the mountain sentence only when `includeMountainLineOfSight` is true. The infantry and armor baselines and the range-1 cap stay.
- `buildCasualtySortRule` appends `MISSILE_CASUALTY_ORDER_SENTENCE` only when `includeMissileCasualty` is true.
- `buildCombatStatsLine` in tactical mode lists only `tacticalTypesPresent`. Strategic mode is unchanged.
- The air-strike weather sentence is omitted when `includeWeatherAirSentence` is false.
- `buildFortificationRule` uses `includeFortificationRule`.

Do not gate terrain cover. It applies on every map.

### Tests

Extend `gameRuleText.test.ts`:

- Tactical, weather mild: the combat paragraph does not contain `snow` or `strategic ferry`.
- Tactical, weather snow: the paragraph contains `armor's point budget` and does not contain `Armor strategic movement` or `strategic ferry`.
- Tactical, terrain bonus on, roster is infantry only, birth terrain known: the paragraph does not contain `birth terrain kind`.
- Tactical, roster is infantry only on both sides: the paragraph does not contain `mountain`.
- Tactical, no missile on either side: the paragraph does not contain `hit last`.
- Strategic, every hex mild: no weather paragraph. Strategic, one hex snow: the strategic movement sentence is present.

Extend the Unit Status test so a mild tactical battle has no Weather column, and a snow battle has one.

Update the existing assertions that require the terrain-entry sentence and the mountain sentence on every tactical prompt. Those become assertions on a roster that contains armor.

### Docs

`tactical-prompt.md` section 2.5 (weather, origin, reach). `strategic-prompt.md` section 1.5. `variants.md` sections 8 and 9. The Unit Status column description in both mode files.

### Exit check

Build, then `gameRuleText.test.js` and the briefing test that renders Unit Status. Eslint on the files touched.

## Phase 5. Mercenary one-liner

### Read

- `src/main/openRouter/briefingSectionsMercenaries.ts`
- `src/main/openRouter/promptSpec/gameRuleMercenaryText.ts`
- `src/main/openRouter/briefingSectionsMercenaries.test.ts`

### Behavior

In `buildMercenariesBriefingBlock`, when production is on and `credits === 0` and the rehire list is empty and the seat has no mercenary, return only:

`# Mercenaries`

`Treasury: 0 credits. No one to rehire.`

Use the existing heading constant. Do not invent a second heading.

Any other case stays as it is today, including production off with a living mercenary, and credits 0 while the seat still owns one.

### Tests

Extend `briefingSectionsMercenaries.test.ts` with the zero-credit, no-candidate, no-owned case, and with the zero-credit case that still owns one mercenary. The second case still contains the upkeep rule.

### Docs

The Mercenaries paragraph in `strategic-prompt.md`.

### Exit check

Build, then `briefingSectionsMercenaries.test.js`. Eslint on the file.

## Phase 6. Tactical map window

### Read

- `src/main/briefing/map/briefingMapSection.ts` (`buildTacticalOperationalMapSectionMarkdown`)
- `src/main/briefing/map/tacticalAsciiGridProjection.ts`
- `src/shared/tacticalBattleFootprint.ts`
- How `assess_unit` uses `gridDisk` (`src/main/tools/assessment.ts`)

### Behavior

Collect Best Options rows before drawing the map. The window is:

- every `tacticalChildH3Indexes` cell within `TACTICAL_MAP_WINDOW_RADIUS` (2) grid steps of any sub-unit cell, and
- every Best Options target cell that is inside the footprint.

Put the constant and the window selection in `tacticalAsciiGridProjection.ts`. `briefingMapSection.ts` stays a caller. The section file is the wrong place for the grid math, and it should not grow by the whole window implementation.

Project that subset with `pickTacticalAsciiOrigin` called on the **full** footprint, not on the subset. Compute raw rows the way `projectTacticalFootprintToAsciiGrid` does. Let `fullMinRow` be the minimum raw row of the full footprint and `windowMinRow` the minimum raw row of the subset. Shift the subset by `windowMinRow` so the crop is tight. Set:

`indentFirstRow = ((windowMinRow - fullMinRow) % 2 + 2) % 2 === 1`

A row that is indented in the full map stays indented in the crop. Check this with numbers in the test, not by eye.

When the subset is empty, render the full footprint and leave `indentFirstRow` false.

Legend line, after the existing legend, only when the subset is smaller than the footprint:

`Shown: N of M cells around your units and the listed targets.`

Do not mention `get_map` in this phase. Phase 7 adds that clause.

Trimmed lines from phase 1 still apply.

### Tests

Extend `briefingMapSection.test.ts` or `tacticalAsciiGridProjection`'s test:

- A footprint with one unit in the middle renders fewer cells than the footprint, and renders that unit's code.
- A Best Options target outside the radius is still on the map. Build the smallest fixture that produces such a row, or call the window helper directly if the row is hard to force.
- `windowMinRow - fullMinRow` odd makes `indentFirstRow` true. One assertion on the flag, one assertion that row 0 of that grid is indented.

### Docs

`tactical-prompt.md` operational-map section: the prompt map is the window, not the whole footprint. The empty-footprint sentence is unchanged.

### Exit check

Build, then the map tests. Eslint on the files touched.

## Phase 7. `rules` and `get_map`

### Read

- `src/main/openRouter/openRouterToolCatalog.ts`
- `src/main/openRouter/openRouterToolGroups.ts` (`filterToolNamesForTacticalBattle`, `TOOL_GROUP_REGISTRY`, the planning name list)
- `src/main/openRouter/requestOrdersToolDispatch.ts`
- `src/main/openRouter/openRouterToolArgsHex.ts`
- `src/main/tools/pathfinding.ts` (`PATHFINDING_TOOL_NAMES`)
- `src/renderer/chrome/controlTooltipText.ts` (`planningTooltipText`)
- `doc/ux/opponent-tab-tool-groups.md` if it quotes the Planning tip
- `doc/naming-conventions-contract-v1.md` frozen LLM tool names

### Names

Frozen string values, added to the naming-contract row, not renames of old ones:

- `get_map`
- `rules`

Constants: `REFERENCE_TOOL_NAMES = ['get_map', 'rules']` in a new `src/main/tools/referenceTools.ts`. Append that list to the Planning group's tool names. `getToolFlags` does not grow a new boolean.

`filterToolNamesForStrategicConsult` (new, next to the tactical filter) removes `get_map` and leaves `rules`. Call it from `requestOrdersFlow.ts` on the strategic branch. Keep the flow's line count from rising: move a same-sized block out if the call does not fit.

Tactical consults keep both, because Planning is not stripped in battle.

### Dispatch

`requestOrdersToolDispatch.ts` checks the exact tool name against `REFERENCE_TOOL_NAMES` **before** the `includes('order')` branch. Both new names are safe today. The first-branch rule is what keeps a later rename from falling into production or assessment.

### `get_map`

Parameters: `center` (two-character code, required), `radius` (integer, optional, default 2, minimum 0, maximum 8).

Decode `center` in `openRouterToolArgsHex.ts` the way `assess_hex.position` is decoded, then resolve it back to an H3 with the consult's `resolveToH3`. The cell must be in the tactical footprint. Otherwise return `{ status: 'error', error: '...' }` and do not throw.

The result is `{ status: 'ok', center, radius, cellCount, map }` where `map` is the legend plus the fenced grid for the disk, using the phase 6 origin and indent rule against the full footprint. No latitude, no longitude, no H3 string in the result.

A strategic call returns an error even if the name was forced in.

Prompt line: `get_map(center, radius?) - The battle map around a cell. Radius is 0 to 8 grid steps, default 2. Use it for cells outside the map in the briefing.`

### `rules`

Parameters: `topic` (string, required, enum below).

Topics, in this order: `weather`, `movement`, `line-of-sight`, `casualties`, `stacking`, `naval`, `air`, `fortifications`, `missiles`, `mercenaries`, `resolution`, `combat-stats`.

The text is the **full** rule for the consult's mode, not the gated paragraph. Tactical `weather` has no strategic movement sentence and no strategic ferry sentence. Strategic `weather` has both. An unknown topic returns `{ status: 'error', error: 'Unknown topic. Topics: weather, movement, ...' }` listing the same enum.

Reuse the builders. Do not copy the sentences into a second string. A forced-open gate object (every include flag true, every type present, weather on) is the right way, as long as the tactical weather builder is the one that already omits the strategic sentences.

Prompt line: `rules(topic) - Full rules for one topic. Topics: weather, movement, line-of-sight, casualties, stacking, naval, air, fortifications, missiles, mercenaries, resolution, combat-stats.`

### Prompt pointer

When `rules` is in the enabled list, `buildCombatRulesParagraph`'s caller appends one line after the paragraph:

`Call rules(topic) for a rule that is not printed above. Topics: weather, movement, line-of-sight, casualties, stacking, naval, air, fortifications, missiles, mercenaries, resolution, combat-stats.`

When `rules` is not enabled, that line is absent, and no other sentence names the tool.

When `get_map` is enabled and the window is smaller than the footprint, the phase 6 legend line gains ` Call get_map(center, radius) for cells outside this window.` Thread a boolean into the tactical map builder. Do not read the tool list from inside the renderer.

### Tooltip

`planningTooltipText` becomes: `Let the opponent plan routes, measure distances, and look up the map and the rules. The number counts uses in this consult, for every commander, and this does nothing when the model cannot use tools.`

Update `doc/ux/control-tooltips.md` and `doc/ux/opponent-tab-tool-groups.md` if they quote the old sentence. The routing table in `doc/ux-specification.md` says which page that is.

### Tests

New `src/main/tools/referenceTools.test.ts`:

- `rules({ topic: 'weather' })` in tactical mode contains a weather sentence and does not contain `strategic ferry`.
- `rules({ topic: 'nope' })` returns status `error` and lists `combat-stats`.
- `get_map` with a known center and radius 0 returns a map that contains that cell's code and no other cell code.
- `get_map` with a code that is not in the footprint returns status `error`.
- `get_map` with radius 9 returns status `error`.

Extend `openRouterToolGroups.test.ts`: a tactical filter keeps `get_map` and `rules`. A strategic filter keeps `rules` and drops `get_map`.

One prompt test: tactical with Planning on contains the `rules(topic)` pointer. Tactical with Planning off does not contain `rules(topic)` or `get_map`.

### Docs

`doc/ai-tools.md` tool table and a short section for each tool. `assembly-contract.md` section 4 tool table. `tactical-prompt.md` section 2.11. `doc/naming-conventions-contract-v1.md` frozen tool-name row, adding the two strings.

### Exit check

Build, then `referenceTools.test.js` and `openRouterToolGroups.test.js`. Eslint, including the renderer tooltip file. `npm run naming:check`.

## Phase 8. Static system message, then the situation

### Read

- `src/main/openRouter/openRouterBuildSystemPrompt.ts`
- `src/main/openRouter/requestOrdersFlow.ts` (the messages array near the `buildSystemPromptForTools` call)
- `src/main/openRouter/promptSpec/consultationText.ts` (`buildOpeningUserMessage`)
- `src/main/openRouter/promptOutline.test.ts`
- `src/main/openRouter/tacticalPromptSectionParity.test.ts`
- `src/main/openRouter/requestOrdersFlowSupport.ts` (`logPromptPreview`)
- `doc/ai-commander-prompts/assembly-contract.md` section 2
- `doc/ai-commander-prompts/consultation-flow.md`

### New files

- `src/main/openRouter/consultPromptParts.ts` exports `buildConsultPromptParts` and `joinConsultPromptParts`.
- `src/main/openRouter/consultPromptMessages.ts` exports `buildConsultMessages`.

`buildSystemPromptForTools` stays as a wrapper that returns `joinConsultPromptParts(...)`, so existing tests that want one string keep compiling. Its signature stays. New work goes in the new files. If `openRouterBuildSystemPrompt.ts` would pass 600 lines, move the leftover helpers until it does not.

`buildConsultPromptParts` takes one object and returns `{ staticSystemText, situationText }`. It logs at debug level the mode, the turn, and the two lengths. It does not log the text.

### What is static

In order:

1. `# Your Command` with the role sentence and the goal. No turn, no date, no beat, no phase.
2. `# Coordinates`.
3. `# Combat and Movement Rules`, including the phase 4 gates and the phase 7 pointer.
4. `# Battle Context` or `# Strategic Context`, coaching bullets only. No explored count, no controlled count, no home-region hex list.
5. `# Available Tools`, the numbered lines, and `## How to Use These Tools Effectively`.
6. `# Response Format` and `## Example Response`.

### What is the situation message

In order, under `# Current Situation` and then the existing briefing headings:

1. The clock line. Tactical: `Strategic turn: N, date: D, tactical beat: B, phase: P.` Strategic: `Current turn: N, date: D, phase: P.`
2. The scouting sentence, when it applies. This is the only copy. Delete `SCOUTING_BULLET` from `coachingTextStrategic.ts` so static coaching does not change when the first enemy is seen. The situation message carries it.
3. The tool-budget warning. `getAndClearAiToolLimitExceededLastTurn` is called once, here, and nowhere else.
4. The commander's briefing body, unchanged in order: narrative, unit table, attention, map, notes, callbacks, and the strategic-only sections the briefing already carries.
5. Sides, scenario objective, and the strategic progress bullets (explored, controlled, home-region hexes).
6. Air, missile, mercenary, and sealift blocks.
7. `# Unit Roster` and the observed-enemy line.
8. The opening instruction, which today is a separate user message. It now ends the situation message. Change `Use the Commander's Briefing in the system prompt above.` to `Use the Commander's Briefing above.`

### Static text must not depend on these

Reword, do not branch:

- `hasBestOptionsTable`. The copy-or-route sentence becomes: `When Best Options This Turn lists a target for a unit, copy it and do not call plan_route for it. When it lists none, call plan_route or leave the unit idle.` The movement-order sentence in the response format uses the same idea and does not ask whether the table exists.
- `hasObservedEnemy`, other than the scouting sentence in the situation message.

A gate in section 2 may still change the system message. That is the accepted cache break.

`wrapLongProseLines` runs on each part on its own.

### Messages

`buildConsultMessages` returns:

1. `{ role: 'system', content: staticSystemText }`
2. `{ role: 'user', content: 'The current situation is in the next message.' }`
3. `{ role: 'user', content: situationText }`

`requestOrdersFlow.ts` uses that helper in place of the two-element array. Net line count of the flow file does not rise.

The tool loop, the repair exchange, and the malformed-completion note keep appending after message 3. They do not rewrite messages 1 or 2.

This phase is not shippable on its own. Two user messages in a row can be rejected by a provider. Phase 10 retries that case by joining them. Do not stop the work between this phase and phase 10 if a live consult is about to run.

### Debug files

`debug-last-tactical-prompt-N.txt` and `debug-last-strategic-prompt-N.txt` receive the system message only. `debug-last-user-prompt-N.txt` receives the situation message (briefing plus opening). The fixed lead-in is not written to its own file. Update `consultation-flow.md` and the capture sentence in `doc/ai-commander-prompts/README.md`. Do not edit `.spec/completed/`.

### Tests

- `promptOutline.test.ts` and `tacticalPromptSectionParity.test.ts` join the two parts for the hex-code audit and the forbidden-string checks. Replace the old heading subsequence. Joining puts the tools and the response format **before** the briefing, so a test that still expects `# Commander's Briefing` before `# Available Tools` is wrong, not a bug in the builder. The system part's subsequence is `# Your Command`, `# Coordinates`, `# Combat and Movement Rules`, `# Strategic Context` or `# Battle Context`, `# Available Tools`, `## How to Use These Tools Effectively`, `# Response Format`, `## Example Response`. The situation part's subsequence is `# Current Situation`, `# Commander's Briefing`, `## Unit Status and Threats`, `## Attention Flags`, `## Operational Map`, `# Unit Roster`. `assertHeadingsNest` allows a later H1. It does not allow a heading to skip a level downward.
- New case in `consultPromptParts.test.ts`: two tactical states that differ in turn number, date, beat, and unit positions, and that share mode, tool list, doctrine, seat, scenario, weather gate, and roster **types**, produce equal `staticSystemText`. A third state that adds an armor unit produces different `staticSystemText`.
- The joined tactical string still omits `memoryUpdates` and `productionOrders`.
- `consultationContract.test.ts`: the opening no longer says `system prompt above`.

### Docs

`assembly-contract.md` section 2: the skeleton splits into the system message and the situation message, with the fixed lead-in between them. The order rules (rules before data, envelope last inside the system message) stay. `consultation-flow.md` describes the three starting messages.

### Exit check

Build, then `promptOutline.test.js`, `tacticalPromptSectionParity.test.js`, `consultPromptParts.test.js`, and `consultationContract.test.js`. Eslint on the files touched. Then `npm test`.

## Phase 9. Shorter response format when the schema is attached

### Read

- `src/main/openRouter/promptContracts.ts`
- `src/main/openRouter/promptSpec/envelopeJsonSchema.ts` (what the schema already requires)
- `src/main/openRouter/ordersRequestProfile.ts` and `openRouterModelCapabilities.ts` (`isStructuredOutputsRejectedForModel`)
- `src/main/openRouter/requestOrdersFlow.ts` where `responseFormat` is chosen

### Behavior

`buildConsultPromptParts` takes `structuredOutputs: boolean`. The flow passes `requestProfile.structuredOutputs && !isStructuredOutputsRejectedForModel(modelId)`.

When the flag is true, omit only:

- the submit header's JSON skeleton (`{ "message": ..., "orders": [ ... ] }`),
- `Strict schema: top-level must be a JSON object...`,
- the sentence that says a top-level array is invalid and names legacy `movementOrders` and `rangedAttacks`.

Keep the field meanings, the action list, the invalid-output drops, callbacks, memory, production, and `## Example Response`.

When the flag is false, today's prose stays, minus the phase 3 deletions.

The repair request is unchanged. A model that rejects the schema mid-consult still gets the repair schema in that later message. Do not rebuild the system message mid-consult. A rejection is recorded, and the **next** consult uses the long form.

### Tests

One contract test: structured flag on, tactical, the format section does not contain `Strict schema` and does contain `## Example Response` and `explicit_move`. Structured flag off contains `Strict schema`.

The static-invariance test from phase 8 uses the same flag for both states.

### Docs

`tactical-prompt.md` and `strategic-prompt.md` section on the response envelope: one sentence that the skeleton and the strict-schema line are omitted when the request attaches the JSON schema. `consultation-flow.md`: the schema is not a reason to rebuild the system message.

### Exit check

Build, then `promptContracts.test.js` and `consultPromptParts.test.js`. Eslint on the files touched.

## Phase 10. Cache breakpoint and cached-token telemetry

### Read

- `src/main/openRouter/ordersChatRequestHelpers.ts` (`postOrdersChatRequest`)
- `src/main/openRouter/requestOrdersToolLoop.ts` (the usage sum)
- `src/main/openRouter/requestOrdersRepairExchange.ts` (the usage sum)
- `src/main/openRouter/consultTelemetry.ts` (`ConsultFallbackKind`)
- `src/main/openRouter/consultTelemetrySummary.ts`
- OpenRouter's prompt-caching guide: a system message is cached as a content array; Gemini uses only the last breakpoint and ignores a dynamic tail inside the system message.

### New file

`src/main/openRouter/promptCacheBreakpoint.ts`

- `modelUsesExplicitPromptCache(modelId)` is true when the id starts with `anthropic/` or `google/`.
- `applySystemCacheBreakpoint(body)` returns a copy of the chat body. The first message, which must be `role: 'system'` with a string `content`, becomes `content: [{ type: 'text', text, cache_control: { type: 'ephemeral' } }]`. No `ttl`. Any later message is unchanged. A body that already has array content on the system message is returned unchanged.
- `isCacheBreakpointRejection(result)` is true when the error string mentions `cache_control`.

### Request path

`postOrdersChatRequest` applies the breakpoint only when the model passes `modelUsesExplicitPromptCache` and the model has not been marked. In-memory messages stay strings. Only the HTTP body changes.

Two retries, each at most once, and they do not loop:

- When the error mentions `cache_control`, resend that same body without the breakpoint, mark the model the way structured outputs are marked, and record `cacheBreakpointDropped`. Do this for no other 400.
- When the error says the roles must alternate, or otherwise rejects two user messages in a row, resend with the lead-in as the first line of the situation message and with the middle message removed. Keep the breakpoint on that retry if the error did not mention `cache_control`. Mark the model so later consults start joined, and record `situationMessagesJoined`. A joined first user message changes every call, so sticky routing misses for that model. Consults still run.

Add both literals to `ConsultFallbackKind`. Any other failure returns as it does today.

### Telemetry

Read `usage.prompt_tokens_details.cached_tokens` and `usage.prompt_tokens_details.cache_write_tokens`. Missing values are 0. Sum them in the tool loop and the repair exchange next to `prompt_tokens`. Add `cachedTokens` and `cacheWriteTokens` to `ConsultTelemetrySummary` and to `buildConsultTelemetrySummary`. They show up on the existing info log. Do not add a renderer control. If a shared IPC type has to learn the fields to compile, add them as optional numbers and do not display them.

### Tests

New `promptCacheBreakpoint.test.ts`:

- A `google/` model body gets the breakpoint on the system message and nowhere else. The text is unchanged.
- An `openai/` model body is not given a breakpoint.
- A fake rejection whose error contains `cache_control` is classified as a breakpoint rejection. A 400 whose error is `bad schema` is not.

Extend `consultTelemetry.test.ts`: a usage object with `cached_tokens: 10` adds 10 to the summary, and a missing `prompt_tokens_details` adds 0.

### Docs

`doc/hybrid-ai.md`, in the consult-loop section, three sentences: the system message is the stable prefix, `anthropic/` and `google/` requests mark it, and the consult log includes `cachedTokens`. Do not describe the HTTP shape in the player-facing how-to.

### Exit check

Build, then `promptCacheBreakpoint.test.js` and `consultTelemetry.test.js`. Eslint on the files touched.

## Phase 11. Docs sweep and a size reading

### Docs

Update every page that still describes the old prompt, then search `doc/` for the old sentences. Leave historical docs alone (section 4).

- `doc/ai-commander-prompts/README.md`
- `assembly-contract.md`
- `tactical-prompt.md`
- `strategic-prompt.md`
- `consultation-flow.md`
- `variants.md`
- `information-decision-model.md`: add a `BEST_OPTIONS_ODDS` item carried by the Odds column. Adjust `TEMPO_RANGED_SHOT` so it matches the bad-trade sentence.
- `crosswalk.md`
- `source-inventory.md`
- `doc/ai-tools.md`
- `doc/hybrid-ai.md`
- `doc/naming-conventions-contract-v1.md` if phase 7 left a tool name out
- The UX tooltip pages from phase 7

Refresh `example-tactical-prompt.md` and `example-strategic-prompt.md` from a captured consult if one can be produced without a live model key. If it cannot, edit the examples by hand to match the builders and say at the top of each file that the reading copy was edited to match the builders rather than captured. Do not present an edited copy as a capture.

### Size reading

In `consultPromptParts.test.ts`, log the character length of the joined tactical fixture and of its system part. Do not assert a percentage. In the final summary, report those two numbers and compare the joined length with 29,600. Say so if the system part is under about 4,000 characters: Gemini's cache write has a minimum near 1,024 tokens, and a system part that small may never cache.

### Exit check

`npm test`.

Search `src/` and `doc/` for `Always check before committing`, `Do not guess at combat odds`, and `Use assess_unit on sub-units near the enemy`. Each hit is either a test asserting the sentence is absent, or a doc line that explains it was removed. No prompt builder still emits them.

## 7. Traps that look like small mistakes

- `structuralOverlay` returning `-` while the displaced-feature check still excludes `.` marks every occupied cell as a featured hex.
- Projecting the window with `pickTacticalAsciiOrigin(windowCells)` shifts the grid, and odd-row indent no longer matches the full map. Use the full footprint as the origin.
- `getAndClearAiToolLimitExceededLastTurn` called from both builders drops the warning and clears the flag.
- Routing `get_map` through `toolName.includes('order')` or a later branch. Exact names go first.
- Printing odds with string conversion of the raw probability. Use `Math.round`.
- Estimating an air-strike row. The battle estimator throws on air attackers.
- Hiding the Weather column while the weather rules are still in the prompt, or showing the column while they are omitted.
- Reading tactical birth terrain off plan-state units. It is not there. Read `subUnits[].origin`.
- Treating "all of our units stand in mild weather" as the strategic weather gate. A unit can move into a hex that is not mild. The strategic gate is any hex on the map.
- Putting the clock or the briefing in the system message. Gemini will not cache a system message that has a dynamic tail, and the first user message must stay the fixed sentence or sticky routing misses.
- Marking a model as cache-unsupported because of a 400 that does not mention `cache_control`.
- Naming `estimate_combat` in the Odds explanation. Strategic briefings are not allowed to name that tool.
- Adding lines to `requestOrdersFlow.ts` until it passes 600.
- Keeping the old heading subsequence after the split. Tools and the response format come before the briefing in the joined text. That is the layout, not a test failure to "fix" by moving the briefing back into the system message.
- Resolving the Odds target by parsing the two-character code. The grouped row drops `targetH3` today. Carry the H3 through.
