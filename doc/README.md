# Living documentation (`doc/`)

Authoritative product and mechanics documentation for Agent Wars. **The engine under `src/` is first authority.** If a number, phase order, cap, range, or legality rule here disagrees with a symbol in code, the code is correct and this folder should be updated.

Shipping version as of this writing: **2.22.0** (`package.json`). Phase 0 (hybrid AI) and Phase 1 (global strategic game) are complete. Phase 2 is complete through milestone **2.5** (regional game and rules enhancements), including tactical battles (2.1 to 2.4) and playtester UI fixes (2.45).

Release **2.6.0** redesigns the layout: a top bar, a console docked on the right, a selection panel on the map, and a new-game panel docked at the left.

Release **2.8.0** adds matches of two to four sides, each AI side with its own commander.

Release **2.8.1** lines up the commander popover and collapses the console when a match starts.

Release **2.8.2** puts hex changes in each side's turn report and opens the new-game screen at the top.

Release **2.8.3** keeps that report to the hexes each side lost.

Release **2.8.4** replaces an unreadable short home name with a letter form of that name.

Release **2.8.5** names who holds a hex with each side's short name.

Release **2.9.0** adds player-facing save and load: a match can be written to an `.agentwars` file and opened again, and the last five turn starts are kept automatically. See [save-files.md](save-files.md) and [ux/save-and-load.md](ux/save-and-load.md).

Release **2.10.0** adds ballistic missiles.

Release **2.12.0** adds fortifications, a credit treasury, and mercenary hiring, and a missile destroys a cell on a roll of 10 or less.

Release **2.13.0** lets an observing match fight tactical battles with AI commanders, frames the visible units while turns advance on their own, names strategic units destroyed in a battle, and names the app to OpenRouter on chat and model-list requests.

Release **2.14.0** lets you name your side and each opponent, draws lines to the units an observing commander could see, shows your unit counts from the top bar, and keeps units that would trade hexes from slipping past each other.

Release **2.15.0** lets each commander choose an OpenRouter host, gives a model call twice as long before it times out, and shows each commander's think time on the result screen.

Release **2.16.0** shortens commander prompts, lists the odds of each fight the briefing already shows, stops planning after 20 tool rounds and asks once more for orders, and marks a knocked-out side with the turn in parentheses.

Release **2.17.0** lets an air unit carry one infantry unit, drop it within strike range, or ferry it through your airports, and shows Kill, Hurt, and Loss for a ranged shot.

Release **2.22.0** discards a paused queue's production points at the end of the turn. A queue that is still building keeps the points it could not spend. The pause is outside your home with none of your units or fortifications on the hex, a city whose cells are all fortified, or a unit type at its cap. The turn report names that queue on the turn it pauses. A build-only popup is 200 px wide, and hire goes to 280 px.

Release **2.21.3** puts a side's visible missile strikes on one line and its fortification hits on one line, both naming the hexes by code. A battle beat has the fortification line and no missile line. A commander is shown up to ten prior turns of notes.

Release **2.21.2** waits one extra zoom level before a country name appears, and shows a state or province name when that area is large enough on screen. Continent names grow while country names are on the map, and country names grow in the close view that draws states. A larger name moves off a smaller one and returns when its original spot is clear. Continent names drawn with countries, and national borders, are four fifths strength. Country names drawn with states, and state borders, are three fifths.

Release **2.21.1** lets an AI-only battle stop after a chosen number of beats, 30 unless you pick another. Unlimited removes that limit, and None turns it off. Reaching it ends the battle and shows how many beats it ran. While turns advance on their own, that notice stays for 3 seconds. While you watch every side, Production and Forces add up the sides still playing. Fog of war, Sight cues, and Auto-start AI sit together under Other.

Release **2.21.0** draws the map from a shaded-relief pack on this computer, draws land with more contrast so mountains read more clearly, and classifies monthly weather from CHELSA V2.1 1981–2010, including ocean hexes. Four map themes recolor land, water, roads, and rails. A hairline follows coasts and lake shores, national borders and country names appear together, and the detail view adds state borders and state names. A city hides a state name it shares. While the new-game screen is open, names and borders follow that preview. A save still opens, and its weather follows this climate.

Release **2.20.0** removes a vertical line of city cells that a new game drew down the 180° meridian. Those cells were counted as cities because the map seam wrapped them across the world. A new game on Australia & New Zealand or Eastern Europe uses the corrected city counts. A save keeps the city cells and prices it was created with.

Release **2.19.0** draws each commander's strategic map around its units, visible enemies, cities, and listed targets, groups idle build hexes by what they can still queue, turns a move past this turn's budget into a march when standing orders are on, and holds a unit ordered onto its own cell. A battle that crosses the 180° meridian draws as one area. Starting the game again brings the open window to the front, and preparing a commander's briefing freezes the window less.

Turn replay is not built. Later polish, diplomacy, and async multiplayer remain unbuilt.

## How to read `doc/`

| Document | Role | Status |
| --- | --- | --- |
| [how-to-play.md](how-to-play.md) | Player guide, in this order: winning and losing, setup on global and regional maps, saving and loading, controls, turn order, a units table, building, credits and hiring, fortifications, targeting, air power, ballistic missiles, sealift, battles with roads and rail, unit bonuses, common surprises, and messages | **Current UI.** Downloads and the OpenRouter key are under Play it in the root [README.md](../README.md). Per-surface detail is in [ux/](ux/). |
| [save-files.md](save-files.md) | How a match is written to an `.agentwars` file and opened again, including what the file omits, the version rule, and the exclusive lock on the open match file | **Current.** Matches `EXPECTED_USER_VERSION`, `MACHINE_LOCAL_CONFIG_KEYS`, and `applyGameDbPragmas`. |
| [combat-rules-v3.md](combat-rules-v3.md) | Combat, movement, production, fog, sealift, and tactical battles | **Current mechanics.** Numbers are taken from engine constants. |
| [game-size-unit-caps.md](game-size-unit-caps.md) | Small / Medium / Large per-side caps | **Current.** Matches `getMaxUnitsPerType`. |
| [region-vs-region.md](region-vs-region.md) | Shipped scenario, home regions, win evaluation | **Current.** Matches `decideEndOfTurnOutcome`. |
| [hybrid-ai.md](hybrid-ai.md) | Hybrid opponent loop, callbacks, consult bounds | **Current engine behavior.** Prompt copy lives in the prompt package. |
| [ai-tools.md](ai-tools.md) | The six tool groups the model (and host) can invoke | **Current.** Names from `PATHFINDING_TOOL_NAMES` and sibling `*_TOOL_NAMES` consts. |
| [terrain-pipeline.md](terrain-pipeline.md) | What the app loads from `data/generated/` | **Current runtime.** Regeneration runbooks stay in [scripts/terrain_pipeline/README.md](../scripts/terrain_pipeline/README.md), [scripts/weather_pipeline/README.md](../scripts/weather_pipeline/README.md), and [scripts/naming_pipeline/README.md](../scripts/naming_pipeline/README.md). The match hillshade is built by [scripts/basemap_pipeline/README.md](../scripts/basemap_pipeline/README.md) into `data/generated/basemap/` and loaded through the `agentwars-basemap` protocol. Data, flag, and library credits are in [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) at the repository root. |
| [match-video.md](match-video.md) | How a recorded match is shortened: audio removed, frozen stretches cut to a still buffer | **Current tool.** `scripts/condense_match_video.py`. The output stays outside the game. |
| [game-vision-v2.md](game-vision-v2.md) | Product intent and why the game is shaped this way | **Intent, with an implementation-status note.** Where a roster, fog, or phase claim disagrees with the engine, the combat rules (and the code) win. |
| [ui-style-guide.md](ui-style-guide.md) | Map-first UI character, chrome, and interaction | **Target aesthetic plus an implementation-status note.** Save and load are live. Unbuilt surfaces (diplomacy, async multiplayer) are marked. |
| [naming-conventions.md](naming-conventions.md) | How files, directories, and exported symbols are named | **Living index.** Points at the contract and the signed rename ledger. |
| [naming-conventions-contract-v1.md](naming-conventions-contract-v1.md) | Casing, role suffixes, frozen string values, and the reviewer checklist | **Current rules.** When this file and an identifier disagree, fix the identifier. |
| [ai-commander-prompts/](ai-commander-prompts/README.md) | What the AI opponent's model is told today | **Current emission.** Builders under `src/main/openRouter/` win if this package drifts. Prompt copy is not game-rule authority; the engine is. |
| [releasing.md](releasing.md) | How a version becomes a GitHub release: version bump, notes, Build workflow, smoke test, publish | **Current procedure.** Matches `.github/workflows/build.yml`. |
| [release-notes/](release-notes/) | One notes file per release, used as the release body | **Per release.** The draft-release job reads `release-notes/v<version>.md`. |
| [devleopment-plan-v3.4.md](devleopment-plan-v3.4.md) | Original phased roadmap (filename keeps the historical spelling) | **Historical plan** with a current-progress header. Milestone writeups inside it are not live rules. |
| [poc-analysis.md](poc-analysis.md) | Phase 0 latency/cost research that justified the hybrid AI | **Historical research.** The hybrid pattern it recommended is now the live architecture. |
| [market-research.md](market-research.md) | 2025–2026 market landscape | **Dated research.** Not a mechanics or shipping-status document. |

## Engine constants these docs must track

When you change one of these, update [combat-rules-v3.md](combat-rules-v3.md) (and any table that quotes it) in the same change:

| Topic | Symbol |
| --- | --- |
| Attack / defense / strategic move / strategic range | `src/main/combatConstants.ts`, `src/shared/rangePerimeterModel.ts` |
| Die size, hit-number floor and cap, infrastructure counter-fire | `src/main/combatDice.ts` |
| Terrain cover by target terrain | `TERRAIN_COVER_BY_CATEGORY` and `URBAN_OR_RUBBLE_TERRAIN_COVER` in `src/shared/terrainCoverRules.ts` |
| Unit costs and build prerequisites | `unitCostFor` and `buildMinimumUrbanCells` in `src/shared/gameRules.ts`. The global column is copied into `src/shared/productionConfig.ts` and `src/main/productionRules.ts`. Regional costs, minimums, strike size, `missile_cost`, and `missile_range_hexes` come from the loaded map's manifest. A fortification costs `fortificationCostPerCell()` (infantry cost times `FORTIFICATION_COST_INFANTRY_MULTIPLIER` in `src/shared/fortificationRules.ts`). A credits item costs `creditsItemCost()` (the active map's infantry price times `CREDITS_ITEM_INFANTRY_MULTIPLIER` in `src/shared/creditsRules.ts`) and adds `CREDITS_PER_ITEM` (20) on every map. Mercenary upkeep is `mercenaryUpkeepFor` from `mercenaryReferenceCost` on the global map, divided by `MERCENARY_UPKEEP_DIVISOR` (8) in `src/shared/mercenaryRules.ts`. Advanced birth hexes use `MERCENARY_ADVANCED_TECH_MULTIPLIER` (2). A rehire fee is `MERCENARY_REHIRE_FEE_MULTIPLIER` (2) times upkeep. Raise capacity is `MERCENARY_RAISE_CAPACITY_MULTIPLIER` (2) times the hex's city cells, measured against `unitCostFor`. |
| Armor stop and strategic city or rugged cover | `armorMoveEndsOnHex` and `strategicTerrainFlagsFor` in `src/shared/strategicTerrainFlags.ts`. Cover columns are in `terrainCoverPairFor` in `src/shared/terrainCoverRules.ts`. |
| Loaded map extent | `mapExtentBoxForHexes`, `loadedMapExtentKey`, and `shouldApplyLoadedMapExtent` in `src/shared/mapExtent.ts`. Start frames the extent immediately. A later snapshot does not, while that footprint is unchanged. An automatic watch frames visible units with `UNIT_FRAME_PAD_HEXES` and `unitFrameBox` in `src/shared/unitFrameBox.ts`. Player framing is in [ux/map-surface.md](ux/map-surface.md). The renderer applies the loaded extent from `src/renderer/map/mapExtent.ts` and that camera from `src/renderer/map/unitFrameCamera.ts`. |
| Per-side caps by game size | `src/shared/productionConfig.ts` (`MAX_UNITS_PER_TYPE`), `src/shared/gameSize.ts` |
| Fog vision radii | `VISION_RANGE_BY_UNIT_TYPE` in `src/main/visibility.ts` |
| Origin bonus size and matching | `ORIGIN_HIT_BONUS_BY_LEVEL` and `originBonusSources` in `src/shared/originBonusRules.ts` |
| Weather bonus amounts by level | `WEATHER_SLOWING_STATES`, `TACTICAL_WEATHER_BUDGET_CAP`, and `WEATHER_ATTACK_PENALTY_BY_LEVEL` in `src/shared/weatherBonusRules.ts` |
| Tech bonus cutoff and amounts | `advancedTechMinUrbanCells` in `src/shared/gameRules.ts` (21 on the global map). `TECH_ADVANCED_MIN_URBAN_HEX_COUNT` and `TECH_HIT_BONUS` in `src/shared/techBonusRules.ts` keep the global cutoff and the bonus amounts. |
| Match date (global month and year, or regional week) | `gameDateForTurn` and `formatGameDateForTurn` in `src/shared/gameCalendar.ts` |
| Weather tags, movement, and attack penalties | `src/shared/weatherBonusRules.ts` |
| Tactical ranged and movement budgets | `src/shared/tacticalRanges.ts` |
| Tactical terrain enter costs | `tacticalEnterHexMovementCost` in `src/shared/tacticalTerrainMovement.ts` |
| Tactical terrain-bonus movement | `terrainBonusMarchCategoryFor` in `src/shared/terrainBonusMarch.ts` (who may stop on which birth terrain), `classifyTacticalMarchStep` in `src/shared/tacticalMarchStepCost.ts`, and `preferFasterTerrainBonusMarch` in `src/shared/tacticalMarchBeatSearch.ts` (fewer-beats route choice) |
| Tactical combat modifiers (LOS, range caps, MP) | `src/shared/tacticalTerrainCombatModifiers.ts` |
| Strategic and tactical H3 resolutions | `strategicH3Resolution` and `tacticalH3Resolution` in `src/shared/h3Resolutions.ts`. On the global map those are 1 and 4 (`GLOBAL_STRATEGIC_H3_RESOLUTION`, `GLOBAL_TACTICAL_H3_RESOLUTION`). A regional map uses strategic resolution 2 or 3 and tactical resolution 5 or 6. |
| Sub-unit multiplication | `tacticalSubUnitCountForStrategicUnitType` in `src/main/tacticalBattle/computeTacticalBattleSnapshot.ts` |
| Resolution phase order | `executeReadyStrategicTurn`, `buildResolutionOrderRule` |
| Missile range, cell hit number, and launch timing | `missileRangeHexes` in `src/shared/gameRules.ts`, `getAttack('air')` in `src/main/combatConstants.ts`, and `resolveMissileLaunchPhase` in `src/main/gameActions/missileLaunchResolution.ts`. A set flag or a fortification is destroyed when its d20 is at or below that attack. Launches run after embark and before air strikes. |
| Dice chip line and face limits (quoted in [ux/resolution-playback.md](ux/resolution-playback.md), not in the combat rules) | `COMBAT_DICE_CHIP_MAX_LINES` and `COMBAT_DICE_ROW_MAX_FACES` in `src/shared/combatDiceChips.ts` |
| Seat limits and seat ids | `MIN_SEATS`, `MAX_SEATS`, `AI_SEAT_IDS`, `HUMAN_SEAT_ID`, `NEUTRAL_OWNER_ID` in `src/shared/seatIds.ts` |
| Win rules, knockout, and places | `decideEndOfTurnOutcome` in `src/main/gameActions/endOfTurnOutcomeRules.ts`, `TURN_LIMIT_OPTIONS`, `DEFAULT_TURN_LIMIT`, `victorySettingsForRequest`, and `DEFAULT_VICTORY_RULE` in `src/shared/victoryRules.ts` |
| AI-only battles | `selectAiOnlyBattle`, `aiOnlyBattlesForRequest`, and `aiOnlyBattlesFromStored` in `src/shared/aiOnlyBattles.ts`. The offer is `buildAiOnlyBattleOffer`. End reasons are `applyAiOnlyTacticalBeat`. The beat cap is `aiOnlyBeatLimitReached` in `src/shared/aiOnlyBeatLimit.ts`. The beats still ahead are `aiOnlyBeatsLeft`, crimson at `AI_ONLY_BEATS_LEFT_URGENT_AT`, and the situation sentence is `formatAiOnlyBeatsLeftPrompt`. A start request is `aiOnlyBeatLimitForRequest`. A stored row is `aiOnlyBeatLimitFromStored`. The parties are `tacticalBattlePartiesForOwners`. |
| Head-on contact | `resolveHeadOnContacts` in `src/shared/headOnContact.ts`. Strategic turns use `withoutStrategicHeadOnHolderMoves`. Battle beats use `withoutTacticalHeadOnHolderMoves`. The held cell is `createHeadOnInitiativePicker`. |

Prompt-generating code is catalogued in [ai-commander-prompts/](ai-commander-prompts/README.md). That package describes today's emitted prompts and answers to the same engine symbols; it does not invent stats. How the consult is scheduled and which tools exist: [hybrid-ai.md](hybrid-ai.md) and [ai-tools.md](ai-tools.md).

Consultation deadlines live in `src/shared/aiConsultationLimits.ts` (`AI_MODEL_REQUEST_TIMEOUT_MS`, `AI_CONSULTATION_WALL_CLOCK_MS`, `AI_CONSULTATION_WAIT_TIMEOUT_MS`). When one of those changes, update [hybrid-ai.md](hybrid-ai.md) in the same change.

The campaign objective uses `CAMPAIGN_MAX_LAND_STEPS`, `CAMPAIGN_STAGING_MIN_STEPS`, `CAMPAIGN_ENEMY_HOME_WEIGHT`, and `CAMPAIGN_FORTIFICATIONS_PER_PENALTY_STEP` in `src/main/openRouter/campaignTargetSelection.ts`, and `CAMPAIGN_REACH_LIMIT_STEPS`, `CAMPAIGN_MASS_RADIUS`, `CAMPAIGN_ASSAULT_MIN_UNITS`, `CAMPAIGN_HOME_DEFENSE_RADIUS`, `CAMPAIGN_HOME_DEFENDER_MAX_SHARE`, and `CAMPAIGN_CONTACT_RADIUS` in `src/main/openRouter/campaignRules.ts`. A city is exposed for the production briefing at `PRODUCTION_EXPOSED_RADIUS` in `src/main/openRouter/productionExposure.ts`. When one of those changes, update [hybrid-ai.md](hybrid-ai.md) in the same change.

Save files follow `EXPECTED_USER_VERSION` in `src/main/gameDb.ts` and `MACHINE_LOCAL_CONFIG_KEYS` in `src/main/gameDb/machineLocalConfigKeys.ts`. When either changes, update [save-files.md](save-files.md) in the same change.

The match hillshade is `resolveBasemapTile` in `src/main/basemap/basemapTileResolve.ts`, `game:basemapNativeZoom` in `src/main/basemap/basemapIpc.ts`, and `MAP_THEMES` and `mapThemeById` in `src/shared/mapThemes.ts`. Coastlines, borders, and place names are `readBasemapVectorText` in `src/main/basemap/basemapVectorRead.ts`, served on `game:basemapVectorDocument`. Their zoom gates are `visibleLabelKinds` in `src/shared/mapLabelRules.ts` and `adminBorderGroupsForView` in `src/shared/adminBorderRules.ts`. Which features of a visible kind qualify is `labelFeatureIsCandidate` in `src/shared/mapLabelPlacement.ts`. Which view they use is `annotationViewIsDetail` in `src/shared/mapLabelRules.ts`, read through `mapAnnotationsUseDetailView`. A state name that matches a city in view is dropped by `withoutStatesNamedForCities` in `src/shared/mapLabelCityNames.ts`. Name strength is `labelKindOpacity` in `src/shared/mapLabelRules.ts`. Border strength is `borderLineOpacity` in `src/shared/adminBorderRules.ts`. A broader name moves off the smaller names by `nudgeBroadLabels` in `src/shared/mapLabelNudge.ts`. When one of those changes, update [terrain-pipeline.md](terrain-pipeline.md) and the map documents in [ux/](ux/) in the same change.
