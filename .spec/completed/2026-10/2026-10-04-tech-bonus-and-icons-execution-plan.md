# Tech Bonus and Icons Execution Plan

This is the execution plan. Do not put its phase numbers into product code, comments, tests, configuration, or docs.

## Locked decisions (from the questionnaire)

- Unit glyphs stay white on the existing colored circle tokens. Only the shapes change. Mixed-side gray tokens keep their dark glyphs.
- The mixed-type icon is the current `symbols/mixed-1.svg`, moved next to the new icons. The `symbols/` folder is then removed, including both electron-builder configs and [scripts/electron-builder-config.test.cjs](scripts/electron-builder-config.test.cjs).
- Tech Low: Advanced units add +2 to attack only, after the floor of 2, in the same slot as the origin bonus, capped at 17. Basic adds 0. Defense is unchanged.
- Tech High: Advanced units add +2 to attack and +2 to defense. Basic still adds 0.
- The AI gets the full treatment: a rules paragraph, `estimate_combat` effective values plus a `techBonus` field, `assess_unit` `techLevel`, and a tech note in the briefing Bonus cell.
- Advanced means the birth res1 hex's generated baseline urban count is 5 or more. The tier is fixed at birth and never follows later urban destruction. Units with no birth hex are Basic.

## Why these amounts

On d20, +2 is 10 percentage points. Advanced armor rises from 50% to 60% on clear ground; stacked with a High origin bonus it reaches 80% (hit number 16), still under the cap of 17. Infantry attack rises from 15% to 25%. High adds the same 10 points to Advanced defense (infantry 35% to 45%) and changes nothing about Basic, so the two settings stay easy to explain.

## Rules the implementer must follow

- Work the phases in order. Each phase ends with its own verify step, and later phases must keep earlier tests green.
- No phase, plan, or workflow identifiers in code, comments, tests, configuration, or docs.
- Orienting comments (Purpose, When to use, Expected outcome, Exceptions) on every new or changed field and non-overriding method. `logDebug` on new public main methods, `logTrace` on new getters, `logError` on caught exceptions. Shared and renderer code do not log.
- At most 6 named parameters. A function already over 6 does not gain another parameter. Files should stay under 600 lines and must stay under 1000. Do not add a new function to a file already over 600. The files already over that line are [src/main/tacticalBattle/tacticalStrategicOrderPhases.ts](src/main/tacticalBattle/tacticalStrategicOrderPhases.ts) (750), [src/renderer/rendering/terrainVisualStyles.ts](src/renderer/rendering/terrainVisualStyles.ts) (875), [src/main/briefingFormatter.ts](src/main/briefingFormatter.ts) (803), [src/main/tools/assessment.ts](src/main/tools/assessment.ts) (655), [src/main/combatResolution.ts](src/main/combatResolution.ts) (720), [src/main/gameActions/gameActionsCore.ts](src/main/gameActions/gameActionsCore.ts) (726), [src/main/gameDb.ts](src/main/gameDb.ts) (654), and [src/main/terrainClassificationCache.ts](src/main/terrainClassificationCache.ts) (675). [src/main/openRouter/promptSpec/gameRuleText.ts](src/main/openRouter/promptSpec/gameRuleText.ts) is at 593, so the new rule builder goes in a new file.
- New files follow the existing bonus names (`techBonusTypes.ts`, `techBonusRules.ts`). Do not add a `Helpers` or `Utils` suffix.
- Tests cover the happy path and the essential failure only. Never commit or push. Do not hand-edit `static/renderer.js`; `npm run build:renderer` rewrites it.
- Frozen strings stay frozen: existing `game_config` keys, IPC channels, tool names, and SQL columns. New keys are `tech_bonus_enabled` and `tech_bonus_level`.
- Every new field on an existing interface is optional, and a missing value means off or Basic. Existing object literals, IPC payloads, and test fixtures must keep compiling without adding the new field.

## Phase 1 â€” Pin current behavior

Add tests, before any change, that state what must not move:

- [src/main/combatHitThresholds.test.ts](src/main/combatHitThresholds.test.ts): a unit with no tech field hits at the printed value. Armor attack is 10. Armor with a weather penalty of 5 and cover of 2 is 3, then an origin bonus of 4 makes 7, because 10 − 5 − 2 stays above the floor of 2. Armor defense with cover stays 7.
- [src/main/openRouter/promptSpec/gameRuleText.test.ts](src/main/openRouter/promptSpec/gameRuleText.test.ts): with tech off, the combat paragraph has no tech sentence and the existing origin and weather wording is unchanged.
- [src/main/tools/combatEstimation.test.ts](src/main/tools/combatEstimation.test.ts): an estimate row has no `techBonus` key when the match has no tech setting.
- [src/shared/unitOriginTooltipText.test.ts](src/shared/unitOriginTooltipText.test.ts): with tech off, the tooltip has no Tech row.

Verify: `npm test` passes.

## Phase 2 â€” Assets

Extract only the SVGs, into three new folders under `static/`. Leave `symbols/` and the three zips in place, so the running app is unchanged until Phase 3.

- `static/tech/tech_advanced.svg`. Do not extract `tech_basic.svg`; the tooltip never shows Basic.
- `static/transport/road.svg` and `static/transport/rail.svg`.
- `static/units/infantry.svg`, `armor.svg`, `naval.svg`, and `air.svg` from the `*_currentcolor.svg` files. The human and AI files are the same paths with a different fill, so they are not extracted. Copy `symbols/mixed-1.svg` to `static/units/mixed.svg` unchanged.

Recolor the four extracted unit SVGs: replace `fill="currentColor"` with `fill="#ffffff"`. `drawImage` does not use the canvas fill, and an SVG loaded as an image resolves `currentColor` to black. Black glyphs would sit dark on the player circles, and the existing `brightness(0.133)` filter (mixed-side tokens and the new-game cap tokens) would crush them to near-black. `mixed.svg` is already white. Do not recolor the tech, road, or rail SVGs; they have their own fills.

Add a CSS class in [static/overlayChrome.css](static/overlayChrome.css) for the tech, road, and rail icons, at the same size as `.weather-icon`.

Verify: the four unit SVGs contain `#ffffff` and do not contain `currentColor`. `symbols/` is still referenced. `npm run build:renderer` succeeds.

## Phase 3 â€” Unit glyphs

In [src/renderer/rendering/unitDrawing.ts](src/renderer/rendering/unitDrawing.ts), point `UNIT_ICON_FILE_BY_TYPE` at `../units/` with the new names (`armor.svg` for armor, `air.svg` for air). Circles, player colors, the opponent horizontal flip, the mixed-side brightness filter, and the `?` unknown-battle marker all stay. Update the four `<img>` sources in [static/index.html](static/index.html) and the path in [doc/ui-style-guide.md](doc/ui-style-guide.md).

Then delete `symbols/`, drop it from [electron-builder.config.cjs](electron-builder.config.cjs), [electron-builder.ci.cjs](electron-builder.ci.cjs), and [scripts/electron-builder-config.test.cjs](scripts/electron-builder-config.test.cjs), and delete the three zips from `static/`. Electron-builder packs the whole `static/` directory, so a leftover zip would ship in the app. The zips are untracked; the extracted SVGs are the runtime copies.

Verify: a search finds no `symbols/` reference. `npm run build:renderer`, then `npm start`. A human stack shows the new white glyph on the teal circle, and an AI stack shows it on the magenta circle. The new-game cap tokens stay dark glyphs on the gray disk.

## Phase 4 â€” Urban swatch and road/rail icons

New shared helpers, following [src/shared/weatherIcons.ts](src/shared/weatherIcons.ts): `formatUrbanSwatchHtml` and `formatTransportIconsHtml({ road, rail })`. Urban is not a pipeline terrain kind. Do not add it to `PIPELINE_TERRAIN_KINDS` or to `DISPLAY_LABEL_TO_KIND`. A leading word `Urban` in `formatTerrainNameTokenHtml` calls `formatUrbanSwatchHtml` and then escapes the rest of the token.

- Legend row: new [src/renderer/rendering/terrainLegendUrban.ts](src/renderer/rendering/terrainLegendUrban.ts) appends one Urban row after the eight kinds. Do not move the existing swatch table out of [src/renderer/rendering/terrainVisualStyles.ts](src/renderer/rendering/terrainVisualStyles.ts). `renderTerrainLegend` calls the new function after its loop, and `paintTerrainSwatches` uses the new color when `data-terrain-kind` is `urban`. The chip is one opaque color per style, taken from that style's `urbanOverlayFill` with the alpha removed: default `#827060`, atlas `#8d7a67`, wargame `#847061`, scientific `#897562`. The chip is not hatched. The map hatch is unchanged.
- Surfaces that already call `formatTerrainNameListHtml` then show the chip with no further edits: blocked tooltip, slower line, effects line, and the Cover line. The hex tooltip's `, Urban` suffix in [src/renderer/map/terrainTooltipHtml.ts](src/renderer/map/terrainTooltipHtml.ts) is escaped plain text today, so that suffix must use the swatch helper. Rubble stays plain text in that suffix.
- Road and Rail words are the res4 Features labels built in `featureLabelsForRes4Child` ([src/renderer/map/terrainTooltipRes1State.ts](src/renderer/map/terrainTooltipRes1State.ts)), then joined as plain text in `formatTerrainTooltipHtml`. The res1 features summary (Airports, Seaports, Rubble) does not name roads. Icon `Road` and `Rail` in that Features join, and escape Airport, Seaport, and Rubble as they are now.
- The march impact boolean `roadRail` stays, with the same meaning, on `OrderPreviewTerrainImpact` and every consumer. Do not replace it. Add optional `road` and `rail` flags beside it. `collectTacticalMarchTerrainImpact` sets a flag when a step uses the line rate: any rail side on that destination cell counts as rail (rail wins on a cell, matching `destinationLineBudgetMultiplier`), otherwise a road side counts as road. A path that uses both sets both flags. [src/shared/humanMarchPreviewGroupAssembly.ts](src/shared/humanMarchPreviewGroupAssembly.ts) ORs the new flags the way it ORs `roadRail`. [src/shared/tacticalMarchHoverPreview.ts](src/shared/tacticalMarchHoverPreview.ts) passes the flags through.
- Both HTML Using lines, in [src/shared/orderPreviewEffectsTooltip.ts](src/shared/orderPreviewEffectsTooltip.ts) and `formatOrderPreviewImpactHtml`, call `formatTransportIconsHtml`. A true `rail` flag shows the rail icon and the word Rail; a true `road` flag shows the road icon and the word Road. When only the old boolean is set, show both icons and both words, so an older payload still has a Using line. Plain-text helpers keep the literal `Road/Rail`.
- Update the expected HTML in [src/shared/terrainSwatchHtml.test.ts](src/shared/terrainSwatchHtml.test.ts) and [src/main/orderPreviewEffectsTooltip.test.ts](src/main/orderPreviewEffectsTooltip.test.ts). The test that expects the exact string `<strong>Using:</strong> Road/Rail` changes to the icon markup. Do not weaken the assertion to make the old string pass.

Verify: `npm test` and `npm run build:renderer`. The legend has a ninth Urban row. A cell tooltip shows the chip before Urban and an icon before Road or Rail. A battle march along a road shows the road icon on the Using line and does not show the rail icon.

## Phase 5 â€” Tech vocabulary and persistence

New `src/shared/techBonusTypes.ts` and `src/shared/techBonusRules.ts`:

- `TechLevel = 'basic' | 'advanced'`, `TECH_ADVANCED_MIN_URBAN_HEX_COUNT = 5`, `techLevelForUrbanHexCount(count)` (5 or more is Advanced, anything under is Basic, a missing count is Basic).
- `TECH_HIT_BONUS = { attack: 2, defense: 2 }`. `techAttackBonus(level, bonusLevel)` and `techDefenseBonus(level, bonusLevel)`: both 0 when off or Basic; attack 2 at Low and High; defense 2 only at High.
- `techBonusEnabled` and `techBonusLevel` are optional fields on `OriginBonusSettings`, `GameStateSnapshot`, `TacticalBattleSnapshot`, `NewGameIpcPayload`, and `ResetGameForNewMatchOptions`. Do not add a second settings type, and do not add a required field to `GameRuleTextGates`. `originBonusSettingsFromLevels` takes an optional `tech` and treats a missing one as off, so every current caller keeps compiling. `originBonusSettingsFromSnapshot`, `persistOriginBonusSettings`, and `readPersistedOriginBonusSettings` grow the two keys. A missing `tech_bonus_enabled` row reads as off, so a match saved before this change plays with no tech bonus. A present flag with a missing level reads as low.
- The new-game plumbing follows the existing bonus path exactly: [src/renderer/gameplay/newGameOptionsUi.ts](src/renderer/gameplay/newGameOptionsUi.ts), [src/main/main.ts](src/main/main.ts) `game:newGame`, [src/main/gameDb/resetGame.ts](src/main/gameDb/resetGame.ts), and the snapshot assembly in [src/main/gameDb/fogState.ts](src/main/gameDb/fogState.ts).

Verify: a test that a missing `tech_bonus_enabled` row reads as off, and that High persists and reads back. `npm run build:main`.

## Phase 6 â€” Stamping the tech level

The pure rule `techLevelForUrbanHexCount` stays in shared code and does not touch the cache. The cache read lives in main: `techLevelForBirthHex(birthH3Index)`. It reads the generated baseline through `getRes1ProductionContext` ([src/main/terrainClassificationCacheSerialization.ts](src/main/terrainClassificationCacheSerialization.ts)). Do not read `getRes1InfrastructureForHex` or `res1_infrastructure.urban_hex_count`; those fall when an air strike destroys urban cells, and tech is fixed from the birth baseline. If `isTerrainClassificationCacheLoaded()` is false, or the birth hex is missing, return `basic` and do not throw. `getRes1ProductionContext` throws on an empty cache, so the guard has to run first. Combat tests that never load terrain metadata must keep passing.

Stamp `techLevel` on snapshot units in [src/main/gameDb/fogState.ts](src/main/gameDb/fogState.ts) and on tactical sub-units in [src/main/tacticalBattle/computeTacticalBattleSnapshot.ts](src/main/tacticalBattle/computeTacticalBattleSnapshot.ts), beside the `weatherTags` stamping, only while the tech bonus is on. Sub-units use the parent origin. The stamp is for the tooltip and the AI tools. Dice do not read it, because `listUnitsForSnapshot()` does not carry snapshot-only fields; Phase 7 computes the level again from `origin.birthH3Index` with this same function.

Verify: `techLevelForUrbanHexCount(5)` is `advanced`, `techLevelForUrbanHexCount(4)` and a null count are `basic`, and `techLevelForBirthHex` returns `basic` without throwing when the cache is not loaded.

## Phase 7 â€” Dice

Add `techAttackBonus?` and `techDefenseBonus?` to `HitThresholdUnit` and `CombatUnit`. In [src/main/combatHitThresholds.ts](src/main/combatHitThresholds.ts):

```ts
Math.min(MAX_HIT_THRESHOLD,
  Math.max(MIN_ATTACK_HIT_THRESHOLD, printed - penalty - cover) + (originHitBonus ?? 0) + (techAttackBonus ?? 0))
```

Defense adds `techDefenseBonus` next to the origin bonus. The floor still happens before both bonuses, and 17 still caps the result.

New [src/main/techBonus/techHitBonusLookup.ts](src/main/techBonus/techHitBonusLookup.ts), mirroring [src/main/originBonus/originHitBonusLookup.ts](src/main/originBonus/originHitBonusLookup.ts). `TechHitBonusLookup = (unitId) => { attack, defense }`, `noTechHitBonus`, and `withTechHitBonus(units, lookup)`. `createTechHitBonusLookup` takes `{ settings, units, urbanHexCountAt }`. Each unit supplies `id` and `origin`; the count function is `(birthH3Index) => number | null`. The production caller passes the cache reader from Phase 6. Tests pass a stub, so they do not load terrain metadata. The lookup is keyed by unit id only. Never derive tech from the hex where the unit stands or from a melee target. A missing origin, a Basic result, or the tech option off returns zeros and `withTechHitBonus` omits the keys, so bonus-free rows stay comparable.

Build the lookup once, next to `originHitBonusAt`, and reuse that function for the rest of the step. Array phases call `withTechHitBonus` once: the ranged and melee arrays in [src/main/gameActions/readyStrategicResolutionPipeline.ts](src/main/gameActions/readyStrategicResolutionPipeline.ts) (the melee array is what intercept resume rolls, so it has to be stamped before the pause), `tacticalSubUnitsToRangedCombatUnits`, and the melee array in [src/main/tacticalBattle/tacticalMeleeApply.ts](src/main/tacticalBattle/tacticalMeleeApply.ts). Do not stamp a unit a second time at the threshold.

Inline `attackHitThreshold({...})` sites pass the lookup numbers and do not read a pre-stamped field. That is the two sites in `tacticalStrategicOrderPhases.ts` (the infrastructure shot near line 584 and the infrastructure air strike near line 382) and the two in [src/main/tacticalBattle/tacticalAirStrikeUnits.ts](src/main/tacticalBattle/tacticalAirStrikeUnits.ts) (lines 187 and 218). Add `techHitBonusAt` to the existing `TacticalAirStrikeOnUnitsInput` object. Do not add a positional parameter, and do not add a new function to `tacticalStrategicOrderPhases.ts`.

`resolveAirStrikePhase` gains an optional 5th parameter, `techHitBonusAt = noTechHitBonus`, so every current caller still compiles. Its private `resolveAirStrikeAgainstUnits` already has 6 parameters. Replace that function's `originHitBonusAt` parameter with one object `{ originHitBonusAt, techHitBonusAt }`, so it stays at 6. Do not modify `resolveAirStrikeAgainstInfrastructure`. It already has 7 parameters, and infrastructure counter-fire stays `INFRASTRUCTURE_COUNTER_FIRE_THRESHOLD` with no tech and no origin bonus. Unit counter-fire does get the tech attack bonus. Casualty order and the air-strike victim pick keep printed defense.

Verify: the Phase 1 threshold tests still pass. New tests: Advanced at Low is armor attack 12 and defense 7; Advanced at High is attack 12 and defense 9; Basic at High is unchanged; a contrived attack sum over 17 returns 17. A real armor unit with High origin and High tech lands on 16, which is under the cap, so do not write the cap test against a real unit.

## Phase 8 â€” New-game dialog

In [static/index.html](static/index.html) and [static/feedbackChrome.css](static/feedbackChrome.css): move the Fog of war checkbox out of `.game-over-options` into `.game-over-start-month`, to the left of the Starting month label, and add a Tech bonus dropdown (Off, Low, High, default Low) at the right end of the options row. `NEW_GAME_BONUS_LEVEL_SELECT_IDS` in `newGameOptionsUi.ts` gains the new id, so read and reset both pick it up. Update [doc/ux/new-game-dialog.md](doc/ux/new-game-dialog.md).

Verify: `npm run build:renderer`, then `npm start`. The options row reads Country, Terrain, Weather, Tech, all on Low; the next row reads Fog of war, then Starting month.

## Phase 9 â€” Unit tooltip

`formatUnitOriginTooltipHtml` gains an optional `techLevel`. When it is `advanced`, append a row `Tech:` plus the advanced icon and the word `Advanced`, after Weather. Basic, off, and absent show nothing, so a unit with no bonuses still collapses to `None`.

Thread it from [src/renderer/core/unitOriginFlags.ts](src/renderer/core/unitOriginFlags.ts) the way `weatherTags` is threaded. `rememberUnitOrigins` stores the level by birth hex next to `weatherTagsByBirthHex`. The reader checks the battle sub-unit, then the strategic unit, then that map, so a loss toast still works after the unit is gone and a battle label still works for a sub-unit id. Update [doc/ux/stack-callout.md](doc/ux/stack-callout.md).

Verify: the tooltip test shows the Tech row only for an Advanced unit. A Basic unit, and an Advanced unit with the field omitted, have no Tech row.

## Phase 10 â€” AI reporting

- `buildTechBonusRule(gates)` lives in a new file next to [src/main/openRouter/promptSpec/gameRuleText.ts](src/main/openRouter/promptSpec/gameRuleText.ts), and `buildCombatRulesParagraph` calls it after the origin sentence. It reads the optional tech fields on `gates.originBonusSettings` and returns null when tech is off, so existing gate fixtures compile and stay byte-for-byte unchanged. At Low the sentence says an Advanced unit adds 2 to its attack value, Basic units add nothing, defense is unchanged, and casualty order still uses the printed defense. At High it says an Advanced unit adds 2 to attack and 2 to defense, and casualty order is still the printed defense.
- `assess_unit` gains `techLevel` (`basic` or `advanced`) only while the option is on. The field object is built by a shared helper and spread into the unit block. Do not add a new function to [src/main/tools/assessment.ts](src/main/tools/assessment.ts). The tactical block in [src/main/tools/tacticalAssessUnit.ts](src/main/tools/tacticalAssessUnit.ts) spreads the same helper. In [src/main/openRouter/tacticalBriefingAssessments.ts](src/main/openRouter/tacticalBriefingAssessments.ts), compute it per sub-unit in both the primary assessment and `cloneTacticalAssessmentForStackedUnit`. Stacked units can be born in different hexes, so copying the cached unit's level is wrong.
- `estimate_combat`: the theater in [src/main/tools/combatEstimationTheater.ts](src/main/tools/combatEstimationTheater.ts) carries a `techHitBonusAt` lookup. [src/main/tools/combatEstimationSides.ts](src/main/tools/combatEstimationSides.ts) stamps both bonuses on real attackers and real defenders before the threshold calls, and not on assumed units. A real unit with a non-zero attack or defense bonus adds `techBonus`. At Low that is `{ attack: 2, defense: 0 }`. At High it is `{ attack: 2, defense: 2 }`. Omit the key when both are 0. `attackValue` and `defenseValue` stay the effective numbers, so a Low estimate must not raise defense.
- The Bonus cell text is formatted in `techBonusRules.ts`, and [src/main/briefingFormatter.ts](src/main/briefingFormatter.ts) only calls it. Do not add a function to that file. The column appears when any row has origin reasons or a `techLevel`. Every row then has a Bonus cell, so the table stays rectangular. An Advanced unit at Low appends `tech +2 attack`. At High it appends `tech +2 attack and defense`. A Basic unit with no origin bonus reads `â€”`. Both the strategic path ([src/main/precomputation.ts](src/main/precomputation.ts)) and the tactical path supply the level.

Verify: `npm test` and `npm run build:main`. One prompt test asserts the Low sentence, the High sentence, and that the paragraph is unchanged when tech is off. One estimate test asserts Low armor attack 12 with defense still 7 and `techBonus.defense` 0.

## Phase 11 â€” Docs

Update in place, no new doc files:

- [doc/combat-rules-v3.md](doc/combat-rules-v3.md) Â§4.9: the hit formula gains `+ tech bonus`, and a new "Tech bonus" subsection states the cutoff of 5, the Low and High amounts, the birth-baseline rule, and the rolls it does and does not change.
- [doc/ai-tools.md](doc/ai-tools.md), [doc/ai-commander-prompts/strategic-prompt.md](doc/ai-commander-prompts/strategic-prompt.md), [doc/ai-commander-prompts/tactical-prompt.md](doc/ai-commander-prompts/tactical-prompt.md), [doc/ai-commander-prompts/source-inventory.md](doc/ai-commander-prompts/source-inventory.md), [doc/ai-commander-prompts/variants.md](doc/ai-commander-prompts/variants.md) (a new section 10), [doc/ai-commander-prompts/crosswalk.md](doc/ai-commander-prompts/crosswalk.md), [doc/region-vs-region.md](doc/region-vs-region.md), and the mechanics index in [doc/README.md](doc/README.md).
- [doc/ux/terrain-legend.md](doc/ux/terrain-legend.md) and [doc/ux/hex-tooltips.md](doc/ux/hex-tooltips.md) for the Urban chip and the road and rail icons.

## Phase 12 â€” Final verification

`npm test`, `npm run build:main`, `npm run build:renderer`, `npm run check:circular`, `npm run check:renderer-types`. Then `npm start` and play one turn at Low and one at High. An Advanced unit's flag tooltip shows the Tech row, and a Basic unit's does not. A combat estimate for Advanced armor reads attack 12 and defense 7 at Low, and attack 12 and defense 9 at High. A unit born in a hex whose urban cells were later destroyed is still Advanced.

## Out of scope

Rubble swatches, the map's urban hatch, movement and range changes, production changes, casualty order, infrastructure counter-fire, and replacing the `roadRail` boolean. Plain-text toasts stay plain text; icons belong to HTML tooltips and popups.

