# Fortifications

Audience: a lower-quality coding agent. Implement one phase at a time. Stop after each phase and report:

- the files you touched;
- the test results;
- the line count of every file over 600 lines that you edited;
- the `check:circular` output.

Wait for the human before the next phase. If a phase fails, revert that phase. If a line in this plan disagrees with the code, trust the code, stop, and report the discrepancy. Do not guess. The one exception is a type error the compiler reports for a widened type, covered in Phase 3.

## Prerequisite

Start only after every phase of [`.spec/completed/ballistic-missiles-execution-plan.md`](completed/ballistic-missiles-execution-plan.md) is done, including its documentation phase, and `npm test` passes. Engine 2.10.0 ships that work. This plan builds on the missile code (`resolveMissileLaunchPhase`, `MissileLaunchRecord`, `formatMissileStrikeLine`, `EXPECTED_USER_VERSION = 24`) and edits the same documents. If any missile phase is unfinished, stop and report.

## Goal

Let a hex's controller fortify its intact city cells through the build queue. A fortification is a flag on one tactical urban cell. It belongs to whoever controls the strategic hex.

- **Strategic map.**
  - Every hit that would destroy one of the controller's units in a fortified hex destroys one fortification instead, until none remain.
  - A fortified hex cannot change hands while any fortification remains.
  - Enemy units alone in an undefended fortified hex wear it down with siege rolls, and ranged fire may target such a hex.
- **Air strikes and missiles** strip a fortified cell's fortification instead of destroying the cell.
- **Tactical battles.**
  - Defenders start on fortified cells.
  - A fortified cell absorbs one hit aimed at its owner's units there.
  - Enemy units cannot enter a fortified cell.
- **Display.** Fortified hexes and cells are drawn with short inward ticks in the controller's color.
- **AI.** The AI sees fortifications and may build them.

## Background

These facts were read from the current branch: engine 2.10.0 with the missile work, plus the follow-up commit that moved missile strike sentences into loss sections. Re-check each one where a phase uses it.

- **Per-cell infrastructure** lives in `res_t_feature_overrides(h3_index, parent_h3_index, terrain_kind, is_urban, is_airport, is_seaport, is_rubble)` ([`src/main/gameDb/schema.ts`](../src/main/gameDb/schema.ts)). Seeding inserts a row for every urban, airport, or seaport cell.
  - Airport and seaport strikes and missiles can leave a cell with `is_urban = 1` and `is_rubble = 1`.
  - So an **intact city cell** is `is_urban = 1 AND is_rubble = 0`. Only intact city cells can be fortified.
- **Strategic counts** live in `res_s_infrastructure(h3_index, urban_hex_count, airport_count, seaport_count)`.
  - Three triggers keep the counts in sync with the per-cell rows. `urban_hex_count` counts every `is_urban = 1` row, rubble or not, and production points come from it.
  - The triggers and the drift repair are built in [`src/main/gameDb/controlInfrastructure.ts`](../src/main/gameDb/controlInfrastructure.ts) by:
    - `TACTICAL_TO_STRATEGIC_SYNC_TRIGGER_NAMES`
    - `TACTICAL_INFRASTRUCTURE_COUNTS_SUBQUERY_SQL`
    - `buildStrategicCountsMismatchPredicateSql`
    - `buildStrategicRollupUpdateSql`
    - `ensureStrategicInfrastructureSyncTriggers`
    - `reconcileStrategicInfrastructureCountsFromTacticalOverrides`
  - New Game drops and recreates the triggers, so a change there reaches every new match.
- **Every code path that rubbles a cell:**
  - `replaceRandomTacticalFeaturesWithRubble` and the tactical urban branch of `applyInfrastructureDestructionEffects`, both in [`src/main/gameActions/airStrikeResolution.ts`](../src/main/gameActions/airStrikeResolution.ts).
  - `rollTargetFlags` and `updateClearedFlags` in [`src/main/gameActions/missileLaunchResolution.ts`](../src/main/gameActions/missileLaunchResolution.ts).
  - `applyTacticalRangedRubbleToCell` in [`src/main/gameActions/tacticalRangedInfrastructureRubble.ts`](../src/main/gameActions/tacticalRangedInfrastructureRubble.ts). Its catch logs the error and returns `changed: false`, so a failure there does not stop the turn.

  All of them write through `updateTacticalFeatureOverrideRow`, which reads the row and then writes all four flags. `insertTacticalFeatureOverrideRubbleRow` only inserts rows for cells that have none.
- **Snapshot and fog.**
  - `GameStateSnapshot.strategicInfrastructure` rows are `{ h3Index, urbanHexCount, airportCount, seaportCount }` ([`src/shared/ipc/gameStateTypes.ts`](../src/shared/ipc/gameStateTypes.ts)). They are built in `getGameStateSnapshot` ([`src/main/gameDb/fogState.ts`](../src/main/gameDb/fogState.ts)) and are not filtered by fog. Many test fixtures build these rows as literals.
  - Per-cell state reaches the renderer through the IPC `getTacticalTerrainOverrides`, as `TacticalTerrainOverrideRow` ([`src/shared/ipc/terrainHexTypes.ts`](../src/shared/ipc/terrainHexTypes.ts)).
    - Main caches it by `computeTacticalFeatureOverrideSignature` ([`src/main/gameDb/tacticalRendererOverrideCache.ts`](../src/main/gameDb/tacticalRendererOverrideCache.ts)).
    - The renderer stores it in `S.tacticalTerrainOverridesByH3`.
  - The renderer draws city and rubble state only on explored hexes, with current values. The AI briefing applies the same rule through `state.exploredHexes`.
- **Production.**
  - The tables are `res_s_build_queue(… unit_type …)` and `res_s_build_progress(h3_index, stored_points, keep_building, keep_building_unit_type)`. Both have CHECK lists of unit types.
  - The engine is `processProductionAfterControlResolution` in [`src/main/gameActions/controlAndProduction.ts`](../src/main/gameActions/controlAndProduction.ts).
    - Points are the stored points plus `urban_hex_count`, spent front to back.
    - A capped unit type pauses the queue (`break`, points kept).
    - Keep building refills an empty queue through `computeKeepBuildingRefillCount`.
    - Points bank without limit.
  - The build popup's type list is `HexBuildQueueSnapshot.availableUnitTypes`, from `buildProductionEligibilityView` in [`src/main/gameActions/buildQueue.ts`](../src/main/gameActions/buildQueue.ts).
  - `ALL_BUILD_UNIT_TYPES` and `BuildUnitType` also drive unit caps, unit ids, loss summaries, the top bar, the new-game Forces row, and the AI's cap rules in [`src/main/productionCaps.ts`](../src/main/productionCaps.ts). A fortification must not join them.
- **Combat.**
  - `runRangedPhase` and `runMeleePhase` in [`src/main/combatResolution.ts`](../src/main/combatResolution.ts) are pure functions over in-memory `CombatUnit` lists. Strategic resolution and tactical battles share them. In a battle, `h3Index` is a cell.
  - Casualties are taken one unit per hit, in `compareCasualtyOrder` order. Extra hits are wasted.
  - `runRangedPhase` skips a target hex with no defenders (`if (attackerUnits.length === 0 || defenderUnits.length === 0) continue;`).
  - Strategic air strikes against units (`resolveAirStrikeAgainstUnits`) read and delete units in the database directly.
  - Every pre-melee random draw goes through the counting `next` wrapper in `executeReadyStrategicTurn` ([`src/main/gameActions/readyStrategicResolutionPipeline.ts`](../src/main/gameActions/readyStrategicResolutionPipeline.ts)).
  - The melee-intercept pause keeps an in-memory `MeleeInterceptReadyPauseSnapshot`. The resume (`meleeInterceptStrategicResolve.ts`) replays the draw count with `resumeNext`, then runs `runMeleePhase` once.
- **Control** changes in one place during a match: `resolveStrategicControlAfterCombatAndMovement` in `controlAndProduction.ts`, called from `finalizeReadyTurnAfterMelee`. Knockout (`applyKnockout`) writes control through `setHexController`. New Game writes it with direct SQL in `resetGame.ts`.
- **Tactical battles.**
  - `TacticalBattleSnapshot` ([`src/shared/tacticalBattleTypes.ts`](../src/shared/tacticalBattleTypes.ts)) carries per-cell records such as `tacticalIsUrbanByH3`, plus `enclosingStrategicH3Index` and `opposingPartyId` (the one owner in the hex that is not the human).
  - Placement is in `computeTacticalBattleSnapshot`.
  - A beat advances in one place: `applyHumanTacticalDraftBeatInStrategicOrder` ([`src/main/tacticalBattle/tacticalBattleSession.ts`](../src/main/tacticalBattle/tacticalBattleSession.ts)), where `battleAdvancedTurn` is built. It validates marches on the battle as it was before the beat's fire, and projects them on the battle after fire.
  - Several call sites build `new Set(battle.tacticalChildH3Indexes)` and hand it to the march planner. Phase 7 lists them.
- **Rendering.**
  - `drawTerrainHexes` in [`src/renderer/rendering/terrainRendering.ts`](../src/renderer/rendering/terrainRendering.ts) draws strategic hexes, strategic ownership borders, and home rings. Its wrapper in [`src/renderer/rendering/gameScene.ts`](../src/renderer/rendering/gameScene.ts) passes a deps object (`getExploredHexSet`, `isMapInspectionModeHeld`, and others).
  - The strategic draw sequence in `gameScene.ts` is `drawTerrainHexes(ctx); drawTacticalTerrainHexes(ctx); drawScenarioHomeRegionOutlines(ctx);`.
  - Zoomed-in cells are drawn by the child loop of `drawTacticalTerrainHexes`. Battle cells are drawn by `paintBattleFootprintTerrain` ([`src/renderer/rendering/tacticalBattleTerrainPaint.ts`](../src/renderer/rendering/tacticalBattleTerrainPaint.ts)).
  - Hex boundaries come from H3. At odd resolutions a boundary often has 7–10 vertices, because H3 adds near-collinear "distortion" vertices. Pentagons have 5 corners. The latitude clamp near the poles can produce duplicate points.
- **Turn report.** The turn-update toast is built by `announceResolutionTurnUpdate` ([`src/renderer/gameplay/readyResolutionAnnouncements.ts`](../src/renderer/gameplay/readyResolutionAnnouncements.ts)) from `buildConsolidatedTurnUpdateToastMessage` ([`src/shared/consolidatedTurnUpdateToast.ts`](../src/shared/consolidatedTurnUpdateToast.ts)).
  - **Loss sections.** Each side that lost a visible unit, lost hexes, or controlled a hex hit by a visible missile launch gets a loss section (`buildTurnLossSections` in `src/shared/turnLossSections.ts`). A section holds cause lines, then that side's missile strike sentences, then its hex sentences.
  - **Missile lines.** `missileStrikeLines` entries are `MissileStrikeToastLine` (`{ controllerId, line }`). `splitMissileStrikeLines` sends a seat-controlled strike to that seat's section, and a neutral or uncontrolled one to Updates.
  - **Updates.** Updates holds deployments, caps, the combat-activity fallback, the neutral or uncontrolled missile sentences, and finally the unknown-battle line.
  - **Gate.** `readyHandler.ts` calls `announceResolutionTurnUpdate` only when the turn has playback (`needsAnimation`). The existing deployed-units line has the same limit. Leave that gate alone.
  - There is no air-strike line in the turn report today.
- **Import cycles.** `npm run check:circular` already fails. It reports the same four existing cycles noted in the missile plan, against an empty baseline. This work must not change that output.

## Locked decisions

These came from the human. Do not reopen them.

Two decisions were revised so the code could follow them. The display formula no longer lights an edge when the fortified count is 0, and it no longer asks for more edges than the hex has. Battle placement keeps today's missile-first loop: missiles land first, then the controller's other sub-units take the remaining fortified core cells. The snapshot helper is `isExploredEnemyFortifiedHex`. It does not check occupancy. The validator pairs it with `!hasEnemy`. The siege test that landed is `src/main/gameActions/fortificationSiege.test.ts` (one infantry, two forts, two melee phases). The twenty-turn ready loop below was not used. `readyTypes.ts` was 841 lines when this work finished.

- **What is fortified.** One intact city cell at a time. A hex can hold as many fortifications as it has intact city cells. Airport-only and seaport-only cells cannot be fortified. There are no other limits for now.
- **Ownership.** A fortification belongs to whoever controls its strategic hex. It is never stored with an owner. After a knockout the hex goes to Neutral; its fortifications stay and belong to Neutral.
- **Building.**
  - A new build-queue item, `fortification`, sits beside the unit types. One item fortifies one cell.
  - It costs the map's infantry cost per cell (`1 ×`; 20 on the global map).
  - Queued items are built in queue order, together with the units. The engine picks which unfortified intact city cells to fortify, at random.
  - When a fortification item reaches the head of the queue and no intact city cell is left unfortified, the queue pauses exactly as it does at a unit cap.
  - `fortification` may be the hex's Keep-building choice.
  - Neutral border hexes cannot fortify, just as they cannot build.
- **Strategic soak.**
  - Every hit that would destroy one of the controller's units in that hex destroys one fortification instead, 1:1, until none remain. This covers ranged fire, return fire, melee (two sides or more), and air strikes against units.
  - The fortification removed is a random fortified cell of that hex.
  - Hits on units that are not the controller's are never soaked.
  - Anti-air and infrastructure counter-fire against an attacking air unit are never soaked.
- **Control.** A hex's controller cannot change while any fortification remains in it. Enemy units may still enter.
- **Siege.**
  - In the melee step, a fortified hex is under siege when two things hold: it had no melee this turn, and it holds units of exactly one player, who is not its controller.
  - Each of those units that rolls in combat rolls its attack once. Each hit strips one fortification. Rolling stops as soon as none remain.
  - If two or more players meet there, they fight each other as today, and there is no siege that turn.
- **Ranged fire at a fortified hex.** Ranged fire may target a hex controlled by an enemy that holds at least one fortification, even when no unit is there. Each hit strips one fortification. An empty hex fires no return fire.
- **Air strikes on infrastructure.** For each cell the strike picks, a fortified cell loses only its fortification, and an unfortified cell is destroyed as today. This applies to urban, airport, and seaport strikes, strategic and tactical.
- **Missiles.** Each fortified cell rolls one d20.
  - On a 20 it is untouched.
  - Otherwise it loses its fortification but keeps its city cell, airport, and seaport.

  Unfortified cells roll per flag as today.
- **Tactical battles.**
  - **Placement.** Missiles still land first, including on a friendly fortified cell. Then the controller's other sub-units take the remaining fortified core cells, one each, before any other side. No side is placed on a cell fortified by another owner. `orderParentsForFortifiedPlacement` is missiles, then that defender's other parents, then the rest.
  - **Hits.** A fortified core cell absorbs one hit aimed at its controller's sub-units on that cell.
  - **Fire at infrastructure.** Fire at a fortified cell's infrastructure strips the fortification first. The cell is rubbled only after that.
  - **Movement.** A unit cannot march or ferry into any footprint cell fortified by another owner, core or margin, until that fortification is gone. A fortification removed during a beat unblocks movement from the next beat.
  - **Margin cells.** Fortifications on margin cells block movement but are never struck or soaked, because a battle never changes a margin hex.
- **Display.**
  - **Pattern A:** four short ticks per edge, evenly spaced, perpendicular to the edge, pointing inward, in the controller's map color.
  - **Strategic hexes** light 0 edges when the fortified count is 0. Otherwise they light `round(E × fortified ÷ max(intact, fortified))` edges, clamped to 1..E. `E` is 6, or 5 on a pentagon, clockwise from the topmost corner. A tactical cell shows the full pattern. The helper is `litFortificationEdgeCount`.
  - **Visibility.** Ticks are drawn wherever city and rubble state is drawn today (explored hexes), and hidden while terrain inspection is held.
  - **Unknown controller.** When the viewer cannot see who controls the hex, the ticks are gray.
  - **Tooltips and legend.** The hex tooltip shows `Fortified: N of M city cells`. A fortified cell's tooltip says `Fortified urban`. The terrain legend gains a Fortified row.
- **Fog.** Enemies see fortifications wherever they see a hex's city and rubble state: on explored hexes.
- **Reporting.**
  - **Per-hex line.** Each fortified hex that lost fortifications on the strategic map this turn, from any source, adds one line: `Fortifications at Vienna absorbed 4 hits; 16 remain.` It goes in the loss section of the side that owned those fortifications (the hex's controller while they were lost), after that side's missile strike sentences and before its hex sentences. Unlike a missile sentence, a Neutral-owned hex's line goes under Neutral Losses, not Updates. That line also reports air-strike losses, because air strikes have no turn-report line of their own.
  - **Missiles.** The missile strike line counts fortifications.
  - **Production.** The human sees how many cells were fortified this turn, and which queues paused because every city cell is fortified.
  - **Battles.** Fortifications lost inside a tactical battle are shown only by the battle map's ticks.
- **AI.** The AI sees fortification counts on explored hexes, its combat estimates include the soak, and it may queue `fortification`.
- **Database version bump is accepted** (24 → 25). Win conditions are unchanged.

## Out of scope

- Caps or other guardrails on fortifications.
- Fortifying non-urban cells.
- Upkeep, decay, or demolishing your own fortifications.
- Fortification-specific dice chip labels. Siege and ranged-at-fortification rolls reuse the existing melee-attack and ranged chips.
- Standing orders or tempo sweeps that fire at empty fortified hexes on their own.
- New Best Options rows for ranged fire at empty fortified hexes.
- Turn-report lines for fortifications lost inside a battle.
- AI coaching beyond the rule text and table columns in Phase 8.
- Turn replay. Saves from earlier versions. Currency. Release notes.

## Working rules

- **Rule files.** Read every `.mdc` file in `.cursor/rules/` and [`AGENTS.md`](../AGENTS.md) before the first phase, and follow them. The rules below restate the ones that matter most here. Where they differ, the rule files win.
- **One change.** This whole plan is one change for AGENTS.md's "Keep `doc/` Current" rule. Nothing ships between phases, and Phase 9 updates `doc/` for all of it.
- **Shell.** Windows PowerShell at `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`.
- **Line endings.** Keep each file's existing line endings. New files use CRLF. Check line endings before you save an existing file, and never convert a file.
- **Code blocks** in this plan are the contract. They omit orienting comments and log calls. Add both, in the shape of the file you are editing.
- **Orienting comments.** Put them on every new or changed function, field, constant, module-level variable, interface, and interface member, exported or not: Purpose, When to use, Expected outcome, Exceptions.
  - Interface members describe the contract. Implementations describe the approach.
  - Write sentences that say what the code does and why. Never write filler such as "Supports maintainability".
  - When you change or move an existing declaration whose comment is filler, replace its comment with a real one.
- **Logging:** `logDebug` at the start of each new or changed public main-process function, `logError` on every caught exception, `logTrace` on getters that do not change state. Log ids, hex indexes, counts, and turn numbers.
- **Errors:** every caught error either becomes a message in a result object or is logged and rethrown. A catch that turns an error into a result also logs it with `logError`. Never swallow an error silently.
- **Player-facing and model-facing text** is full sentences ending with a period. Exceptions follow the existing style there: tooltip label/value pairs, legend labels, select-option labels, and hover chips such as `Blocked: Fortified`. Each string is a named exported constant, or a named function for a string with values in it, listed in the text table below. Tests and docs point at those names.
- **Immutability:** `const` for bindings that are not reassigned, `readonly` on interface members and array types that are not mutated, `ReadonlyMap` and `ReadonlySet` where callers must not mutate. Where a `readonly` array meets an existing mutable field, copy it with `[...array]`.
- **File size:** desirable 600 lines, hard limit 1000. New logic goes in the new files this plan names. The files below are already near or past 600 and may change only as stated. Measure each before and after you edit it, and report every file that crosses 600.

  | File | Lines now | Allowed change, summed over all phases |
  | --- | --- | --- |
  | `src/renderer/entryCallbacks.ts` | 933 | at most 2 lines |
  | `src/main/gameDb/controlInfrastructure.ts` | 924 | must end at or below 924 (the rollup code moves out in Phase 1) |
  | `src/renderer/core/state.ts` | 924 | at most 1 line |
  | `src/renderer/rendering/terrainVisualStyles.ts` | 879 | at most 3 lines |
  | `src/main/gameDb.test.ts` | 871 | at most 25 lines |
  | `src/main/gameDb.ts` | 825 | at most 10 lines |
  | `src/shared/ipc/readyTypes.ts` | 841 | at most 45 lines above the earlier 813 |
  | `src/renderer/rendering/gameScene.ts` | 810 | at most 6 lines |
  | `src/main/tacticalBattle/tacticalStrategicOrderPhases.ts` | 805 | at most 15 lines |
  | `src/main/combatResolution.ts` | 766 | at most 60 lines |
  | `src/main/preload.ts` (767), `src/main/gameActions/gameActionsCore.ts` (724), `src/shared/ipc/gameApiTypes.ts` (681) | — | type edits only; no new lines |
  | `src/renderer/gameplay/buildQueuePopup.ts` | 761 | at most 10 lines |
  | `src/main/tacticalBattle/tacticalBattleSession.ts` | 719 | at most 6 lines |
  | `src/renderer/map/terrainTooltipStrategicState.ts` | 685 | at most 15 lines |
  | `src/main/tools/assessment.ts` | 662 | at most 8 lines |
  | `src/main/gameActions/buildQueue.ts` | 646 | at most 20 lines |
  | `src/main/tacticalBattle/computeTacticalBattleSnapshot.ts` | 641 | at most 50 lines |
  | `src/main/gameActions/airStrikeResolution.ts` | 641 | at most 55 lines |
  | `src/main/ipc/readyIpcResolutionMapping.ts` | 622 | at most 10 lines |
  | `src/main/openRouter/promptSpec/gameRuleText.ts` | 620 | at most 15 lines |
  | `src/main/openRouter/openRouter.ts` | 608 | at most 8 lines |
  | `fogState.ts` (586), `tacticalSnapshotGuards.ts` (584), `combatEstimation.ts` (578), `possibleUnitActions.ts` (570), `requestOrdersFlow.ts` (570), `humanTacticalDraftCommit.ts` (568), `promptText.ts` (558), `controlTooltipText.ts` (552), `controlAndProduction.ts` (524) | — | must stay at or under 600 |

- **Arguments:** at most 6 per function. Use an options object above that.
- **Imports:**
  - `src/shared/` imports nothing from `src/main/` or `src/renderer/`.
  - No non-test module under `src/main/gameDb/` imports from `src/main/openRouter/` or `src/main/gameActions/`.
  - `src/main/fortificationCombat.ts` imports no database code and nothing from `src/main/combatResolution.ts`. It may `import type { CombatUnit } from './combatUnitTypes'`.
  - A type-only import uses `import type`.
- **Naming:** follow [`doc/naming-conventions-contract-v1.md`](../doc/naming-conventions-contract-v1.md). The file names in this plan already pass `npm run naming:check`.
- **Tests:**
  - Cover happy paths and essential failure contracts only, not implementation details. Do not test constants or IPC registration.
  - `npm test` is the gate. A new `*.test.ts` under `src/main` or `src/shared` is picked up automatically.
  - Where this plan names an existing test that changes, change only what it says.
  - Tests that touch a database use the helpers in [`src/main/testSupport/`](../src/main/testSupport/) and temp directories removed in `finally`.
  - A test that needs a fortification creates it through the per-cell rows (`setTacticalCellFortified`). Never fake counts with `setStrategicInfrastructureForHex`.
- **Circular imports.**
  - Before the first phase, run `node scripts/check-circular-deps.cjs` once and keep its full output as the reference. Include it in the first report.
  - When a phase adds a module, also run `npm run check:circular`. It passes when its output is identical to the reference. If it differs in any way, stop and report it.
  - Do not refresh `scripts/circular-deps-baseline.json` or grow `scripts/renderer-typecheck-baseline.json`.
- **Renderer build.** When a phase edits `src/renderer`, `src/shared`, or `static/`, also run `npm run build:renderer`. Leave `static/renderer.js` changed.
- **No fortification, no change.** A match where nobody builds a fortification must resolve exactly as before: the same dice, the same placements, the same resolution, and the same turn-report text. Every new branch runs only when a fortification exists, and every new random draw happens only when a fortification is affected. The existing tests guard this, and several new tests check it too. The build menus, the terrain legend, and the AI's prompts do change by design.
- **Never commit or push.** Do not put phase numbers, or words from this plan's headings, into code, comments, tests, configuration, or `doc/`.
- **Docs timing.** `doc/` is updated only in Phase 9. Every other phase ends with no `doc/` edits.

## Names and constants

Spell these exactly. Later phases refer to them.

**Production names**

| Name | Value | Lives in |
| --- | --- | --- |
| `FORTIFICATION_QUEUE_ITEM` | `'fortification'` (as const) | new `src/shared/fortificationRules.ts` |
| `FORTIFICATION_COST_INFANTRY_MULTIPLIER` | `1` | same |
| `fortificationCostPerCell(): number` | `activeGameMap().rules.infantryCost * FORTIFICATION_COST_INFANTRY_MULTIPLIER` | `src/shared/gameRules.ts` |
| `BuildQueueItemType` | `BuildUnitType \| typeof FORTIFICATION_QUEUE_ITEM` | `src/shared/ipc/productionTypes.ts` |
| `ALL_BUILD_QUEUE_ITEM_TYPES` | `[...ALL_BUILD_UNIT_TYPES, FORTIFICATION_QUEUE_ITEM] as const` (fortification last) | same |
| `isBuildQueueItemType(value: unknown)` | type guard over `ALL_BUILD_QUEUE_ITEM_TYPES` | same |
| `buildQueueItemCostFor(item: BuildQueueItemType): number` | `fortificationCostPerCell()` for a fortification, otherwise `unitCostFor(item)` | `src/shared/gameRules.ts` |
| `getAvailableBuildQueueItemTypes(urban, seaports, airports, intactCityCells)` | `getAvailableBuildUnitTypes(urban, seaports, airports)`, plus `'fortification'` when `intactCityCells > 0` | `src/main/productionRules.ts` |

**Storage and snapshot fields**

| Name | Value | Lives in |
| --- | --- | --- |
| cell column | `res_t_feature_overrides.is_fortified INTEGER NOT NULL DEFAULT 0` | `src/main/gameDb/schema.ts` |
| count columns | `res_s_infrastructure.fortified_count` and `fortifiable_count`, both `INTEGER NOT NULL DEFAULT 0` | same |
| `StrategicInfrastructureRow` fields | `fortifiedCount` and `fortifiableCount`, both required | `controlInfrastructure.ts` |
| `TacticalFeatureOverrideRow` field | `isFortified`, required | same |
| strategic snapshot fields | `strategicInfrastructure[].fortifiedCount?` and `.fortifiableCount?` (readers use `?? 0`) | `gameStateTypes.ts` |
| renderer row field | `TacticalTerrainOverrideRow.isFortified?` | `terrainHexTypes.ts` |
| battle snapshot field | `TacticalBattleSnapshot.tacticalFortificationOwnerByH3?: Record<string, OwnerId>` | `tacticalBattleTypes.ts` |
| `EXPECTED_USER_VERSION` | `25` | `src/main/gameDb.ts` |

**Combat and report names**

| Name | Value | Lives in |
| --- | --- | --- |
| combat types | `FortificationVictim`, `FortificationCombatHooks`, `FortificationLossTally`, `StrategicFortificationContext` | new `src/main/fortificationCombat.ts` |
| `FortificationReport` | see Shared types | new `src/shared/ipc/fortificationTypes.ts` |
| `ReadyResult` fields | `fortificationReports?`, `humanFortificationsBuilt?`, `humanFortificationQueuePausedHexes?` | `src/shared/ipc/readyTypes.ts` |
| `MissileLaunchRecord` fields | `fortificationsBefore`, `fortificationsDestroyed` (required) | `src/shared/ipc/missileTypes.ts` |
| movement block reason | `'fortified_cell'` | `TacticalMovementBlockReason` in `src/main/tacticalBattle/tacticalSnapshotGuards.ts` |

**Display constants**

| Name | Value | Lives in |
| --- | --- | --- |
| `FORTIFICATION_TICKS_PER_EDGE` | `4` | new `src/shared/fortificationTickGeometry.ts` |
| `FORTIFICATION_DUPLICATE_POINT_PX` | `0.5` | same |
| `STRATEGIC_FORTIFICATION_TICK_LENGTH_RATIO` | `0.16` | new `src/renderer/rendering/fortificationTickDrawing.ts` |
| `STRATEGIC_FORTIFICATION_TICK_WIDTH_RATIO` | `0.04` | same |
| `STRATEGIC_FORTIFICATION_TICK_MIN_WIDTH_PX` | `1.5` | same |
| `CELL_FORTIFICATION_TICK_LENGTH_RATIO` | `0.18` | same |
| `CELL_FORTIFICATION_TICK_WIDTH_RATIO` | `0.05` | same |
| `CELL_FORTIFICATION_TICK_MIN_WIDTH_PX` | `1` | same |
| `FORTIFICATION_TICK_MIN_RADIUS_PX` | `6` | same |

**AI briefing names**

| Name | Value | Lives in |
| --- | --- | --- |
| briefing column | `FORTIFIED_COLUMN_HEADER` (`Fortified`), valued `N/M` (fortified / intact city cells) | production table; missile targets table |
| tactical map glyph | `F` / `f` (uppercase when the fortification is the AI's) | `src/main/briefing/map/hexMapRenderer.ts` |

## Player-facing and model-facing text

All of these live in new [`src/shared/fortificationRules.ts`](../src/shared/fortificationRules.ts) unless the row says otherwise.

| Name | Text |
| --- | --- |
| `FORTIFICATION_QUEUE_ITEM_LABEL` | `Fortification` |
| `FORTIFIED_TOOLTIP_LABEL` | `Fortified` |
| `formatFortifiedTooltipValue(fortified, intactCityCells)` | ``${fortified} of ${intactCityCells} city cells`` (``city cell`` when `intactCityCells` is 1) |
| `FORTIFIED_CELL_VARIANT_LABEL` | `Fortified urban` |
| `FORTIFIED_LEGEND_LABEL` | `Fortified` |
| `FORTIFIED_CELL_BLOCKED_REASON` | `Enemy fortifications block that cell. Destroy them with fire first.` |
| `FORTIFIED_CELL_BLOCKED_HOVER` | `Blocked: Fortified` |
| `formatFortificationReportLine({ placeName, lost, remaining })` | ``Fortifications at ${placeName} absorbed ${lost} ${hitWord}; ${remainingPhrase}.``<br>`hitWord`: `hit` when `lost` is 1, otherwise `hits`.<br>`remainingPhrase`: `none remain` for 0, `1 remains` for 1, otherwise ``${n} remain``.<br>Example: `Fortifications at Vienna absorbed 4 hits; 16 remain.` |
| `formatFortificationsBuiltLine(count)` | `1 city cell fortified.` or ``${count} city cells fortified.`` |
| `formatFortificationQueuePausedLine(placeNames)` | One name: ``Every city cell at ${name} is fortified, so its build queue is paused.``<br>Several: ``Every city cell is fortified at ${list}, so their build queues are paused.``<br>`list` uses the serial comma, as other Updates lists do: `A and B`, `A, B, and C`. Write the join in this file; do not import `joinWithSerialComma` from `consolidatedTurnUpdateToast.ts`, which would create an import cycle. |
| `FORTIFICATION_UNNAMED_PLACE` | `an unnamed hex` |
| `KEEP_BUILDING_FORTIFICATION_NOTE` (in `src/renderer/chrome/controlTooltipText.ts`) | `A fortification row keeps fortifying city cells until every one is fortified, then the queue pauses.` |
| `FORTIFICATION_NOT_AVAILABLE_REASON` | `This hex has no intact city cell to fortify.` |
| `FORTIFIED_COLUMN_HEADER` | `Fortified` (AI briefing table header) |
| `formatFortifiedFeaturePart(n)` | ``${n} fortified`` (AI Hex Features part) |
| `FORTIFIED_MAP_LEGEND_FRAGMENT` | `, F/f fortified city cell (F = yours)` (AI tactical map legend) |
| `buildFortificationRule(gates)` (in new `src/main/openRouter/promptSpec/gameRuleFortificationText.ts`) | see Phase 8 |
| `buildFortificationProductionRulePart()` (same file) | see Phase 8 |

## Shared types

[`src/shared/ipc/fortificationTypes.ts`](../src/shared/ipc/fortificationTypes.ts) is created in Phase 5 and exported from [`src/shared/ipc/index.ts`](../src/shared/ipc/index.ts). `ownerId` is read before control resolution because a hex whose last fortification fell this turn may change hands in that step, and the line belongs to the side that lost them. Only a controlled hex holds fortifications, so `ownerId` is null only in a broken state; such a line goes to Updates.

```ts
export interface FortificationReport {
  readonly h3Index: string;
  readonly ownerId: string | null;      // the hex's controller while the fortifications were lost, read before this turn's control resolution
  readonly lost: number;                // fortifications removed this turn on the strategic map, from every source
  readonly remaining: number;           // fortifications left after this turn's fighting, before this turn's production
}
```

[`src/main/fortificationCombat.ts`](../src/main/fortificationCombat.ts) is created in Phase 2 with the tally. Phase 5 adds the hooks, the context, and `takeHitsInCasualtyOrder`. Phase 6 adds `runSiegeRolls` and `rollRangedAgainstFortifiedHex`.

```ts
export type FortificationLossTally = Map<string, number>;
export function recordFortificationLoss(tally: FortificationLossTally | undefined, h3Index: string, count: number): void;

export interface FortificationVictim { readonly player: string; readonly h3Index: string }

export interface FortificationCombatHooks {
  /** Returns true when a fortification absorbed this hit, so the victim must not be removed. */
  readonly absorbHit: (victim: FortificationVictim) => boolean;
  /** True when `h3Index` is controlled by a player other than `attackerPlayer` and holds at least one fortification. Strategic only. */
  readonly isEnemyFortifiedHex?: (h3Index: string, attackerPlayer: string) => boolean;
  /** Removes one fortification from `h3Index`; false when none remain. Strategic only. */
  readonly stripOne?: (h3Index: string) => boolean;
}

/** What strategic resolution hands to air strikes: the hooks plus the tally they record into. */
export interface StrategicFortificationContext {
  readonly hooks: FortificationCombatHooks;
  readonly tally: FortificationLossTally;
}
```

`recordFortificationLoss` adds `count` to the hex's entry. It does nothing when `tally` is undefined or when `count` is 0 or less.

## Phase 1: Store fortifications

**Goal.** The database, the shared rules module, and every snapshot can hold fortifications. Nothing creates one yet, so the game is unchanged.

**Create [`src/shared/fortificationRules.ts`](../src/shared/fortificationRules.ts)** with:

- `FORTIFICATION_QUEUE_ITEM` and `FORTIFICATION_COST_INFANTRY_MULTIPLIER`;
- every string and formatter in the text table that lives in this file;
- no other logic.

Add `fortificationCostPerCell()` to `src/shared/gameRules.ts`.

**Schema** (`src/main/gameDb/schema.ts`):

- `res_t_feature_overrides` gains:
  - the column `is_fortified INTEGER NOT NULL DEFAULT 0`;
  - the table constraint `CHECK (is_fortified IN (0, 1) AND (is_fortified = 0 OR (is_urban = 1 AND is_rubble = 0)))`.

  A fortified cell can then never be rubble or non-urban. A write that rubbles a fortified cell fails loudly instead of corrupting the match.
- `res_s_infrastructure` gains `fortified_count` and `fortifiable_count`, both `INTEGER NOT NULL DEFAULT 0`.
- The `res_s_build_queue.unit_type` and `res_s_build_progress.keep_building_unit_type` CHECK lists gain `'fortification'`. The `units.unit_type` list does not.
- `EXPECTED_USER_VERSION` in `src/main/gameDb.ts` becomes `25`.

**Move the rollup code out of `controlInfrastructure.ts`**, which is at 924 lines and must not grow.

1. Create [`src/main/gameDb/strategicInfrastructureRollup.ts`](../src/main/gameDb/strategicInfrastructureRollup.ts).
2. Move these six declarations into it:
   - `TACTICAL_TO_STRATEGIC_SYNC_TRIGGER_NAMES`
   - `TACTICAL_INFRASTRUCTURE_COUNTS_SUBQUERY_SQL`
   - `buildStrategicCountsMismatchPredicateSql`
   - `buildStrategicRollupUpdateSql`
   - `ensureStrategicInfrastructureSyncTriggers`
   - `reconcileStrategicInfrastructureCountsFromTacticalOverrides`

   Change nothing in them except three things: the SQL edits below; the private alias `ControlDbOps` in their signatures, which becomes `BasicDbOps`; and their comments, where the filler is replaced with real ones.
3. The new module imports only `BasicDbOps` (type) from `./dbOps` and `logDebug` from `../logger`.
4. In `controlInfrastructure.ts`, replace them with one re-export line, so every existing importer keeps working unchanged:
   ```ts
   export { ensureStrategicInfrastructureSyncTriggers, reconcileStrategicInfrastructureCountsFromTacticalOverrides } from './strategicInfrastructureRollup';
   ```

Then add the two counts everywhere the three existing counts appear in the moved SQL:

- `fortified_count` is `SUM(CASE WHEN is_fortified = 1 THEN 1 ELSE 0 END)`.
- `fortifiable_count` is `SUM(CASE WHEN is_urban = 1 AND is_rubble = 0 AND is_fortified = 0 THEN 1 ELSE 0 END)`.
- In the subquery, the aliases are `fortifiedCount` and `fortifiableCount`.
- Add both to the mismatch predicate, the rollup UPDATE, and the reconcile UPDATE's SET and WHERE lists.

**Rows** (`controlInfrastructure.ts`):

- **Strategic rows.** `StrategicInfrastructureRow`, `StrategicInfrastructureDbRow`, `mapStrategicInfrastructureDbRow`, `listStrategicInfrastructureRowsInternal`, and `getStrategicInfrastructureForHex` gain `fortifiedCount` and `fortifiableCount`. Missing rows read as 0. Leave `setStrategicInfrastructureForHex` unchanged.
- **Cell rows.** `TacticalFeatureOverrideRow` and `listTacticalFeatureOverridesForGame` gain `isFortified`.
- **Cell updates.** `updateTacticalFeatureOverrideRow`'s patch type gains `isFortified`. It reads the current value like the other four flags and writes all five. A patch that omits `isFortified` keeps the stored value. The wrapper of the same name in `controlInfrastructureAccess.ts`, which every caller imports through `../gameDb`, has its own patch type: add `'isFortified'` to its `Pick` too.
- **Renderer rows.** `buildTacticalTerrainOverridesForRendererFromGameUncached` copies `isFortified` onto the renderer rows. Add `isFortified?: boolean` to every inline copy of the renderer row type:
  - `controlInfrastructure.ts` (two places);
  - `controlInfrastructureAccess.ts`;
  - `entryCallbacks.ts`;
  - `TacticalOverlayInfrastructureRow`.

**Fortification state.** Create [`src/main/gameDb/fortificationState.ts`](../src/main/gameDb/fortificationState.ts), following the `(ops, …)` pattern of `controlInfrastructure.ts`:

```ts
export function listFortifiedCellsForHex(ops: BasicDbOps, h3Index: string): string[]    // is_fortified = 1; sorted by h3_index
export function listFortifiableCellsForHex(ops: BasicDbOps, h3Index: string): string[]  // is_urban = 1, is_rubble = 0, is_fortified = 0; sorted
export function isTacticalCellFortified(ops: BasicDbOps, cellH3Index: string): boolean
export function setTacticalCellFortified(ops: BasicDbOps, cellH3Index: string, fortified: boolean): void
```

`setTacticalCellFortified` selects the row first.

- When there is no row, it logs and throws. A missing row means a caller picked a cell that is not a city cell.
- Otherwise it runs `UPDATE res_t_feature_overrides SET is_fortified = ? WHERE h3_index = ?`. The CHECK rejects fortifying a rubble or non-urban cell.

Add thin wrappers that pass `gameDbOps` in a new [`src/main/gameDb/fortificationStateAccess.ts`](../src/main/gameDb/fortificationStateAccess.ts), as `controlInfrastructureAccess.ts` does. Re-export the wrappers from `src/main/gameDb.ts` beside the other infrastructure exports.

**Snapshot and renderer data.**

- `GameStateSnapshot.strategicInfrastructure` rows gain `fortifiedCount?: number` and `fortifiableCount?: number`. They are optional so existing fixtures still compile. `getGameStateSnapshot` always fills both, still unfiltered.
- `TacticalTerrainOverrideRow` and `TacticalRendererOverrideRow` gain `isFortified?: boolean`.
- The renderer's `S.tacticalTerrainOverridesByH3` entry type (`src/renderer/core/state.ts`) gains `isFortified: boolean`. `deriveInfrastructureOverlayState` (`src/renderer/rendering/infrastructureOverlayState.ts`) fills it as `row.isFortified === true`. `TacticalOverlayEntry`, the value type of the map it builds (same file), gains `isFortified: boolean` too, so the assignment in `entryCallbacks.ts` still type-checks.
- `computeTacticalFeatureOverrideSignature` adds `SUM(is_fortified)` and `SUM(is_fortified * rowid)`. The second term changes when one cell is fortified and another stripped in the same turn, which the plain sum would miss.

**Tests.**

- [`src/main/fortificationSchema.test.ts`](../src/main/fortificationSchema.test.ts), in the shape of `src/main/missileSchema.test.ts`, on a fresh temp match. Pick a hex with at least two intact city cells.
  - `setTacticalCellFortified(cell, true)` makes the hex's `fortifiedCount` 1 and lowers `fortifiableCount` by 1. `false` restores both.
  - Rubble a second cell with `updateTacticalFeatureOverrideRow(cell2, { isRubble: true, isUrban: false })`. Then `setTacticalCellFortified(cell2, true)` throws.
  - `updateTacticalFeatureOverrideRow(cell, { isRubble: true, isUrban: false })` on a fortified cell throws.
  - `setTacticalCellFortified` on an h3 index with no row throws.
  - The `res_s_build_queue` table accepts a row with `unit_type 'fortification'`.
- `src/main/gameDb.test.ts`:
  - In the existing drift-reconcile test, also set `fortified_count = 7, fortifiable_count = 7` in its corrupting UPDATE, and check that both are reconciled.
  - `getStrategicCountsDerivedFromTactical` gains the two `SUM(CASE …)` columns and returns them, and `assertStrategicMatchesTacticalRollupForHex` compares both counts.
  - Extend `testRendererTacticalOverridesCacheReflectsDbChanges`: fortifying cell A and stripping cell B between two reads changes the rows returned.
- **Literals.** The compiler lists every test literal of `StrategicInfrastructureRow`; add `fortifiedCount: 0, fortifiableCount: 0` to each. Add `isFortified: false` to every `TacticalFeatureOverrideRow` literal.

**Verify:**

1. `npm test`.
2. `npm run check:circular`.
3. `npm run build:renderer`.
4. `npm start`. The "Database problem" box appears once because of the version bump; accept it. Play two turns of a global match and confirm nothing has changed.

No `doc/` edits.

## Phase 2: Fire strips fortifications before city cells

**Goal.** Every code path that rubbles a cell strips a fortification first. Nothing can build a fortification yet, so play is unchanged, and tests create fortifications directly. This phase must land before building is possible: otherwise the new CHECK would make any strike on a fortified cell throw.

**Create `src/main/fortificationCombat.ts`** with only `FortificationLossTally` and `recordFortificationLoss` (see Shared types). Phase 5 adds the rest.

**Air strikes** (`airStrikeResolution.ts`):

- **`replaceRandomTacticalFeaturesWithRubble`** returns `{ readonly rubbled: number; readonly fortificationsStripped: number }` instead of a number.
  - The candidate filter, the pick, and the one `next()` draw per picked cell are unchanged.
  - The loop still stops after `count` picks, strips and rubbles together. Keep a separate counter for each result.
  - For each picked row with `isFortified`, call `updateTacticalFeatureOverrideRow(row.h3Index, { isFortified: false })` and count a strip.
  - Otherwise, apply today's rubble update and count a rubble.
- **Options.** `ApplyInfrastructureDestructionOptions` gains `readonly fortificationTally?: FortificationLossTally`.
- **`applyInfrastructureDestructionEffects`.** Its result gains `fortificationsStrippedCount: number`.
  - **Strategic urban branch:** set `changedRubbleCount = picked.rubbled` and `fortificationsStrippedCount = picked.fortificationsStripped`.
  - **Airport and seaport branches:** the same two assignments. Destroy based air (airport) and prune the queue only when `rubbled > 0`.
  - **Tactical urban branch** (`tacticalUrbanStrikeTargetH3`): when the matched row `isFortified`, strip it, set `fortificationsStrippedCount = 1`, leave `changedRubbleCount` at 0, and return without pruning.
  - Every branch calls `recordFortificationLoss(options?.fortificationTally, h3Index, fortificationsStrippedCount)`.
- **`resolveAirStrikeAgainstInfrastructure`.** The strike is a success when `changedRubbleCount > 0`, `fortificationsStrippedCount > 0`, or any air unit was destroyed. It still pushes an `InfrastructureDestroyedEvent` only when something was rubbled or air was destroyed.
- **Tactical caller.** The caller in `tacticalStrategicOrderPhases.ts` (around line 445) needs no change.

**Missiles** (`missileLaunchResolution.ts`):

- **Counts.** `FlagCounts` gains `fortificationsBefore` and `fortificationsDestroyed`. `MissileLaunchRecord` (`src/shared/ipc/missileTypes.ts`) gains both as required fields. The code that builds a record from `FlagCounts` copies them.
- **`rollTargetFlags`.** Handle a row with `isFortified` first:
  ```ts
  if (row.isFortified) {
    if (row.isUrban) counts.urbanBefore += 1;
    if (row.isAirport) counts.airportsBefore += 1;
    if (row.isSeaport) counts.seaportsBefore += 1;
    counts.fortificationsBefore += 1;
    if (rollDie() < MISSILE_INFRASTRUCTURE_SURVIVAL_FACE) {
      updateTacticalFeatureOverrideRow(row.h3Index, { isFortified: false });
      counts.fortificationsDestroyed += 1;
    }
    continue;
  }
  ```
  A fortified row never reaches `updateClearedFlags`, which would write rubble. Rows without a fortification roll per flag as today.
- **Tally.** `resolveMissileLaunchPhase` gains a third parameter, `fortificationTally?: FortificationLossTally`. Record each launch's destroyed count for its target hex.
- **Strike line.** `formatMissileStrikeLine` (`src/shared/missileStrikeReport.ts`) adds `flagPhrase(record.fortificationsDestroyed, record.fortificationsBefore, 'fortification', 'fortifications')` as the last part. Example: `Missile strike on Vienna: 9 city cells and 10 fortifications destroyed.`
- **Literals.** The compiler lists every `MissileLaunchRecord` literal. Add `fortificationsBefore: 0, fortificationsDestroyed: 0` to each, including the `record()` helper in `src/shared/missileStrikeReport.test.ts`.

**Tactical ranged rubble** (`applyTacticalRangedRubbleToCell`). Right after `rowForCell` is found, when it is fortified:

1. Strip it with `updateTacticalFeatureOverrideRow(tacticalH3Index, { isFortified: false })`.
2. Log it.
3. Return `{ changed: false, destroyedAirUnitsCount: 0 }`.

The city cell and its terrain are unchanged, so callers that refresh terrain on `changed` need nothing. Update the function's comment to say so.

**Tests.** Create [`src/main/gameActions/fortificationStrikes.test.ts`](../src/main/gameActions/fortificationStrikes.test.ts) on a temp match. Fortify cells with `setTacticalCellFortified`.

- **Urban strike on a fully fortified hex.** Use a hex with more intact city cells than `strategicUrbanCellsDestroyedPerHit()`, and fortify all of them. Then `applyInfrastructureDestructionEffects(hex, 'urban', next, { fortificationTally })`:
  - rubbles nothing;
  - strips `min(strategicUrbanCellsDestroyedPerHit(), fortified)`;
  - records that number in the tally.
- **Targeted tactical urban strike** on a fortified cell. The cell keeps `isUrban` and loses `isFortified`, and `changedRubbleCount` is 0.
- **Tactical ranged rubble.** `applyTacticalRangedRubbleToCell` on a fortified cell leaves it urban and unfortified, and returns `changed: false`.
- **Missiles** (`src/main/gameActions/missileLaunchResolution.test.ts`):
  - With every die face 1, a fortified cell keeps its urban flag and loses its fortification, and the record shows `fortificationsDestroyed: 1`.
  - With every face 20, it keeps both.
- **Strike line** (`src/shared/missileStrikeReport.test.ts`). With `placeName: 'Vienna'` and a record with `urbanBefore: 21, urbanDestroyed: 9, fortificationsBefore: 12, fortificationsDestroyed: 10` and no airports or seaports, `formatMissileStrikeLine` produces the example line above.

**Verify:**

1. `npm test`.
2. `npm run check:circular`.
3. `npm run build:renderer`.
4. `npm start`. Play two turns and confirm nothing has changed.

No `doc/` edits.

## Phase 3: Build fortifications

**Goal.** A player can queue `Fortification` in four places: the build popup, the multi-hex popup, a template, and Keep building.

- Production fortifies random intact city cells.
- The queue pauses when no cell is left to fortify.
- The turn report says how many cells were fortified and which queues paused.

Nothing draws the fortifications yet (Phase 4 does), and the AI does not see the new item until Phase 8.

**Types** (`src/shared/ipc/productionTypes.ts`): add `BuildQueueItemType`, `ALL_BUILD_QUEUE_ITEM_TYPES`, and `isBuildQueueItemType`. Leave `ALL_BUILD_UNIT_TYPES`, `BuildUnitType`, and `isBuildUnitType` unchanged.

Widen these from `BuildUnitType` to `BuildQueueItemType`:

- **Snapshot fields:**
  - `HexBuildQueueEntrySnapshot.unitType`;
  - `HexBuildQueueSnapshot.availableUnitTypes`. Keep the field name, and rewrite its comment: it lists every buildable item, unit types first, then `fortification`;
  - `HexBuildQueueSnapshot.keepBuildingUnitType`;
  - `GameStateSnapshot.strategicBuildQueueTotals[].nextUnitType`. Keep the name and rewrite its comment.
- **Templates and production config:**
  - `BuildQueueTemplateEntry.unitType`, and `BuildQueueTemplateSkip`'s type field;
  - `BuildQueueProductionEntry.unitType` (`src/shared/productionConfig.ts`).
- **Queue rows and views:**
  - `BuildQueueRow.unitType`, and the inline row type in `listBuildQueueRowsForHex`;
  - the entries type of `replaceBuildQueueForHex`;
  - `getKeepBuildingForHex`'s returned type, and `setKeepBuildingForHex`'s parameter;
  - `HexBuildQueueEntryView`, `HexBuildQueueView`, and `ProductionEligibilityView` (`buildQueue.ts`).
- **Update path:**
  - the `executeUpdateHexBuildQueueEntry` parameter;
  - `updateHexBuildQueueEntry` in `gameActionsCore.ts`, `gameApiTypes.ts`, and `preload.ts`;
  - the return types of `parseBuildQueueUpdatePayload` and `parseBuildQueueTemplatePayload`.
- **Production rules:**
  - `BuildQueueEntryLike` and `ProductionApplyResult` (`src/main/productionRules.ts`);
  - both `computeKeepBuildingRefillCount` functions, main and shared;
  - `estimateTurnsToNextSpawn`'s parameter.
- **Renderer:** `templateEntriesForTurnEstimate`, `formatBuildUnitTypeOptionLabel`, `filterTemplateForBuildHex`, and the types in `buildQueueMultiSelect.ts`.
- **Other main files:** the build-queue totals row type in `fogState.ts`.

`ProductionOrder.unitType` stays `BuildUnitType` until Phase 8.

The compiler may report more sites where a queue entry's type flows. Widen those too, and list them in your report. Never widen the cap types: `MAX_UNITS_PER_TYPE`, `DEPLOYMENT_CAP_TYPE_ORDER`, `capReachedByPlayer`, and `DeployedUnitsByType`. `applyProduction.spawnedUnitTypes` stays `BuildUnitType`, and only unit entries push to it.

**Costs and availability.**

- **Costs.** Add `buildQueueItemCostFor` to `src/shared/gameRules.ts`, and switch every queue-cost caller from `unitCostFor` to it:
  - `computeKeepBuildingRefillCount` (shared);
  - `estimateTurnsToNextSpawn`;
  - `sumQueuedProductionCost`;
  - `estimateTurnsToCompleteQueuedProduction`;
  - `applyProduction`;
  - the spend loop.

  `unitCostFor` itself stays unit-only. `applyProduction` is an estimate: it charges a fortification's cost, spawns nothing, and does not model the pause.
- **Availability.** Add `getAvailableBuildQueueItemTypes` to `src/main/productionRules.ts`, and use it in place of `getAvailableBuildUnitTypes` at its three call sites. `intactCityCells` is `fortifiedCount + fortifiableCount` from `getStrategicInfrastructureForHex`. It is 0 wherever the call passes 0 for urban.
  - `buildProductionEligibilityView` reads the infrastructure row itself. Leave `StrategicProductionContextSnapshot` alone.
  - `processProductionAfterControlResolution`'s `availableTypes` (the Keep-building check).
  - `pruneBuildQueueForInfrastructureState`. A fortification row then survives pruning while the hex has an intact city cell.
- **Keep building.** `getKeepBuildingForHex` accepts a stored type when `isBuildQueueItemType` is true.
- **Payload guards.** `parseBuildQueueUpdatePayload` and `parseBuildQueueTemplatePayload` (`src/main/ipcPayloadGuards.ts`) use `isBuildQueueItemType`. In `src/main/ipc/buildQueueSealiftIpcHandler.ts`, widen the payload's `unitType` annotation.
- **Rejection text.** `buildQueue.ts` rejects an unavailable item with ``Unit type "${unitType}" is not available for this hex.`` in two places (the update path and the template skip). When the item is `'fortification'`, use `FORTIFICATION_NOT_AVAILABLE_REASON` instead. Unit messages are unchanged.

**Keep the AI unaware for now.** If the AI's tools saw `fortification` in `availableUnitTypes`, they would offer an item they cannot accept yet. They would also change the AI's cap rules, because `fortification` is never capped. Pass `availableUnitTypes.filter(isBuildUnitType)` instead of `availableUnitTypes` in three places:

- `summarizeQueue` (`src/main/tools/productionTools.ts`);
- `setBuildQueue`'s cap check and its "not available" message (same file);
- `normalizeControlledHexQueueRow` (`src/main/openRouter/briefingSections.ts`). There the list is the local `availableList`, built from `unknown`; filter it with `isBuildUnitType`, imported from `../productionRules`.

One existing test reads the raw snapshot, not an AI view. In `productionTools.test.ts`, change `assert.deepEqual(queue.availableUnitTypes, ['infantry']);` to `assert.deepEqual(queue.availableUnitTypes.filter(isBuildUnitType), ['infantry']);`, importing `isBuildUnitType` from `../productionRules`. Whether that hex has an intact city cell depends on the seeded map, so the raw list may or may not end with `fortification`.

**Fortification placement.** Create [`src/main/gameActions/fortificationProduction.ts`](../src/main/gameActions/fortificationProduction.ts):

```ts
export function fortificationPlacementSeed(gameSeed: number, turnNumber: number, h3Index: string): number
export function pickCellsToFortify(args: {
  readonly fortifiableCells: readonly string[]; // sorted by h3_index
  readonly count: number;
  readonly seed: number;
}): string[]
export function fortificationSpendStep(args: {
  readonly remainingCount: number;
  readonly points: number;
  readonly fortifiableLeft: number;
  readonly cost: number;
}): { readonly paused: boolean; readonly built: number }
export function fortifyCellsForHex(args: { readonly h3Index: string; readonly count: number; readonly turnNumber: number }): number
```

- **`fortificationPlacementSeed`** is the 32-bit FNV-1a hash of `` `${gameSeed}|${turnNumber}|${h3Index}` ``, as an unsigned integer.
- **`pickCellsToFortify`** copies the list and runs a partial Fisher-Yates shuffle for `min(count, length)` steps, driven by `createSeededRng(seed)` from `src/main/seededRng.ts`. It returns the first `min(count, length)` cells.
- **`fortificationSpendStep`:**
  - `paused` is `fortifiableLeft <= 0`;
  - `built` is 0 when paused, otherwise `max(0, min(remainingCount, floor(points / cost), fortifiableLeft))`.
- **`fortifyCellsForHex`:**
  1. Read `listFortifiableCellsForHex`.
  2. Seed with `fortificationPlacementSeed(getGameSeed(), turnNumber, h3Index)`.
  3. Pick the cells and set each one fortified.
  4. Return how many it fortified.

The module comment says why the selection uses its own seeded generator: production runs after combat, and drawing from the combat generator would change the dice of later turns. With the same seed, turn, and hex, the same cells are always chosen.

**Spend loop** (`processProductionAfterControlResolution`):

- **Before the per-hex loop,** create the `fortificationsBuiltByPlayer` and `fortificationPausedHexesByPlayer` maps.
- **Inside the loop,** the destructure of `getStrategicInfrastructureForHex(control.h3Index)` gains `fortifiedCount` and `fortifiableCount`. The hex is `control.h3Index`; there is no `h3Index` variable.
- **Per hex,** keep `let fortifiableLeft = fortifiableCount`, `let fortificationsToBuild = 0`, and `let fortificationPaused = false`. Type the `queueWorking` entries and `lastDepletedUnitType` as `BuildQueueItemType`.
- **The new branch** goes right after `const entry = queueWorking[0]!;`, before the unit cost and cap lines:
  ```ts
  if (entry.unitType === FORTIFICATION_QUEUE_ITEM) {
    const cost = buildQueueItemCostFor(entry.unitType);
    const step = fortificationSpendStep({ remainingCount: entry.remainingCount, points, fortifiableLeft, cost });
    if (step.paused) { fortificationPaused = true; break; }
    if (step.built <= 0) break;
    entry.remainingCount -= step.built;
    points -= step.built * cost;
    fortifiableLeft -= step.built;
    fortificationsToBuild += step.built;
    if (entry.remainingCount <= 0) { lastDepletedUnitType = entry.unitType; queueWorking.shift(); }
    continue;
  }
  ```
  - After this branch, `entry.unitType` is a `BuildUnitType`. If TypeScript does not narrow it, bind `const unitType = entry.unitType` before the branch and use `unitType` below it.
  - The unit branch's cost becomes `buildQueueItemCostFor(entry.unitType)`.
- **Keep building.** The refill for a fortification works unchanged through `computeKeepBuildingRefillCount('fortification', points)`. The next pass then pauses it when no cell is left.
- **After the queue and progress writes:**
  - When `fortificationsToBuild > 0`, call `fortifyCellsForHex({ h3Index: control.h3Index, count: fortificationsToBuild, turnNumber: currentPlanningTurnNumber() })`, and add the count to the controller's entry.
  - When `fortificationPaused` is true, add `control.h3Index` to the controller's paused list.
- **Return.** The function's return gains `fortificationsBuiltByPlayer: ReadonlyMap<SeatId, number>` and `fortificationPausedHexesByPlayer: ReadonlyMap<SeatId, readonly string[]>`.

**Turn result.**

- **Ready result.** `finalizeReadyTurnAfterMelee` copies the human seat's entries into two fields, beside `humanDeploymentCapReachedUnitTypes`:
  - `ReadyResult.humanFortificationsBuilt`, omitted when 0;
  - `humanFortificationQueuePausedHexes`, omitted when empty.

  Add both to `readyTypes.ts`, and to `pickReadyResolutionIpcMirrorFields` with its field union.
- **Built line.** `buildOtherTurnUpdatePrimaryLines` (`src/shared/consolidatedTurnUpdateToast.ts`) adds `formatFortificationsBuiltLine(n)` after the deployed line and before the cap line, when `humanFortificationsBuilt` is above 0.
- **Toast argument.** `buildConsolidatedTurnUpdateToastMessage` gains `fortificationLines?: readonly string[]`, for Updates. Its lines are trimmed, blank ones dropped, and appended right after the missile sentences that stay in Updates, before the unknown-battle line.
- **Paused line.** It needs place names, so it is built in the renderer. Create [`src/renderer/gameplay/fortificationUpdateLines.ts`](../src/renderer/gameplay/fortificationUpdateLines.ts):
  ```ts
  export async function fortificationUpdateLinesFor(readySlice: ReadyResult): Promise<string[]>
  ```
  - It looks up each paused hex's name with the same guarded `getHexNamingTooltipLine` call that `missileStrikeLinesFor` uses. On failure it logs and uses `FORTIFICATION_UNNAMED_PLACE`.
  - It returns one `formatFortificationQueuePausedLine(names)` line when any hex paused.
  - `announceResolutionTurnUpdate` awaits it and passes the result as `fortificationLines`.
  - The tactical-commit caller needs no change, because its slice has no such fields.

**Build UI.**

- **`buildQueuePopup.ts`.** The type select already lists `snapshot.availableUnitTypes`, and capitalizes each type inline for its label. Label a fortification option with `FORTIFICATION_QUEUE_ITEM_LABEL` instead; unit labels are unchanged. Cast to `BuildQueueItemType` wherever it casts to `BuildUnitType` today.
- **`buildQueueMultiPopup.ts` and `buildQueueMultiSelect.ts`.** Every list ordered by `ALL_BUILD_UNIT_TYPES` uses `ALL_BUILD_QUEUE_ITEM_TYPES` instead, for example `unionAvailableBuildUnitTypes` and the option filter. `filterTemplateForBuildHex` only needs its types widened. `formatBuildUnitTypeOptionLabel` (`buildQueueMultiSelect.ts`) uses `FORTIFICATION_QUEUE_ITEM_LABEL` as the type label for a fortification and keeps its eligibility suffix, such as `(all hexes)`.
- **`productionOverlayHelpers.ts`** (`formatProductionQueueAwareLabel`):
  - When `nextUnitType` is `'fortification'` and the hex's `fortifiableCount ?? 0` in `strategicInfrastructure` is 0, show `∞t`.
  - Otherwise estimate with `buildQueueItemCostFor`.
  - Index the cap tables only for unit types (`isBuildUnitType`).
- **`controlTooltipText.ts`.** `keepBuildingTooltipText` and `multiKeepBuildingTooltipText` are string constants for the single-hex and multi-hex popups. Append `KEEP_BUILDING_FORTIFICATION_NOTE` to each as a final sentence, by interpolation.

**Tests.**

- [`src/main/gameActions/fortificationProduction.test.ts`](../src/main/gameActions/fortificationProduction.test.ts):
  - `pickCellsToFortify` returns `min(count, length)` distinct cells from the list, and the same cells for the same seed.
  - `fortificationPlacementSeed` differs for two hexes.
  - `fortificationSpendStep` pauses at 0 cells left, and otherwise builds `min(remaining, affordable, left)`.
- [`src/main/fortificationProductionFlow.test.ts`](../src/main/fortificationProductionFlow.test.ts), on a temp match, with the setup pattern of `src/main/missileProduction.test.ts`. Use a human-controlled hex with at least 3 fortifiable cells. Set the queue with `replaceBuildQueueForHex` and the stored points with `setBuildProgressPointsForHex`, then call `processProductionAfterControlResolution()`.
  - **Builds.** A queue of `fortification ×2`, with stored points of `2 × fortificationCostPerCell()`:
    - ends with exactly 2 more fortified cells and an empty queue;
    - reports `fortificationsBuiltByPlayer.get(HUMAN_SEAT_ID) === 2`.
  - **Pauses.** With every intact city cell fortified, a queue of `fortification ×1` then `infantry ×1`:
    - keeps both rows;
    - banks its points (stored plus urban);
    - spawns no infantry in the hex;
    - lists the hex in `fortificationPausedHexesByPlayer`.
  - **Keep building.** Arm Keep building with `fortification` on an empty queue, with one fortifiable cell and points for three. It fortifies one cell, stays armed, and lists the hex as paused.
- `src/shared/consolidatedTurnUpdateToast.test.ts`:
  - `humanFortificationsBuilt: 1` gives `1 city cell fortified.`
  - `fortificationLines` appear in Updates after a neutral missile sentence and before the unknown-battle line.
- [`src/shared/fortificationRules.test.ts`](../src/shared/fortificationRules.test.ts): `formatFortificationQueuePausedLine` for one name and for three names (`Vienna, Prague, and Berlin`).
- `src/main/productionRules.test.ts`:
  - `getAvailableBuildQueueItemTypes(1, 0, 0, 1)` ends with `'fortification'`;
  - `(1, 0, 0, 0)` does not include it;
  - `(0, 0, 0, 0)` is empty.

**Verify:**

1. `npm test`.
2. `npm run check:circular`.
3. `npm run build:renderer`.
4. `npm start`, in a global match:
   1. The build popup's type list ends with Fortification, and its cost uses the infantry price.
   2. On a home city hex with at least 3 intact city cells and enough banked points for three fortifications, queue three fortifications and end the turn. When that turn shows the Updates toast, it says `3 city cells fortified.` The toast appears only on turns with movement or combat, as the deployed-units line does today. If the points cover fewer than three, the cells are fortified over several turns, and the lines add up to 3.
   3. Queue more fortifications than the hex has city cells, and end turns until the queue pauses. On that turn, move a unit so the Updates toast appears. Updates names the hex in the paused line, and the map label shows `∞t`.

No `doc/` edits.

## Phase 4: Draw fortifications

**Goal.** Fortified hexes and cells show the tick pattern, and so do the tooltips and the legend:

- the hex tooltip shows the count;
- a fortified cell's tooltip says so;
- the legend explains the pattern.

**Geometry.** Create [`src/shared/fortificationTickGeometry.ts`](../src/shared/fortificationTickGeometry.ts). It is pure and unit-tested.

```ts
export interface ScreenPoint { readonly x: number; readonly y: number }
export interface TickSegment { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }

export function fortificationEdges(points: readonly ScreenPoint[], cornerCount: number): ScreenPoint[][]
export function litFortificationEdgeCount(args: { readonly fortified: number; readonly intactCityCells: number; readonly edgeCount: number }): number
export function fortificationTickSegments(args: {
  readonly points: readonly ScreenPoint[];
  readonly cornerCount: number;
  readonly litEdgeCount: number;
  readonly tickLengthPx: number;
}): TickSegment[]
```

**`fortificationEdges`** splits the boundary into its real edges:

1. Drop each point closer than `FORTIFICATION_DUPLICATE_POINT_PX` to the previous kept point. Also drop a last point equal to the first.
2. If fewer than 3 points remain, return `[]`.
3. If the polygon's signed shoelace area in screen coordinates is negative, reverse the points, so edges run clockwise on screen.
4. Compute the turn angle at each point.
5. Take the `cornerCount` points with the largest turn angles, in boundary order. When fewer points exist, use all of them.
6. Return one polyline per edge, running from one corner to the next and including any points between them. Start at the corner with the smallest `y`, ties broken by the smaller `x`.

Real corners turn 60° (72° on a pentagon). Distortion vertices turn only a few degrees, so this finds the real corners.

**`litFortificationEdgeCount`** is 0 when `fortified <= 0`. Otherwise it is `Math.round(edgeCount * fortified / Math.max(intactCityCells, fortified))`, clamped to `1..edgeCount`.

**`fortificationTickSegments`** takes the first `litEdgeCount` edges.

- On each edge, it places `FORTIFICATION_TICKS_PER_EDGE` ticks at fractions `k / (FORTIFICATION_TICKS_PER_EDGE + 1)` of the edge's length along its polyline.
- Each tick starts on the edge and runs `tickLengthPx` along the normal of the local segment, flipped when needed so it points toward the mean of the corners.

**Drawing.** Create [`src/renderer/rendering/fortificationTickDrawing.ts`](../src/renderer/rendering/fortificationTickDrawing.ts):

```ts
export function drawFortificationTicks(ctx: CanvasRenderingContext2D, args: {
  readonly points: readonly ScreenPoint[];
  readonly cornerCount: number;
  readonly litEdgeCount: number;
  readonly color: string;
  readonly tickLengthPx: number;
  readonly lineWidthPx: number;
}): void
export function fortificationTickColor(controllerId: string | null, ownershipVisible: boolean): string
export function fortificationCellTickColor(cellH3Index: string): string
export function fortificationCornerCount(h3Index: string): number
export function drawStrategicFortificationTicks(ctx: CanvasRenderingContext2D, deps: StrategicFortificationTickDeps): void
```

- **`drawFortificationTicks`** strokes the segments at `OWNERSHIP_BORDER_ALPHA` with butt caps, inside `save`/`restore`.
- **`fortificationTickColor`.** Export `resolveControllerBorderColor` from `homeRegionBorderDrawing.ts`, unchanged otherwise.
  - When ownership is visible, return `resolveControllerBorderColor(controllerId)`.
  - Otherwise, return `resolveControllerBorderColor(null)`, the gray used for an unknown controller.
- **`fortificationCellTickColor`** gives a cell's ticks the color of its parent hex. The cell draw loops do not have the controller map or the viewer's perspective, so it reads them itself:
  1. `parent = strategicParentOf(cellH3Index)` (`src/shared/h3Resolutions.ts`).
  2. The controller is the `controllerPlayerId` of the parent's row in `S.gameState.strategicControl`, or null.
  3. `ownershipVisible` is `isHexOwnershipVisibleToPerspective({ h3Index: parent, playerPerspective: ownershipPerspective(S.gameState.playerPerspective), visibleHexes, homeRegionHexesBySeat, intersectingHomeRegionHexes })`, with `visibleHexes` and the two home-region fields built from `S.gameState` exactly as `drawTerrainHexes` builds them.
  4. Return `fortificationTickColor(controller, ownershipVisible)`. With no game state, return the gray.
  5. Memoize the color per parent hex, and clear the memo when `S.gameState` is a different object from the last call. Without it, every fortified cell rebuilds the same sets on every frame.
- **`fortificationCornerCount`** returns `isPentagon(h3Index) ? 5 : 6`, with `isPentagon` from `h3-js`.
- **Radius** is the mean distance from the corners' mean point to the corners. The three map passes below (strategic, zoomed-in cells, battle cells) skip any polygon whose radius is under `FORTIFICATION_TICK_MIN_RADIUS_PX`. `drawFortificationTicks` itself never checks the radius, so the smaller legend swatch still draws.
- **`StrategicFortificationTickDeps`** is `{ getExploredHexSet, isMapInspectionModeHeld }`, typed as in `TerrainRenderingDeps`.
- **`drawStrategicFortificationTicks`:**
  - **When to skip.** It returns early when a battle snapshot exists, at tactical zoom (`shouldRenderTacticalHexes()`), or while `deps.isMapInspectionModeHeld()`.
  - **Hexes drawn.** It draws each explored hex whose snapshot `fortifiedCount ?? 0` is above 0, projecting the boundary as `drawTerrainHexes` does.
  - **Lit edges.** `litFortificationEdgeCount({ fortified, intactCityCells: fortified + (fortifiableCount ?? 0), edgeCount: cornerCount })`.
  - **Tick size.** Length is `radius × STRATEGIC_FORTIFICATION_TICK_LENGTH_RATIO`. Width is `max(STRATEGIC_FORTIFICATION_TICK_MIN_WIDTH_PX, radius × STRATEGIC_FORTIFICATION_TICK_WIDTH_RATIO)`.
  - **Color.** `fortificationTickColor(controller, ownershipVisible)`, where `ownershipVisible` comes from `isHexOwnershipVisibleToPerspective` with the same arguments `drawTerrainHexes` passes.

**Wire it in.**

- **Strategic map** (`gameScene.ts`): right after `drawScenarioHomeRegionOutlines(ctx);` in the strategic branch, call `drawStrategicFortificationTicks(ctx, { getExploredHexSet, isMapInspectionModeHeld })`. The ticks then sit above every hex border.
- **Zoomed-in cells** (the child loop of `drawTacticalTerrainHexes` in `terrainRendering.ts`). After each cell's stroke, when the cell's override row has `isFortified` and inspection is not held:
  - draw the full pattern (`litEdgeCount = cornerCount`) with the `CELL_FORTIFICATION_TICK_*` sizes;
  - color it with `fortificationCellTickColor(cell)`.

  Inspection is `deps.isMapInspectionModeHeld()`, which the loop already receives.
- **Battle cells** (`paintBattleFootprintTerrain`): the same, reading the override row from `S.tacticalTerrainOverridesByH3` and coloring with `fortificationCellTickColor(cell)`. It already receives `deps.isMapInspectionModeHeld`. Phase 7 switches the owner source to the battle snapshot.

**Tooltip and legend.**

- **Tooltip state.** `TerrainTooltipState` (`src/renderer/map/terrainTooltipTypes.ts`) gains `fortifiedCount?: number`, `intactCityCells?: number`, and `isFortifiedCell?: boolean`.
  - `terrainTooltipStateForStrategicHex` fills `fortifiedCount` and `intactCityCells` from the snapshot, when infrastructure glyphs are allowed for that hex.
  - The zoomed-in cell state (around `terrainTooltipStrategicState.ts:586`) fills `isFortifiedCell` from the override row.
  - Add the three fields to `terrainTooltipContentKey`.
- **Tooltip text.** `formatTerrainTooltipHtml` adds `<strong>${FORTIFIED_TOOLTIP_LABEL}:</strong> ${formatFortifiedTooltipValue(n, intact)}` right after the Production line, built the same way, only when `fortifiedCount > 0`.
- **Cell variant.** `formatTerrainVariantSuffix` (`terrainTooltipHtml.ts`) uses `FORTIFIED_CELL_VARIANT_LABEL` in place of the Urban suffix when `isFortifiedCell`.
- **Legend.** Create `src/renderer/rendering/terrainLegendFortified.ts` with `appendFortifiedLegendRow`, built like `terrainLegendRubble.ts`. Call it after `appendRubbleLegendRow` in `renderTerrainLegend`. Its 18×12 swatch is a regular hexagon of radius 5.5 px centered at (9, 6), drawn with `drawFortificationTicks`:
  - all edges lit;
  - tick length 2 px;
  - line width 1 px;
  - the human seat's map color, `paletteForCurrentOwner(HUMAN_SEAT_ID)?.map ?? SEAT_PALETTES[0]!.map`. The fallback covers observe mode, where the roster has no human seat.

**Tests.** [`src/shared/fortificationTickGeometry.test.ts`](../src/shared/fortificationTickGeometry.test.ts):

- **Corners:**
  - a regular hexagon has 6 edges;
  - the same hexagon with an extra near-collinear point inserted in one edge still has 6;
  - with a duplicate point appended, it still has 6;
  - a regular pentagon with `cornerCount` 5 has 5.
- **Lit edges:**
  - `litFortificationEdgeCount` for `(fortified 0, intact 21, edges 6)` is 0;
  - `(1, 145, 6)` is 1;
  - `(9, 21, 6)` is 3;
  - `(21, 21, 6)` is 6.
- **Ticks:** `fortificationTickSegments` with 6 lit edges returns 24 segments, each ending closer to the center than it starts.
- **Start:** the first edge starts at the topmost corner.

**Verify:**

1. `npm test`.
2. `npm run check:circular`.
3. `npm run build:renderer`.
4. `npm run ui:smoke`.
5. `npm start`, in a global match:
   1. Fortify a few cells of a home city hex. Its edges show ticks in your color, on a share of edges that matches the count, starting at the top corner and running clockwise.
   2. Fully fortify a hex. All six edges show ticks.
   3. The hex tooltip shows `Fortified: N of M city cells`.
   4. Zoom in until cells show. Fortified cells carry the full pattern, and a fortified cell's tooltip says `Fortified urban`.
   5. Hold the terrain-inspection key. The ticks hide.
   6. The legend has a Fortified row.
   7. On a regional map, ticks sit on real edges, not on bent half-edges.

No `doc/` edits.

## Phase 5: Fortifications absorb hits and block capture

**Goal.** On the strategic map:

- fortifications soak hits on their controller's units;
- a fortified hex cannot change hands;
- the turn report says what each fortified hex lost.

**Complete `src/main/fortificationCombat.ts`.** Add `FortificationVictim`, `FortificationCombatHooks`, and `StrategicFortificationContext` (see Shared types), and this helper:

```ts
export function takeHitsInCasualtyOrder<T extends FortificationVictim & { readonly id: string }>(
  sorted: readonly T[],
  hits: number,
  absorbHit?: (victim: FortificationVictim) => boolean
): string[]
```

It walks the hits against the sorted units and returns the removed ids:

```ts
let index = 0;
for (let hit = 0; hit < hits && index < sorted.length; hit++) {
  const victim = sorted[index]!;
  if (absorbHit?.(victim)) continue; // the hit is spent; the same unit is next in line
  removed.push(victim.id);
  index++;
}
```

**Create [`src/main/gameActions/fortificationCombatLedger.ts`](../src/main/gameActions/fortificationCombatLedger.ts):**

```ts
export function createStrategicFortificationHooks(args: {
  readonly next: () => number;
  readonly tally: FortificationLossTally;
}): FortificationCombatHooks
export function buildFortificationReports(tally: FortificationLossTally): FortificationReport[]
```

- **`absorbHit(victim)`:**
  1. When `getStrategicInfrastructureForHex(victim.h3Index).fortifiedCount` is 0, return false.
  2. When `getHexController(victim.h3Index)` is not `victim.player`, return false.
  3. Otherwise read `cells = listFortifiedCellsForHex(victim.h3Index)` and pick `cells[Math.floor(next() * cells.length)]`. Set that cell unfortified, record a loss of 1, and return true.

  It draws a random number only when it absorbs.
- **`isEnemyFortifiedHex(h3, attacker)`** is true when the controller is not null, is not `attacker`, and the hex's `fortifiedCount > 0`.
- **`stripOne(h3)`** works like `absorbHit` without the owner check. It returns false when no fortified cell remains.
- **`buildFortificationReports`** goes through each hex in the tally with a loss above 0, sorted by `h3Index`. It returns `{ h3Index, ownerId: getHexController(h3Index), lost, remaining: fortifiedCount }` for each. Call it before control resolution (see Reports), so `ownerId` is the side that owned the fortifications.

**Soak in the combat functions** (`src/main/combatResolution.ts`, `src/main/multiSideMelee.ts`). They stay free of database code and only call the hooks. With no hooks, every function behaves exactly as today.

- **`runRangedPhase` options.** Replace its last two parameters with one options object:
  ```ts
  export interface RunRangedPhaseOptions {
    readonly returnFireContext?: ReturnFireEligibilityContext; // default { theater: 'strategic' }
    readonly targetCoverAt?: TerrainCoverLookup;              // default noTerrainCover
    readonly fortification?: FortificationCombatHooks;
  }
  ```
  - Move the two parameter comments onto the members.
  - Inside the function, beside `rfContext`, add `const targetCoverAt = options?.targetCoverAt ?? noTerrainCover;`, so the body keeps using the name `targetCoverAt`.
  - Update the strategic caller, the tactical caller (`tacticalStrategicOrderPhases.ts`), and the test callers. The compiler lists them.
- **`resolveOneRangedEngagement`.**
  - `ResolveOneRangedEngagementOptions` gains `absorbHit?: (victim: FortificationVictim) => boolean`. `runRangedPhase` passes `options.fortification?.absorbHit`.
  - The defender loop becomes `defenderRemovedIds.push(...takeHitsInCasualtyOrder(defSorted, attackerHits, options?.absorbHit))`.
  - In the return-fire loop, `u` comes from `.find` and may be undefined. Inside `if (u) {`, before `removedAtk.add(u.id)`, add `if (options?.absorbHit?.(u)) continue;`.
- **`resolveOneMeleeEngagement`** gains a fifth parameter, `absorbHit?: (victim: FortificationVictim) => boolean`. Both casualty loops use `takeHitsInCasualtyOrder`.
- **`resolveMultiSideMeleeEngagement`.** Its args gain `absorbHit?`. Replace the `shift()` step with:
  ```ts
  const victim = remaining.get(chosen)?.[0];
  if (!victim) break;
  hitsLeft -= 1;
  if (args.absorbHit?.(victim)) continue;
  remaining.get(chosen)!.shift();
  removals.push({ victim, killerIds });
  ```
- **`runMeleePhase`.** Its options gain `fortification?: FortificationCombatHooks`, and it passes `fortification?.absorbHit` to both melee helpers.

**Air strikes against units** (`airStrikeResolution.ts`):

- `AirStrikePhaseAccumulator` gains `readonly fortification?: StrategicFortificationContext`.
- `resolveAirStrikePhase` gains a sixth parameter, `fortification?: StrategicFortificationContext`, and stores it on the accumulator.
- In `resolveAirStrikeAgainstUnits`, where the victim is chosen: when `acc.fortification?.hooks.absorbHit({ player: victim.player, h3Index: targetH3Index })` returns true, do not delete or record the victim, and set `success = true`.
- `resolveAirStrikeAgainstInfrastructure` passes `{ fortificationTally: acc.fortification?.tally }` to `applyInfrastructureDestructionEffects`.
- Anti-air and infrastructure counter-fire never call `absorbHit`.

**Pipeline** (`executeReadyStrategicTurn`):

- **Setup.** Right after the `next` wrapper, create:
  ```ts
  const fortificationTally: FortificationLossTally = new Map();
  const fortificationHooks = createStrategicFortificationHooks({ next, tally: fortificationTally });
  ```
- **Missiles and air.** Pass `fortificationTally` to `resolveMissileLaunchPhase`, and `{ hooks: fortificationHooks, tally: fortificationTally }` to `resolveAirStrikePhase`.
- **Ranged and melee.** Pass the hooks to `runRangedPhase` (as `options.fortification`) and to the direct `runMeleePhase` call.
- **Pause snapshot.** `MeleeInterceptReadyPauseSnapshot` gains `fortificationTally: FortificationLossTally`. The snapshot stays in memory, so the Map itself is fine.
- **Resume.** The resume path (`meleeInterceptStrategicResolve.ts`) creates hooks with `resumeNext` and the snapshot's tally for its `runMeleePhase` call.
- **Finalize.** Both paths pass the tally to `finalizeReadyTurnAfterMelee` as a new required `fortificationTally` argument field.

**Control** (`resolveStrategicControlAfterCombatAndMovement`). Right after `if (currentController === nextController) continue;`, skip the hex when `getStrategicInfrastructureForHex(h3Index).fortifiedCount > 0`, with a `logDebug` naming the hex and the count. Do not change `setHexController`; knockout still uses it.

**Reports.**

- **Report type.** Create `src/shared/ipc/fortificationTypes.ts` with `FortificationReport` (see Shared types), and export it from `src/shared/ipc/index.ts`.
- **Ready result.** In `finalizeReadyTurnAfterMelee`, right before `resolveStrategicControlAfterCombatAndMovement` is called, compute `const fortificationReports = buildFortificationReports(args.fortificationTally)`. Set `ReadyResult.fortificationReports` from it, omitted when empty. Add the field to `readyTypes.ts` and to `pickReadyResolutionIpcMirrorFields`.
- **Visibility.** Create [`src/shared/fortificationReport.ts`](../src/shared/fortificationReport.ts) with:
  ```ts
  export function fortificationReportVisibleToViewer(report: FortificationReport, viewerSeatId: string | null, exploredHexes: ReadonlySet<string>): boolean
  ```
  A report is visible when the viewer is null (observing), when the viewer is its `ownerId`, or when the hex is in `exploredHexes`.
- **Toast routing** (`src/shared/consolidatedTurnUpdateToast.ts`):
  - Add `FortificationToastLine`, `{ readonly ownerId: string | null; readonly line: string }`, beside `MissileStrikeToastLine`.
  - `buildConsolidatedTurnUpdateToastMessage` gains `fortificationReportLines?: readonly FortificationToastLine[]`.
  - Trim each line and drop blank ones. An `ownerId` that is a seat id (`isSeatId`) or `NEUTRAL_OWNER_ID` files the line under that owner. A null `ownerId` sends it to Updates, right before `fortificationLines`.
  - Merge the owner lines with `splitMissileStrikeLines`' `byOwner` map, so each owner's missile sentences come first, then its fortification lines. Pass the merged map as the fifth argument of `buildTurnLossSections`.
  - In `src/shared/turnLossSections.ts`, rename `missileLinesByOwner` to `strikeLinesByOwner` in `buildTurnLossSections` and `orderedOwners`, `sectionLines`' `missileLines` to `strikeLines`, and `NO_MISSILE_LINES` to `NO_STRIKE_LINES`. Callers pass the map by position, so nothing else changes. A Neutral key there already yields a Neutral Losses section.
  - Update that file's comments in two ways. First, a section holds cause lines, then missile and fortification sentences, then hex sentences. Second, the opening rule: a side also gets a section when it owned a hex whose fortifications fell this turn and the viewer may see that report.
- **Report lines** (renderer). Add to `fortificationUpdateLines.ts`:
  ```ts
  export async function fortificationReportLinesFor(
    readySlice: ReadyResult,
    viewer: { readonly viewerSeatId: string | null; readonly exploredHexes: ReadonlySet<string> }
  ): Promise<FortificationToastLine[]>
  ```
  - It returns `{ ownerId: report.ownerId, line: formatFortificationReportLine(...) }` for each visible report, in report order. Place names come from the same guarded lookup.
  - `announceResolutionTurnUpdate` awaits it, passing `{ viewerSeatId, exploredHexes: getExploredHexSet(S.gameState) }`. It uses the `viewerSeatId` local it already computes, and imports `getExploredHexSet` from `../core/selection`. It passes the result as `fortificationReportLines`.
  - `fortificationUpdateLines.ts` must not import from `./readyResolutionAnnouncements`, which imports it; that would be an import cycle.

  Siege, ranged fire, and air strikes always set `needsAnimation`. A missile strike the viewer cannot see does not, so its fortification line shows only when something else animates that turn. Leave the gate alone.

**Tests.**

- [`src/main/fortificationCombat.test.ts`](../src/main/fortificationCombat.test.ts), with fake hooks and a fixed die:
  - `takeHitsInCasualtyOrder` with 3 hits, 2 units, and an `absorbHit` that returns true once removes both units.
  - `resolveOneRangedEngagement` with `skipReturnFire`, 3 sure hits, 2 defenders, and an `absorbHit` that returns true twice removes exactly the softest defender.
  - `resolveOneMeleeEngagement` with 3 sure hits, 2 defenders, and an `absorbHit` that returns true once removes both defenders.
  - `resolveMultiSideMeleeEngagement` with 1 hit and an `absorbHit` that returns true calls it once and removes nothing.
- [`src/main/gameActions/fortificationCombatLedger.test.ts`](../src/main/gameActions/fortificationCombatLedger.test.ts), on a temp match with fog off:
  - In a hex the human controls with 2 fortified cells, a human victim is absorbed twice, then not. The tally shows 2, and the hex's `fortifiedCount` is 0.
  - A victim that is not the controller's is never absorbed.
  - `buildFortificationReports` returns `{ ownerId: HUMAN_SEAT_ID, lost: 2, remaining: 0 }` for that hex.
- [`src/main/gameActions/fortificationControl.test.ts`](../src/main/gameActions/fortificationControl.test.ts), in the pattern of `src/main/gameActionsProduction.test.ts`:
  1. Pick an AI-controlled hex with at least one intact city cell and no units, and fortify one cell.
  2. Move one human infantry there with SQL.
  3. `resolveStrategicControlAfterCombatAndMovement()` keeps the AI as controller.
  4. Strip the fortification and call it again. The human becomes the controller.
- [`src/shared/fortificationReport.test.ts`](../src/shared/fortificationReport.test.ts):
  - the line wording for 1 and 4 hits, and for 0, 1, and 16 remaining;
  - the three visibility cases.
- `src/shared/consolidatedTurnUpdateToast.test.ts`:
  - a fortification line owned by a seat lands in that side's section, after its missile sentence and before its hex sentence;
  - one owned by `neutral` lands under Neutral Losses;
  - one with a null owner lands in Updates.
- **Existing tests.** All existing combat and Ready tests pass unchanged, apart from the `runRangedPhase` call shape.

**Verify:**

1. `npm test`.
2. `npm run check:circular`.
3. `npm run build:renderer`.
4. `npm start`, in a global match. Fortify a frontline hex fully and leave infantry in it. When the AI attacks:
   - the units survive while fortifications fall;
   - the ticks shrink;
   - the turn report shows `Fortifications at … absorbed …` under Your Losses;
   - the hex is not captured while any fortification remains.

No `doc/` edits.

## Phase 6: Sieges and fire at empty fortified hexes

**Goal.** Undefended fortified hexes can be worn down by siege and by ranged fire.

**Siege.** Add to `src/main/fortificationCombat.ts`:

```ts
export function runSiegeRolls(args: {
  readonly hexList: readonly string[];
  readonly units: readonly CombatUnit[];               // units still alive after melee
  readonly excludedHexes: ReadonlySet<string>;          // skipMeleeHexes plus this call's melee hexes
  readonly hooks: FortificationCombatHooks;
  readonly rollDie: () => number;
  readonly onRoll?: CombatDiceRollSink;
}): string[]
```

For each hex of `hexList`, in order:

1. Skip the hex when it is in `excludedHexes`, when it has no units, or when its units do not all belong to one player.
2. Let `player` be that one player. Skip the hex unless `hooks.isEnemyFortifiedHex?.(hex, player)` is true and `hooks.stripOne` exists.
3. Take its units that pass `unitTypeRollsInCombat`, sorted by `id`. For each one:
   1. Stop when `isEnemyFortifiedHex(hex, player)` is no longer true.
   2. Roll once with `rollCombatDieAgainst(rollDie, attackHitThreshold(unit), { kind: 'meleeAttack', player, unitType: unit.unitType, anchorH3Index: unit.h3Index }, onRoll)`.
   3. On a hit, call `stripOne(hex)`.
4. Return the hexes where any roll happened.

Import the helpers from `./combatConstants`, `./combatDiceRecording`, and `./combatHitThresholds`.

In `runMeleePhase`, after the melee loop and before `const combatHexSet = new Set(combatHexes)`, add:

```ts
if (options?.fortification?.isEnemyFortifiedHex && options.fortification.stripOne) {
  combatHexes.push(...runSiegeRolls({
    hexList,
    units: unitList.filter((u) => !removed.has(u.id)),
    excludedHexes: new Set([...(options.skipMeleeHexes ?? []), ...combatHexes]),
    hooks: options.fortification,
    rollDie,
    onRoll: diceLog.sink,
  }));
}
```

- A hex that had melee this turn is excluded. This keeps the "two or more players, no siege" rule.
- Siege produces no kills and no removed units.
- The tactical melee caller passes no fortification hooks (see Phase 7), so battles never siege.

**Ranged fire at a fortified hex.**

- **Resolution.** Add `rollRangedAgainstFortifiedHex(args)` to `fortificationCombat.ts`. It takes one options object (the covered attackers, the hex, the hooks, `rollDie`, and `onRoll`) and returns the number stripped. For each attacker that passes `unitTypeRollsInCombat`:
  1. Stop when `isEnemyFortifiedHex(hex, attacker.player)` is no longer true.
  2. Roll against `attackHitThreshold(attacker)`, recorded as `{ kind: 'ranged', player: attacker.player, unitType: attacker.unitType, anchorH3Index: attacker.h3Index }`.
  3. On a hit, call `stripOne(hex)`.

  In `runRangedPhase`, split today's skip. `targetCoverAt` is the local added in Phase 5.
  ```ts
  if (attackerUnits.length === 0) continue;
  if (defenderUnits.length === 0) {
    const hooks = options?.fortification;
    if (hooks?.stripOne && hooks.isEnemyFortifiedHex?.(group.defenderHex, group.attackerPlayer)) {
      const attackerHexes = [...new Set(attackerUnits.map((u) => u.h3Index))];
      combatHexes.push(group.defenderHex, ...attackerHexes);
      const coveredAttackers = attackerUnits.map((u) =>
        withTargetCover(u, targetCoverAt(group.defenderHex, terrainCoverShooterForUnitType(u.unitType)))
      );
      rollRangedAgainstFortifiedHex({ attackers: coveredAttackers, hex: group.defenderHex, hooks, rollDie, onRoll: diceLog.sink });
    }
    continue;
  }
  ```
  Use the same `onRoll` sink the engagement path uses. There is no return fire.
- **Human validation** (`validateRangedAttack`, `src/main/gameActions/strategicOrderValidation.ts`). Where it rejects a target with no enemy units, also accept a target that meets all three conditions:
  - its controller is not null;
  - its controller is not the unit's player;
  - its `fortifiedCount > 0`.

  The hover preview, double-click, and submit all go through this validator.

**Tests.**

- `src/main/fortificationCombat.test.ts`:
  - `runSiegeRolls` with two attackers that always hit, against 1 fortification, strips once and rolls once.
  - It does nothing when the hex holds two players, or when the hex is in `excludedHexes`.
  - `rollRangedAgainstFortifiedHex` strips once per hit and stops at 0.
  - `runMeleePhase` on a hex where two non-controller players met, with hooks that report an enemy fortified hex, calls `stripOne` zero times, even when melee leaves only one side.
  - `runRangedPhase` with fake hooks, one sure-hit attacker, and an empty target hex for which `isEnemyFortifiedHex` returns true calls `stripOne` once and lists the target in `combatHexes`.
- [`src/main/gameActions/fortifiedRangedTargetValidation.test.ts`](../src/main/gameActions/fortifiedRangedTargetValidation.test.ts). Strategic infantry has range 0, so use a human armor unit (range 1). With SQL, move it to a land hex next to an AI-controlled hex that has an intact city cell and no units, and fortify one cell there.
  - A ranged order at that empty enemy hex is valid.
  - At an empty enemy hex without one, it is rejected as today.
- The test that landed is [`src/main/gameActions/fortificationSiege.test.ts`](../src/main/gameActions/fortificationSiege.test.ts): one infantry, two forts, two melee phases. Do not use the twenty-turn ready loop that follows. That older sketch was [`src/main/gameActions/fortificationSiegeReady.test.ts`](../src/main/gameActions/fortificationSiegeReady.test.ts). Start the match as `readySeats.test.ts` does, with the same map and seats, and pin the dice with `gameSeed: 4242` in the `withSeatedTempGameDb` options. When no three-group map is listed, skip the test with `t.skip` exactly as that file does. The seed is meant for `western_asia_north`. Call `ready` as that file does. Then:
  1. Pick an AI-controlled hex with at least 2 intact city cells and no units. Fortify 2 cells.
  2. Clear that hex's build queue and Keep building with SQL, so no AI unit spawns there.
  3. Move 6 non-embarked human infantry there with SQL. Assert that at least 4 were moved before calling `ready`.
  4. Call `ready` up to 20 times, until the hex's `fortifiedCount` is 0.

  Then assert:
  - the AI keeps control after every turn that ends with a fortification left;
  - the human controls the hex after the turn the count reaches 0;
  - that turn's `fortificationReports` lists the hex, with the AI as `ownerId`.

**Verify:**

1. `npm test`.
2. `npm run check:circular`.
3. `npm run build:renderer`.
4. `npm start`:
   1. Move infantry into an undefended enemy fortified hex and end turns. Dice show at the hex, the fortifications fall, and the hex is captured once none remain.
   2. Order ranged fire at an enemy fortified hex with no units. The order is accepted and strips fortifications.
   3. Strike a fully fortified city hex from the air. The ticks shrink, and no city cell turns to rubble.

No `doc/` edits.

## Phase 7: Fortifications in tactical battles

**Goal.** In battles:

- defenders are placed on fortified cells;
- fortified cells absorb hits and resist rubbling;
- enemies cannot enter fortified cells.

**Owners.** `TacticalBattleSnapshot` gains `tacticalFortificationOwnerByH3?: Record<string, OwnerId>`.

- It covers every footprint cell, core and margin, whose row is fortified, mapped to the controller of the row's `parentH3Index`.
- Cells whose parent has no controller are left out.
- The field is omitted when empty, so battles without fortifications serialize exactly as before.

Create [`src/main/tacticalBattle/tacticalFortificationOwners.ts`](../src/main/tacticalBattle/tacticalFortificationOwners.ts):

```ts
export function buildTacticalFortificationOwnerRecord(args: {
  readonly rows: readonly TacticalFeatureOverrideRow[];
  readonly footprint: readonly string[];
  readonly controllerOf: (strategicH3: string) => string | null;
}): Record<string, OwnerId>
export function withFortificationOwnersFromGameDb(battle: TacticalBattleSnapshot): TacticalBattleSnapshot
```

- `buildTacticalFortificationOwnerRecord` is pure. It keeps an owner only when `isOwnerId(owner)` is true.
- `withFortificationOwnersFromGameDb` builds the record from `listTacticalFeatureOverridesForGame()`, `battle.tacticalChildH3Indexes`, and `getHexController`. It returns the battle with the field set, or without the field when the record is empty.

Set the field in exactly two places:

- when the snapshot is computed, before placement;
- when a beat ends. In `applyHumanTacticalDraftBeatInStrategicOrder`, wrap `battleAdvancedTurn` in `withFortificationOwnersFromGameDb(...)`.

Do not refresh it anywhere else. Within a beat, every march and ferry check then sees the fortifications as they stood when the beat began. This is what "unblocks from the next beat" means. It also matches the playback in `humanTacticalDraftCommit.ts`, which plans on `preBattle`.

**Placement.** Create [`src/main/tacticalBattle/tacticalFortificationPlacement.ts`](../src/main/tacticalBattle/tacticalFortificationPlacement.ts) with these pure helpers:

```ts
export function fortifiedCellsForOwner(args: {
  readonly orderedCells: readonly string[];
  readonly ownerByH3: Readonly<Record<string, OwnerId>> | undefined;
  readonly ownerId: OwnerId;
}): string[]                                   // keeps orderedCells order
export function placementPassableForSide(args: {
  readonly cell: string;
  readonly placingOwnerId: OwnerId;
  readonly ownerByH3: Readonly<Record<string, OwnerId>> | undefined;
  readonly basePassable: (cell: string) => boolean;
}): boolean                                    // false on another owner's fortified cell
export function orderParentsForFortifiedPlacement<T extends { readonly player: string; readonly unitType: string }>(
  parents: readonly T[],
  defenderSide: OwnerId
): T[]                                         // missiles, then defenderSide's other parents, then the rest; stable
export function takeFortifiedCellForDefender(args: {
  readonly cells: readonly string[];
  readonly held: ReadonlySet<string>;
  readonly passable: (cell: string) => boolean;
  readonly occupiedByHex: Map<string, InitialPlacementSide>;
  readonly placingSide: InitialPlacementSide;
}): string | null                              // first unheld, passable cell that claimInitialPlacementHex accepts
```

Change `computeTacticalBattleSnapshot` as follows:

1. **Owners.** In the builder, `listTacticalFeatureOverridesForGame()` is called inline in the seaport and airport loop (around line 439). Hoist it into `const featureRows = listTacticalFeatureOverridesForGame();` and use `featureRows` in that loop. Then build `ownerByH3` with `buildTacticalFortificationOwnerRecord({ rows: featureRows, footprint: children, controllerOf: getHexController })`. Add `getHexController` to the existing import from `../gameDb`. Leave the call in `refreshTacticalBattleTerrainFromGameDb` alone.
2. **Defender.** `defenderSide` is `getHexController(enclosingStrategicH3Index)` when that is the human or `opposingPartyId`, and null otherwise. When `defenderSide` is set, `defenderFortifiedCells` is `fortifiedCellsForOwner({ orderedCells, ownerByH3, ownerId: defenderSide })`. Otherwise it is `[]`.
3. **Parent order.** When `defenderSide !== null && defenderFortifiedCells.length > 0`, `parentsInPlacementOrder` becomes `orderParentsForFortifiedPlacement(inHex, defenderSide)`. Otherwise keep today's order exactly.
4. **Held cells.** Before the parent loop, create `const defenderHeldCells = new Set<string>()`. Inside the parent loop, hoist today's `placed += 1;` and `subUnits.push({...})` into a local `placeSubUnit(cell)`. That function also adds `cell` to `defenderHeldCells` when `placingSide === defenderSide`.
5. **Fortified cells first.** Inside the `while`, for a non-missile parent whose `placingSide === defenderSide`, first try `takeFortifiedCellForDefender({ cells: defenderFortifiedCells, held: defenderHeldCells, passable: genericPassable, occupiedByHex, placingSide })`.
   - When it returns a cell, call `placeSubUnit(cell)` without moving `cellCursor`, and continue.
   - Otherwise, place as today.
6. **Passability.** Wrap both passable callbacks, the missile one and `genericPassable`, in `placementPassableForSide({ cell, placingOwnerId: placingSide, ownerByH3, basePassable })`. Then no side, missiles included, lands on another owner's fortified cell.
7. **Result.** Set `tacticalFortificationOwnerByH3` on the returned snapshot when `ownerByH3` is not empty.

A defender missile that lands on a fortified cell counts as holding it. Battles with no fortified core cell place exactly as before.

**Hits on fortified cells.** Create [`src/main/tacticalBattle/tacticalFortificationSoak.ts`](../src/main/tacticalBattle/tacticalFortificationSoak.ts):

```ts
export function createTacticalFortificationHooks(
  battle: Pick<TacticalBattleSnapshot, 'coreChildH3Indexes' | 'tacticalChildH3Indexes' | 'enclosingStrategicH3Index'>
): FortificationCombatHooks
```

- It reads the controller once, with `getHexController(battle.enclosingStrategicH3Index)`. The core set is `battle.coreChildH3Indexes ?? battle.tacticalChildH3Indexes`.
- `absorbHit(victim)` strips the cell and returns true when all of these hold:
  - the controller is not null;
  - `victim.player` is the controller;
  - the cell is in the core set;
  - `isTacticalCellFortified(victim.h3Index)` is true.
- It provides no `isEnemyFortifiedHex` or `stripOne`, so battles have no siege.

Wire it in `applyTacticalAirStrikeThenRangedPhaseOnBattle` (`tacticalStrategicOrderPhases.ts`). Create the hooks once, then:

- pass them to `runRangedPhase` as `options.fortification`;
- pass `absorbHit` to each air-vs-units strike:
  - `TacticalAirStrikeOnUnitsInput` gains `readonly absorbHit?: (victim: FortificationVictim) => boolean`.
  - In `resolveTacticalAirStrikeAgainstUnitsOnSubUnits`, a victim it absorbs is not marked as a casualty.
  - Update that module's comment, which says it never touches the database.

Do not pass hooks to tactical melee. Enemies can never stand on a fortified cell, so a melee soak cannot happen there. Infrastructure fire at a fortified cell already strips it.

**Movement.** Create [`src/shared/tacticalFortificationMovement.ts`](../src/shared/tacticalFortificationMovement.ts):

```ts
export function isCellBlockedByFortification(
  battle: Pick<TacticalBattleSnapshot, 'tacticalFortificationOwnerByH3'>,
  cell: string,
  moverPlayer: string
): boolean                                      // the cell has an owner in the record, and it is not moverPlayer
export function tacticalMarchSetForMover(args: {
  readonly battle: Pick<TacticalBattleSnapshot, 'tacticalChildH3Indexes' | 'tacticalFortificationOwnerByH3'>;
  readonly moverPlayer: string;
  readonly originH3?: string;
}): Set<string>                                 // the footprint minus blocked cells, always keeping originH3
```

With no record, the march set is the whole footprint, as today. Use these helpers at every site below.

- **`tacticalSnapshotGuards.ts`** (`tacticalComputeMovementOrderOutcomeForPlayer`):
  - Keep the `outside_footprint` check on `args.tacticalSet`.
  - Right after it, return `{ ok: false, reason: 'fortified_cell', context: { unitId, toH3Index } }` when the destination is blocked for `player`.
  - Build `const marchSet = tacticalMarchSetForMover({ battle: args.battle, moverPlayer: player, originH3: u.h3Index })`. Use it in place of `args.tacticalSet` in three places: the planner call, the best-effort call, and `logTacticalMarchPlanOk`.
  - Add `'tacticalFortificationOwnerByH3'` to the `battle` Pick, and `'fortified_cell'` to `TacticalMovementBlockReason`.
- **`tacticalBattleSession.ts`.** `humanTacticalMarchBlockMessage` maps `'fortified_cell'` to `FORTIFIED_CELL_BLOCKED_REASON`.
- **`humanTacticalDraftCommit.ts`:**
  - Add `tacticalChildH3Indexes: preBattle.tacticalChildH3Indexes` to `terrainBattle`, so the planner cache builds its adjacency from the full footprint.
  - Both `tacticalMarchFirstStopAlongPath` calls, human and opponent, use `tacticalMarchSetForMover({ battle: preBattle, moverPlayer: <the sub-unit's player>, originH3: from })`.
  - Delete the `const tacticalSet` local in `commitHumanTacticalDraftOrders` (about line 289) that this leaves unused; the lint step rejects unused variables. Keep the other `tacticalSet` near the top of the file (about line 70), which is still passed to `tacticalComputeMovementOrderOutcome`.
- **`src/shared/collectTacticalLegalMoveDestinationHexes.ts`.** Both functions plan over the mover's set, so their parity test holds. Add `'tacticalFortificationOwnerByH3'` to the battle `Pick` they take.
- **`src/shared/tacticalMarchHoverPreview.ts`:**
  - In `buildPreviewForSubUnit`, before the footprint membership check, return an invalid preview with `invalidReason: FORTIFIED_CELL_BLOCKED_REASON` when the hovered cell is blocked for `HUMAN_SEAT_ID`.
  - Both preview builders plan over `tacticalMarchSetForMover({ battle, moverPlayer: HUMAN_SEAT_ID })`.
- **`src/shared/orderPreviewBlockingCopy.ts`.** `blockingHoverMessageFromMarchInvalidReason` returns `FORTIFIED_CELL_BLOCKED_HOVER` for `FORTIFIED_CELL_BLOCKED_REASON`.
- **`src/main/tools/tacticalPathfinding.ts`** (AI route tools):
  - `buildTacticalRouteSet`, its unfiltered fallback, and the best-effort set use the mover's set.
  - `executeTacticalPlanRoute` returns `FORTIFIED_CELL_BLOCKED_REASON` as its error when the destination is blocked, before planning.
  - In `executeTacticalCheckDistance` (`check_distance`), add `player: briefingSeatForBattle(battle)` to the `mover` literal and drop the fourth argument to `estimateTacticalMarch`, so the mover's set is used. Keep `footprint` only for the membership check and the naval redirect.
- **`src/main/tools/tacticalMarchEstimate.ts`.** The default set is the mover's set. Add `player` to its mover Pick.
- **Ferry** (`src/main/tacticalBattle/tacticalFerryAirportGuards.ts`):
  - `tacticalFerryAirportRejectionReason`, `collectTacticalLegalFerryDestinationHexes`, and `tacticalFerryApplyOutcome` gain a `moverPlayer: string` parameter.
  - A destination blocked for that player is rejected with `FORTIFIED_CELL_BLOCKED_REASON`, or left out of the list.
  - Add `'tacticalFortificationOwnerByH3'` to `TacticalFerryAirportBattle` and to the inline `Pick` on `tacticalFerryApplyOutcome`.
  - Update the callers in `tacticalFerryAirportGuards.ts` itself, `tacticalOpponentOrderValidation.ts`, `possibleUnitActions.ts`, and `tacticalStrategicOrderPhases.ts`.
  - In `src/main/tacticalBattle/tacticalFerryAirportGuards.test.ts`, add `HUMAN_SEAT_ID` as the new argument to every call of the three functions.

**Rendering.**

- `paintBattleFootprintTerrain` reads owners from `S.tacticalBattleSnapshot.tacticalFortificationOwnerByH3`, in place of the override row and the parent controller, and colors each fortified cell with `fortificationTickColor(owner, true)`. Both sides in a battle can see who holds each cell.
- `battleTerrainTooltipState` (`terrainTooltipStrategicState.ts`) sets `isFortifiedCell` when the cell is in that record.

**Tests.**

- [`src/shared/tacticalFortificationMovement.test.ts`](../src/shared/tacticalFortificationMovement.test.ts):
  - the owner moves through;
  - another side is blocked;
  - the origin is always kept;
  - no record means the full footprint.
- [`src/main/tacticalBattle/tacticalFortificationPlacement.test.ts`](../src/main/tacticalBattle/tacticalFortificationPlacement.test.ts): the four helpers.
- [`src/main/tacticalBattle/tacticalFortificationOwners.test.ts`](../src/main/tacticalBattle/tacticalFortificationOwners.test.ts): `buildTacticalFortificationOwnerRecord` maps margin and core cells to their parents' controllers and skips unfortified rows.
- `src/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.ts`. The fixture's target hex is not guaranteed to suit this test, so set it up:
  1. `setHexController(target, HUMAN_SEAT_ID)`.
  2. Fortify two cells from `listFortifiableCellsForHex(target)` that are in `tacticalBattleFootprint(target).coreChildH3Indexes`. Assert, with a message, that at least two exist, as the missile placement test does.

  Then:
  - each of the two fortified cells holds at least one defender sub-unit, and no attacker sub-unit sits on either.
  - Without fortifications, the existing placement assertions pass unchanged.
- `src/main/tacticalBattle/tacticalMovementApply.test.ts`: an attacker march onto a defender-fortified cell returns `fortified_cell`.
- [`src/main/tacticalBattle/tacticalFortificationSoak.test.ts`](../src/main/tacticalBattle/tacticalFortificationSoak.test.ts):
  - a defender sub-unit on a fortified core cell is absorbed once, then not;
  - an attacker sub-unit is never absorbed;
  - a margin cell is never absorbed.

**Verify:**

1. `npm test`.
2. `npm run check:circular`.
3. `npm run build:renderer`.
4. `npm start`:
   1. Fortify a frontline hex, keep units in it, and accept a battle there. Your sub-units start on the fortified cells, and the AI's sub-units never step onto them. The first hit on a fortified cell removes its ticks at the end of that beat, and your unit survives.
   2. Attack an enemy fortified hex that still has unfortified land cells, and accept the battle. Hovering a fortified cell with one of your units selected shows `Blocked: Fortified`.

No `doc/` edits.

## Phase 8: AI commander

**Goal.** The AI knows the rules, sees fortifications where it may, includes the soak in its combat estimates, and can queue fortifications.

**Rule text.** Create [`src/main/openRouter/promptSpec/gameRuleFortificationText.ts`](../src/main/openRouter/promptSpec/gameRuleFortificationText.ts). Like `gameRuleMissileText.ts`, it imports the gate type with `import type { GameRuleTextGates } from './gameRuleText'`.

```ts
export function buildFortificationRule(gates: GameRuleTextGates): string | null
export function buildFortificationProductionRulePart(): string
```

- **Strategic mode** returns:

  `Fortifications: a hex's controller may fortify its intact city cells through production, one cell per item. Every hit that would destroy one of the controller's units in a fortified hex destroys one fortification instead, until none remain. Control of a fortified hex cannot change while any fortification remains. Units alone in an enemy fortified hex roll their attack against the fortifications each turn. A ranged_attack may target an explored enemy fortified hex that holds no units. This is the one ranged target you may order without a Best Options row. Air strikes and missiles remove a cell's fortification before they can destroy the cell.`

  The item name and its cost appear only in the production cost line, so models consulted without production tools are not told to queue anything.
- **Tactical mode** returns this text when `gates.hasFortifiedCells === true`, and null otherwise:

  `Fortified cells (F for yours, f for the enemy's) belong to the controller of their hex, and enemy units cannot enter them. Inside the battle hex, each fortified cell absorbs one hit aimed at its owner's units on that cell, and fire at it removes the fortification first.`
- **Production part:** ``fortification cost ${fortificationCostPerCell()} per city cell (queue unitType "fortification", one cell per item)``.

Wire it in:

- `GameRuleTextGates` gains `readonly hasFortifiedCells?: boolean` ("omitted means false").
- `buildCombatRulesParagraph` appends `buildFortificationRule(gates)` when it is not null.
- `buildProductionCostRulesLine` appends `buildFortificationProductionRulePart()` after the unit costs.
- `CoordinateContext` (`src/main/briefing/map/coordinateContext.ts`) gains `readonly hasFortifiedCells?: boolean`.
  - `requestOrdersFlow.ts` sets it in the tactical context, from `Object.keys(tacticalBattle.tacticalFortificationOwnerByH3 ?? {}).length > 0`.
  - `openRouterBuildSystemPrompt.ts` passes `hasFortifiedCells: coordinateContext.hasFortifiedCells === true` into the gates.

**Production.**

- **Schema enums.**
  - `openRouterToolCatalog.ts`: add `BUILD_QUEUE_ITEM_SCHEMA_ENUM = [...ALL_BUILD_QUEUE_ITEM_TYPES]` and use it for `set_build_queue`'s `unitType`. `forUnitType` keeps `BUILD_UNIT_TYPE_SCHEMA_ENUM`.
  - `envelopeJsonSchema.ts`: the `productionOrders` `unitType` enum uses `ALL_BUILD_QUEUE_ITEM_TYPES`.
- **Orders.** In `productionOrders.ts`, `ProductionOrder.unitType` becomes `BuildQueueItemType`, and `normalizeProductionOrders` accepts `isBuildQueueItemType`.
- **`setBuildQueue`** (`productionTools.ts`):
  - The type check and its error text use `isBuildQueueItemType` and `ALL_BUILD_QUEUE_ITEM_TYPES.join('|')`.
  - The availability check uses the full `availableUnitTypes`.
  - The cap check keeps the unit-only list. A fortification is never capped.
  - For every cap rule and cap message, `fortification` is not "another type": the cap check and the all-at-cap note look at unit types only. Do not edit `PRODUCTION_REQUIREMENT_BASE` or `PRODUCTION_CAP_QUEUE_GUIDANCE` in `promptText.ts`; a contract test pins their text, and the unit-only rule is already met by the table cell and the cap check.
- **`summarizeQueue`** (same file):
  - `availableUnitTypes` becomes the unit-only filtered list, plus `'fortification'` when the full list contains it.
  - When `queue.controlledByRequester` is true, it adds `fortifiedCount` and `fortifiableCount` from `getStrategicInfrastructureForHex(queue.h3Index)`. `query_production` can summarize any hex, and another seat's counts are not the AI's to see this way.
- **Submit clause.** In `promptText.ts`, `buildProductionSubmitClause` lists `ALL_BUILD_QUEUE_ITEM_TYPES.join('|')`.
- **Production table** (`briefingSections.ts`, `buildProductionBriefingBlock`):
  - The hex table gains a `FORTIFIED_COLUMN_HEADER` column after `Urban Hexes`, valued `${fortifiedCount}/${fortifiedCount + fortifiableCount}`.
  - Add both counts to `ControlledHexQueueSnapshot` and `NormalizedControlledHexQueueRow`, and fill them where the rows are built.
  - The available-types cell, and the caps and counts lines, stay unit-only.
  - The empty-row placeholder array gains a seventh `'—'` for the new column.

**Seeing fortifications.** Every reader below shows counts only for explored hexes, the way `briefingSectionsMissiles.ts` does: a hex counts as explored when `state.exploredHexes` is absent or includes it.

- **Snapshot rules.** Create [`src/shared/fortificationSnapshotRules.ts`](../src/shared/fortificationSnapshotRules.ts), pure over `GameStateSnapshot`:
  ```ts
  export function isHexExploredInSnapshot(state: GameStateSnapshot, h3Index: string): boolean
  export function isExploredEnemyFortifiedHex(state: GameStateSnapshot, h3Index: string, player: string): boolean
  ```
  - `isHexExploredInSnapshot` is true when `state.exploredHexes` is absent or includes the hex. Use it for every explored check in this phase.
  - `isExploredEnemyFortifiedHex` does not check occupancy. It is true when three things hold: the hex's controller in `state.strategicControl` is not null and not `player`; its `fortifiedCount ?? 0` in `state.strategicInfrastructure` is above 0; and it is explored. The validator adds `!hasEnemy`.
- **Hex Features cell** (`possibleUnitActionsIndexedState.ts`). `describeInfrastructure(inf)` has no hex or state, so the fog rule is applied when the counts are indexed:
  - `InfraCounts` gains `readonly fortified: number`.
  - `buildPossibleActionsIndexedState` sets it to `row.fortifiedCount ?? 0` when `isHexExploredInSnapshot(state, row.h3Index)`, and to 0 otherwise. The `getInfra` fallback gains `fortified: 0`.
  - `describeInfrastructure` appends `formatFortifiedFeaturePart(n)` after the urban part when `fortified > 0`. `featuresCellForHex` and `featuresCellForStrike` then show it.
- **Missile targets table.** `briefingSectionsMissiles.ts` gains a `FORTIFIED_COLUMN_HEADER` column after `Seaports`, valued `${fortifiedCount}/${fortifiedCount + fortifiableCount}` from the target's infrastructure row. The table already lists only explored hexes.
- **`assess_hex`.** `src/main/tools/assessment.ts` reports `fortifiedCount` when it is above 0 and the hex is explored.
- **AI ranged validation.** `validateAiRangedOrder` (`src/main/openRouter/openRouter.ts`) is private, and that file is near its size limit. Its strategic branch rejects with `if (!hasEnemy) return { valid: false, reason: 'Target hex has no enemy' };`. Change the condition to `!hasEnemy && !isExploredEnemyFortifiedHex(state, order.targetH3Index, unit.player)`. That mirrors the human validation in one line.

**Estimates.**

- **Prediction.** `computeEngagementPrediction` (`src/main/tools/combatEstimation.ts`) gains a fifth parameter, `defenderSoak = 0`:
  - Defender losses become `Σ min(max(k − defenderSoak, 0), defenderCount) · p(k)`.
  - Elimination needs `k ≥ defenderCount + defenderSoak`.
  - `attackerHitsExpected` keeps today's value, `Σ min(k, defenderCount) · p(k)`, computed without the soak. With `defenderSoak = 0` every output is unchanged.
- **Soak lookup.** Create [`src/main/tools/combatEstimationFortification.ts`](../src/main/tools/combatEstimationFortification.ts):
  ```ts
  export function defenderFortificationSoak(args: {
    readonly state: GameStateSnapshot;
    readonly defendingH3Index: string;
    readonly defendingPlayer: string;
    readonly battle?: Pick<TacticalBattleSnapshot, 'tacticalFortificationOwnerByH3' | 'coreChildH3Indexes' | 'tacticalChildH3Indexes'>;
  }): number
  ```
  - **In a battle:** 1 when the defending cell is a core cell (`coreChildH3Indexes ?? tacticalChildH3Indexes`) and is in the record with `defendingPlayer` as owner. Otherwise 0, because margin cells never soak.
  - **On the strategic map:** the hex's `fortifiedCount` when `defendingPlayer` controls it and `isHexExploredInSnapshot(state, defendingH3Index)` is true, and 0 otherwise.
- **Callers.** Pass the result as `defenderSoak` in all three `computeEngagementPrediction` calls in `executeEstimateCombat` (`combatEstimation.ts`): the ranged call and both melee calls. The defending player is `defenders.combat[0]?.player`; with no defenders, the soak is 0. That file is at 578 lines and must stay at or under 600.

**Tactical map.**

- **Cell state.** `HexMapCellState.features` (`hexMapRenderer.ts`) gains `readonly fortifiedByAi?: boolean`. In `buildTacticalHexGameStateMap` (`briefingMapSection.ts`), set it for each cell in the battle's `tacticalFortificationOwnerByH3`: true when the owner is `briefingOwnSeatId(state)`, false otherwise. Leave it undefined for unfortified cells. Its case must come from the fortification's owner, not from `controlledByAI`, which holds the enclosing hex's control for every footprint cell, margin cells included.
- **Glyph.** In `structuralOverlay`, a cell with `fortifiedByAi` defined, and without an airport or seaport, shows `F` when it is true and `f` when it is false, in place of `U` / `u`. `B`, `A`, and `S` keep precedence. A displaced `F` or `f` is listed like any other displaced feature.
- **Legend.** The tactical legend line in `briefingMapSection.ts` appends `FORTIFIED_MAP_LEGEND_FRAGMENT` after `U/u urban only`, only when at least one cell on the map is fortified.

**Tests.**

- [`src/main/openRouter/promptSpec/gameRuleFortificationText.test.ts`](../src/main/openRouter/promptSpec/gameRuleFortificationText.test.ts):
  - the strategic rule is present in strategic mode;
  - the tactical rule is null without `hasFortifiedCells`;
  - the production part contains `fortification cost 20 per city cell` on the global map.
- [`src/main/tools/combatEstimationFortification.test.ts`](../src/main/tools/combatEstimationFortification.test.ts):
  - a soak of 2 against 1 defender with 2 sure hits predicts 0 defender losses;
  - `defenderFortificationSoak` returns 0 for an unexplored hex.
- `src/main/productionOrders.test.ts`: a `fortification` order is accepted.
- [`src/shared/fortificationSnapshotRules.test.ts`](../src/shared/fortificationSnapshotRules.test.ts), with snapshot literals: `isExploredEnemyFortifiedHex` is true for an explored enemy hex with a fortification, and false for one without a fortification, for the player's own hex, and for an unexplored hex.
- `src/main/openRouter/promptSpec/envelopeJsonSchema.test.ts`: the `productionOrders` enum contains `fortification`.

**Verify:**

1. `npm test`.
2. `npm run check:circular`.
3. `npm start` with a model key. Run an Observe-only global match for about 15 turns. In the consult log, check that:
   - the production table has the Fortified column;
   - the rules mention fortifications.

   Report whether any AI queued fortifications. If none did, say so. Do not change prompts to force it.

No `doc/` edits.

## Phase 9: Documentation

**Goal.** `doc/` describes what shipped. Follow [`AGENTS.md`](../AGENTS.md) "Keep `doc/` Current":

- Read each document before editing it, and match its voice, headings, and table layout.
- Take numbers and names from the code, and name the symbol.
- Keep this plan's phase names and numbers out of every document.
- No document here is generated. Edit only what changed, and make quoted prompt text match the builders' output exactly.

**Update in place:**

- **[`doc/combat-rules-v3.md`](../doc/combat-rules-v3.md):**
  - §2: production: the fortification item, its cost, and the pause rule.
  - §3.6 (missile): the sentence that each flagged city cell is destroyed unless it rolls a 20 gains the fortified-cell exception.
  - §4.2: empty enemy fortified hexes as ranged targets.
  - §4.6: siege, and the sentence "One side left holds the hex" gains the fortified-hex exception.
  - §4.9: the soak, before casualty order.
  - §4.10: elimination with fortifications.
  - §5: the flow. Siege comes after melee, and production fortifies cells.
  - §6, edge cases: two non-controller players, knockout to Neutral, and a contested fortified hex.
  - §6, control bullets ("territorial control changes immediately"): the fortified-hex exception.
  - §6, the sentence that any enemy-occupied hex in range is a valid ranged target: add empty enemy fortified hexes.
  - §8.1: air strikes on units are soaked.
  - §8.3–8.5: air strikes strip fortifications first.
  - §8.6 (missiles): the fortified-cell roll.
  - §11: summary.
  - §12 introduction: margin-cell fortifications block movement but are never struck or soaked.
  - §12.3 (entry-side injection, which describes opening placement): defenders start on fortified core cells, one sub-unit per cell, before the entry-side rule places the rest; no side is placed on a cell fortified by another owner.
  - §12.4 (movement): the block, and that it lifts from the next beat.
  - §12.5 (ranged combat): the soak, and fire at a fortified cell.
  - §13.1 item 7 (melee lightning): a siege hex shows melee lightning and dice although only one side is there.
  - §14 item 1: home control waits until a fortified hex's fortifications are gone.
  - §14.1 (knockout and Neutral): fortifications stay when a hex turns Neutral, and the sentence that Neutral units take every empty hex they enter gains the fortified-hex exception.
- **[`doc/how-to-play.md`](../doc/how-to-play.md):**
  - "Building units"
  - "How a turn resolves"
  - "Aiming ranged attacks and air strikes"
  - "Air power"
  - "Battles"
  - "Things that may surprise you", including its "Reading the turn report" bullet: a side also gets a section when it owned a hex whose fortifications fell; the fortification line sits in the owner's section after missile strike sentences; and a Neutral-owned one sits under Neutral Losses.
  - "Where messages appear"
- **[`doc/README.md`](../doc/README.md):** an engine constants row for `fortificationCostPerCell` and `FORTIFICATION_COST_INFANTRY_MULTIPLIER`.
- **[`doc/save-files.md`](../doc/save-files.md):** `EXPECTED_USER_VERSION` is 25.
- **[`README.md`](../README.md):** "How the Economy Works" and the opponent's tools, only where they are now wrong, and the test count in "Guardrails" if it is stated (run `npm test` and use its count).
- **`doc/ux/`:**
  - `build-popup.md` and `multi-hex-build-popup.md`: the Fortification item and the pause.
  - `hex-tooltips.md`: the Fortified line, `Fortified urban`, and `Blocked: Fortified`.
  - `map-surface.md`: the tick pattern, lit edges, and gray when control is unknown; and `∞t` on a production label also means every city cell is fortified.
  - `minimap.md`: `∞t` on a production label also means every city cell is fortified.
  - `input-map.md`: holding T also hides fortification ticks.
  - `terrain-legend.md`: the Fortified row.
  - `notifications-and-feedback.md` and `reports-tab.md`: the fortification line in the owner's loss section (Neutral Losses for a Neutral-owned hex); the opening rule, so a side also gets a section when it owned a hex whose fortifications fell; and the built and paused lines in Updates.
  - `control-tooltips.md`: the Keep-building note, and Source Anchors.
  - `order-lifecycle.md`.
  - `resolution-playback.md`: siege dice on an uncontested hex.
  - `tactical-battle-controls.md`.
  - `selection-panel.md` and `top-bar.md`, only if their text is now wrong.
- **[`doc/ux-specification.md`](../doc/ux-specification.md):** a glossary entry for fortification.
- **[`doc/ui-style-guide.md`](../doc/ui-style-guide.md):** §2.1 Map View (ticks), §2.9 Production / Build UI, and §3.3 Fog of War.
- **[`doc/ai-tools.md`](../doc/ai-tools.md):**
  - "Production", including the "all at cap" sentence;
  - "Assessment";
  - "Combat estimation";
  - "Pathfinding".
- **`doc/ai-commander-prompts/`:**
  - `strategic-prompt.md` and `tactical-prompt.md`;
  - `example-strategic-prompt.md` and `example-tactical-prompt.md`;
  - `source-inventory.md`, `information-decision-model.md`, `crosswalk.md`, `assembly-contract.md`, and `variants.md`.

  Update them wherever they mirror a builder this plan changed: the rules, the production table and submit clause, the cost line, the missile targets table, the tactical map legend, and the tool enums.
- **`doc/region-summary-1.md`:** the cost-scale line, if it lists build costs.

**Search** `doc/` and `README.md` for `rubble`, `city cells`, `build queue`, `Keep building`, `unitType`, `capture`, `control changes`, `casualt`, `absorb`, `legend`, `tooltip`, `availableUnitTypes`, `user_version`, `EXPECTED_USER_VERSION`, `∞t`, and `T is held`. Fix every maintained document that is now wrong. Also check [`doc/project-instructions.md`](../doc/project-instructions.md) and [`doc/coding-prompts-1.md`](../doc/coding-prompts-1.md) for any fact this work made wrong, and change only that fact.

**Leave alone:**

- [`doc/devleopment-plan-v3.4.md`](../doc/devleopment-plan-v3.4.md)
- [`doc/poc-analysis.md`](../doc/poc-analysis.md)
- [`doc/market-research.md`](../doc/market-research.md)
- `doc/release-notes/`

**Verify:** `npm test`. Report every document you edited, and any disagreement between `doc/` and the code that you could not settle.

## Risks to watch

- **Rubble without stripping.** The new CHECK makes any write that rubbles a fortified cell throw.
  - Every rubble writer is listed in Background and changed in Phase 2.
  - A constraint error during a turn means a writer was missed.
  - In `applyTacticalRangedRubbleToCell`, the error is logged, not thrown, so check the log.
- **Missile writes.** A missile roll on a fortified row must never reach `updateClearedFlags`, which writes rubble.
- **RNG drift.** A dice change in a match with no fortifications means one of these rules was broken:
  - every new combat draw goes through `next` (or `resumeNext` after a pause);
  - a new draw happens only when a fortification is affected;
  - production cell picks use their own seeded generator.
- **Soak loops.** An absorbed hit must not advance the victim index, and multi-side melee must still spend the hit (`hitsLeft -= 1`). Otherwise kills are lost, or one hit strips every fortification.
- **Siege timing.** Siege runs only on hexes that had no melee this turn. Judging single-player hexes after melee casualties would siege a hex where two players just fought.
- **Lost tallies at the pause.** Strips recorded before a melee-intercept pause must reach the turn report after the resume. The tally travels in `MeleeInterceptReadyPauseSnapshot`.
- **Capture paths.** Control changes in one function during a match. If a fortified hex changes hands, look there first. Knockout transfers to Neutral on purpose.
- **Stale renderer cache.** If ticks lag a turn behind, check `computeTacticalFeatureOverrideSignature`.
- **Bent ticks.** Ticks on a res1 or res3 hex that sit on half an edge mean the corner detection missed a distortion vertex.
- **Movement leaks.** A blocked cell must be blocked in every one of these:
  - the validator;
  - the first-stop planner;
  - the legal-move list;
  - the hover preview;
  - the AI route tools;
  - ferry.

  One missed site either lets units walk into fortified cells or makes a whole beat fail `march_validation`.
- **Owner record timing.** `tacticalFortificationOwnerByH3` is set when the battle starts and when a beat ends, and nowhere else. Refreshing it mid-beat would unblock movement in the same beat and split validation from playback.
- **Placement parity.** Battles without fortified cells must place exactly as before. The existing placement tests guard this.
- **Battles that cannot start.** If every core cell where the attacker can stand is fortified by the defender, the attacker cannot be placed. The hex is then not offered as a Fight, and the strategic soak applies instead. This is intended.
- **Siege counts as melee.** Siege hexes join the melee combat hexes, so besiegers count as melee participants (which can prompt an AI consult), and a siege the viewer cannot see produces the unknown-battle Updates line. This is intended. A match without fortifications is unaffected.
- **Failed beats keep their strips.** A tactical beat can fail validation after its fire has already written to the database. A fortification stripped by that fire stays stripped, as rubble and unit deletes already do today.
- **AI caps.** Until Phase 8, every AI view strips `fortification` from `availableUnitTypes`. Otherwise the AI's cap rules would treat an uncapped fortification as a buildable alternative.
- **Old saves.** The version bump makes every earlier save unloadable. That is accepted. Do not add a migration.
