# Living documentation (`doc/`)

Authoritative product and mechanics documentation for Agent Wars. **The engine under `src/` is first authority.** If a number, phase order, cap, range, or legality rule here disagrees with a symbol in code, the code is correct and this folder should be updated.

Shipping version as of this writing: **2.10.0** (`package.json`). Phase 0 (hybrid AI) and Phase 1 (global strategic game) are complete. Phase 2 is complete through milestone **2.5** (regional game and rules enhancements), including tactical battles (2.1 to 2.4) and playtester UI fixes (2.45). Release **2.6.0** redesigns the layout: a top bar, a console docked on the right, a selection panel on the map, and a new-game panel docked at the left. Release **2.8.0** adds matches of two to four sides, each AI side with its own commander. Release **2.8.1** lines up the commander popover and collapses the console when a match starts. Release **2.8.2** puts hex changes in each side's turn report and opens the new-game screen at the top. Release **2.8.3** keeps that report to the hexes each side lost. Release **2.8.4** replaces an unreadable short home name with a letter form of that name. Release **2.8.5** names who holds a hex with each side's short name. Release **2.9.0** adds player-facing save and load: a match can be written to an `.agentwars` file and opened again, and the last five turn starts are kept automatically. See [save-files.md](save-files.md) and [ux/save-and-load.md](ux/save-and-load.md). Release **2.10.0** adds ballistic missiles. Turn replay is not built. Later polish, diplomacy, and async multiplayer remain unbuilt.

## How to read `doc/`

| Document | Role | Status |
| --- | --- | --- |
| [how-to-play.md](how-to-play.md) | Player guide: setup, global and regional maps, turn order, targeting, air power, sealift, building, battles, roads and rail, unit bonuses, common surprises, messages, and controls | **Current UI.** Downloads and the OpenRouter key are under Play it in the root [README.md](../README.md). Per-surface detail is in [ux/](ux/). |
| [save-files.md](save-files.md) | How a match is written to an `.agentwars` file and opened again, including what the file omits and the version rule | **Current.** Matches `EXPECTED_USER_VERSION` and `MACHINE_LOCAL_CONFIG_KEYS`. |
| [combat-rules-v3.md](combat-rules-v3.md) | Combat, movement, production, fog, sealift, and tactical battles | **Current mechanics.** Numbers are taken from engine constants. |
| [game-size-unit-caps.md](game-size-unit-caps.md) | Small / Medium / Large per-side caps | **Current.** Matches `getMaxUnitsPerType`. |
| [region-vs-region.md](region-vs-region.md) | Shipped scenario, home regions, win evaluation | **Current.** Matches `decideEndOfTurnOutcome`. |
| [hybrid-ai.md](hybrid-ai.md) | Hybrid opponent loop, callbacks, consult bounds | **Current engine behavior.** Prompt copy lives in the prompt package. |
| [ai-tools.md](ai-tools.md) | The six tool groups the model (and host) can invoke | **Current.** Names from `PATHFINDING_TOOL_NAMES` and sibling `*_TOOL_NAMES` consts. |
| [terrain-pipeline.md](terrain-pipeline.md) | What the app loads from `data/generated/` | **Current runtime.** Regeneration runbooks stay in [scripts/terrain_pipeline/README.md](../scripts/terrain_pipeline/README.md), [scripts/weather_pipeline/README.md](../scripts/weather_pipeline/README.md), and [scripts/naming_pipeline/README.md](../scripts/naming_pipeline/README.md). Data, flag, and library credits are in [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) at the repository root. |
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
| Loaded map extent | `mapExtentBoxForHexes`, `loadedMapExtentKey`, and `shouldApplyLoadedMapExtent` in `src/shared/mapExtent.ts`. Start frames the extent immediately. A later snapshot does not, while that footprint is unchanged. Player framing is in [ux/map-surface.md](ux/map-surface.md). The renderer applies it from `src/renderer/map/mapExtent.ts`. |
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
| Missile range, survival roll, and launch timing | `missileRangeHexes` in `src/shared/gameRules.ts`, `MISSILE_INFRASTRUCTURE_SURVIVAL_FACE` in `src/shared/missileRules.ts`, and `resolveMissileLaunchPhase` in `src/main/gameActions/missileLaunchResolution.ts`. Launches run after embark and before air strikes. |
| Dice chip line and face limits (quoted in [ux/resolution-playback.md](ux/resolution-playback.md), not in the combat rules) | `COMBAT_DICE_CHIP_MAX_LINES` and `COMBAT_DICE_ROW_MAX_FACES` in `src/shared/combatDiceChips.ts` |
| Seat limits and seat ids | `MIN_SEATS`, `MAX_SEATS`, `AI_SEAT_IDS`, `HUMAN_SEAT_ID`, `NEUTRAL_OWNER_ID` in `src/shared/seatIds.ts` |
| Win rules, knockout, and places | `decideEndOfTurnOutcome` in `src/main/gameActions/endOfTurnOutcomeRules.ts`, `TURN_LIMIT_OPTIONS`, `DEFAULT_TURN_LIMIT`, `victorySettingsForRequest`, and `DEFAULT_VICTORY_RULE` in `src/shared/victoryRules.ts` |

Prompt-generating code is catalogued in [ai-commander-prompts/](ai-commander-prompts/README.md). That package describes today's emitted prompts and answers to the same engine symbols; it does not invent stats. How the consult is scheduled and which tools exist: [hybrid-ai.md](hybrid-ai.md) and [ai-tools.md](ai-tools.md).

Consultation deadlines live in `src/shared/aiConsultationLimits.ts` (`AI_MODEL_REQUEST_TIMEOUT_MS`, `AI_CONSULTATION_WALL_CLOCK_MS`, `AI_CONSULTATION_WAIT_TIMEOUT_MS`). When one of those changes, update [hybrid-ai.md](hybrid-ai.md) in the same change.

Save files follow `EXPECTED_USER_VERSION` in `src/main/gameDb.ts` and `MACHINE_LOCAL_CONFIG_KEYS` in `src/main/gameDb/machineLocalConfigKeys.ts`. When either changes, update [save-files.md](save-files.md) in the same change.
