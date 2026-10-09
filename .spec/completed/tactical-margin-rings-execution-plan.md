# Tactical battle margin rings

> **For agentic workers:** Implement this plan phase by phase. Do not copy phase titles into source, comments, configuration, or `doc/`. Do not commit or push. Do not edit `static/renderer.js`. After renderer TypeScript changes, rebuild with `npm run build:renderer` before any in-game check.

**Goal:** Make every tactical battle three rings larger than the enclosing strategic hex's own tactical cells. Units still deploy on the original edge. A shot in the margin never changes the enclosing strategic hex or any neighbor.

**Architecture:** One shared function builds two sets for an enclosing strategic hex. The core set is `tacticalChildrenOf`. The footprint is that set plus every tactical cell within three rings. The battle snapshot publishes both. Placement and destruction use the core. Terrain, roads, rails, and origin area are read for every footprint cell. Only a core cell can be rubbled, and that write still belongs to the enclosing hex. Embark and weather use the enclosing hex the caller already has. Air-base checks stay on `strategicParentOf`, because an air sub-unit remains on a core cell.

**Tech stack:** TypeScript, H3 (`gridDisk`, `tacticalChildrenOf`), existing tactical snapshot, renderer, and hex-code registry.

## Confirmed behavior

- Three extra rings. A normal strategic hex has 343 tactical children and **607** footprint cells. Fixture hex `81263ffffffffff` is the count to assert. A pentagon parent may differ. Do not assert 607 for every parent.
- Units still deploy on the original entry edge. `orderTacticalCellsForPlacement` in [src/main/tacticalBattle/computeTacticalBattleSnapshot.ts](src/main/tacticalBattle/computeTacticalBattleSnapshot.ts) receives only the core children. The three rings are extra ground, including behind that line. Sub-units may move into the margin and end there. After the battle, strategic units still occupy the enclosing strategic hex.
- Margin cells are indestructible for the battle. Killing a unit there, or shooting the cell, does not rubble it, break its road or rail, destroy an airport or seaport, prune a build queue, or destroy based air units. Nothing is written to `res_t_feature_overrides` or `res_s_infrastructure` for that cell. The enclosing hex's counts stay unchanged, and so do the neighbor's.
- Do not build a battle-only rubble overlay. The map paints rubble from `tacticalTerrainOverridesByH3`, which is loaded from the database, while movement reads `tacticalIsRubbleByH3` on the snapshot. A margin-only flag would need a second write path, a draw overlay, a tooltip overlay, and a merge inside `refreshTacticalBattleTerrainFromGameDb`. A mistaken insert would change a strategic hex. That is the larger path. Leave it out.
- Core cells keep today's destruction. `applyTacticalRangedRubbleToCell` and `applyInfrastructureDestructionEffects` still update a feature row whose stored parent is the enclosing hex, and the rollup still updates that hex only. `applyInfrastructureDestructionEffects` in [src/main/gameActions/airStrikeResolution.ts](src/main/gameActions/airStrikeResolution.ts) must keep rejecting a tactical cell whose geometric parent is not the hex being updated.
- Reads of a tactical cell use that cell, including in the margin: terrain kind, roads, rails, urban and rubble already in the terrain data, and origin country or regional origin area (`tacticalCountryNamesForCells`). A margin city or road still slows movement and still gives cover. It is not a legal infrastructure target.
- Weather stays the enclosing hex's battle weather. Embark uses that same enclosing hex, including when the sub-unit stands in the margin. Battle control stays on that hex. An air sub-unit's airport check stays `strategicParentOf` of its cell, which is the enclosing hex because air does not march and cannot ferry onto a margin airport.
- Unit-versus-unit combat, movement, range, line of sight, pathfinding, ferry between the enclosing hex's own airport cells, clicks, the camera, and the AI map use the footprint. The face-crossing distance fallback stays. The larger footprint hits it more often. Do not remove it.
- `tacticalChildrenOf` in [src/shared/h3Resolutions.ts](src/shared/h3Resolutions.ts) stays "geometric children." Unit birth in [src/main/unitOrigin/unitBirthOrigin.ts](src/main/unitOrigin/unitBirthOrigin.ts) keeps calling it.

## Global constraints

- CamelCase files and exported functions under `src/`. Exported types are PascalCase. Role suffixes only: `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, `Types`. No `Utils` or `Impl`.
- Orienting comments on every new field and non-overriding method: why it exists, when to use it, expected outcome, exceptions.
- The footprint helper is pure and called from snapshot build and tooltip labeling. It does not log. Public main-process methods that start calling it keep their existing debug logs.
- Tests cover the happy path and essential failures only.
- Desirable file size 600 lines, hard limit 1000. Desirable argument count 6, hard limit 10.
- Do not put this plan's section titles into version-controlled product code, comments, or `doc/`.
- Do not commit or push.
- Update living docs in `doc/`. Do not edit files under `.spec/completed/`.

## Files

- Create [src/shared/tacticalBattleFootprint.ts](src/shared/tacticalBattleFootprint.ts) and [src/shared/tacticalBattleFootprint.test.ts](src/shared/tacticalBattleFootprint.test.ts).
- Edit [src/main/tacticalBattle/computeTacticalBattleSnapshot.ts](src/main/tacticalBattle/computeTacticalBattleSnapshot.ts) and [src/shared/tacticalBattleTypes.ts](src/shared/tacticalBattleTypes.ts) (`tacticalChildH3Indexes` comment, and new `coreChildH3Indexes`).
- Edit membership and destruction gates: [src/main/gameActions/tacticalHumanAirStrikeValidation.ts](src/main/gameActions/tacticalHumanAirStrikeValidation.ts), [src/main/tacticalBattle/tacticalStrategicOrderPhases.ts](src/main/tacticalBattle/tacticalStrategicOrderPhases.ts), [src/shared/tacticalTerrainCombatModifiers.ts](src/shared/tacticalTerrainCombatModifiers.ts), [src/main/gameActions/tacticalRangedInfrastructureRubble.ts](src/main/gameActions/tacticalRangedInfrastructureRubble.ts), [src/renderer/tactical/tacticalUiGuards.ts](src/renderer/tactical/tacticalUiGuards.ts), [src/main/tacticalBattle/tacticalOpponentOrderValidation.ts](src/main/tacticalBattle/tacticalOpponentOrderValidation.ts), [src/main/tacticalBattle/tacticalSealiftSlotUpdate.ts](src/main/tacticalBattle/tacticalSealiftSlotUpdate.ts), [src/main/gameActions/humanTacticalDraftCommit.ts](src/main/gameActions/humanTacticalDraftCommit.ts), [src/main/openRouter/requestOrdersApplyParsed.ts](src/main/openRouter/requestOrdersApplyParsed.ts).
- Edit drawing and battle hit-testing: [src/renderer/rendering/terrainRendering.ts](src/renderer/rendering/terrainRendering.ts), [src/renderer/rendering/tacticalCityOverlays.ts](src/renderer/rendering/tacticalCityOverlays.ts), [src/renderer/wiredEntryCallbacks.ts](src/renderer/wiredEntryCallbacks.ts), [src/renderer/map/terrainTooltipStrategicState.ts](src/renderer/map/terrainTooltipStrategicState.ts), and [src/main/rendererConsolidation.test.ts](src/main/rendererConsolidation.test.ts).
- Edit codes: [src/main/briefing/map/hexCoordinates.ts](src/main/briefing/map/hexCoordinates.ts), [src/shared/hexLlmCodeAssignment.ts](src/shared/hexLlmCodeAssignment.ts), and the tactical tooltip path that calls `getTacticalChildCodeWithinParent`.
- Edit [doc/combat-rules-v3.md](doc/combat-rules-v3.md) section 12, [doc/ai-commander-prompts/tactical-prompt.md](doc/ai-commander-prompts/tactical-prompt.md), and the tactical preamble in [src/main/openRouter/promptText.ts](src/main/openRouter/promptText.ts).

Keep these filters. They limit persisted destruction to the enclosing hex:

- `parentH3Index === enclosingStrategicH3Index` in [src/main/tacticalBattle/tacticalStrategicOrderPhases.ts](src/main/tacticalBattle/tacticalStrategicOrderPhases.ts), [src/main/openRouter/possibleUnitActions.ts](src/main/openRouter/possibleUnitActions.ts), and [src/main/gameActions/tacticalGroupRangedTargetValidation.ts](src/main/gameActions/tacticalGroupRangedTargetValidation.ts).
- The parent mismatch return in `applyInfrastructureDestructionEffects`.

Those filters are not enough on their own. `tacticalHasStrikeableInfrastructure` returns true for `tacticalIsUrbanByH3` or a road or rail corridor before it looks at feature rows. A margin city or road would otherwise call `applyTacticalRangedRubbleToCell` with the enclosing hex, and the insert branch would write a rubble row parented to that hex.

## Cache

Cache one record per enclosing strategic hex while a map profile is loaded. Key it by strategic resolution, tactical resolution, and the hex index. Store `coreChildH3Indexes`, `h3Indexes`, and `codeByH3`. Clear it with `registerActiveGameMapReset`, the same way [src/shared/hexLlmCodeAssignment.ts](src/shared/hexLlmCodeAssignment.ts) drops its code map.

`h3Indexes` is `sortCellsForStableLlmCodes` of the footprint, so briefing codes and tooltips share one order. `codeByH3` uses `indexToCode`. 607 is inside the 1,296-code alphabet.

Do not add a second cache of terrain, roads, or country names. The snapshot already freezes those, and rubble refresh reloads them from the database.

## Phase 1  -  Footprint helper

Create `tacticalBattleFootprint(enclosingStrategicH3Index)` in [src/shared/tacticalBattleFootprint.ts](src/shared/tacticalBattleFootprint.ts).

- `TACTICAL_BATTLE_MARGIN_RINGS` is `3`.
- `coreChildH3Indexes` is `tacticalChildrenOf(enclosingStrategicH3Index)`. `h3Indexes` is every core cell plus `gridDisk(cell, 3)` for each core cell, then stably sorted.
- Freeze both arrays and the code map before caching them. Return those same frozen instances on the next call. A caller must not be able to push into them. A different hex is a different record.
- Export `tacticalBattleHexCode(enclosingStrategicH3Index, tacticalH3Index)`. It builds the cache entry for that enclosing hex in the calling process, then reads `codeByH3`. Unknown cells return `undefined`. Main and the renderer each bundle `src/shared`, so a cache filled in one process is empty in the other. Do not log from this function. It runs once per painted label.
- Do not export a helper that turns an arbitrary cell into a strategic hex. Callers already hold `enclosingStrategicH3Index`. Calling H3 on a fixture id such as `hex-a` throws.

Tests in [src/shared/tacticalBattleFootprint.test.ts](src/shared/tacticalBattleFootprint.test.ts):

- Run the count assertions inside `withGameMap(GLOBAL_GAME_MAP, ...)`, the same helper [src/shared/h3Resolutions.test.ts](src/shared/h3Resolutions.test.ts) uses, so a leftover regional profile cannot change the numbers.
- `81263ffffffffff`: 343 core cells, 607 footprint cells, every core cell included, every added cell's `strategicParentOf` is not the fixture.
- One resolution-3 hexagon under a profile with `strategicResolution: 3` and `tacticalResolution: 6` also has 343 core cells and 607 footprint cells. Use `strategicCellAt(12, 34)`, the point [src/shared/h3Resolutions.test.ts](src/shared/h3Resolutions.test.ts) already treats as a hexagon. The ring count is in tactical steps, so the gap of three resolutions stays the same size.
- Second call returns the same array instances.
- `getPentagons(1)[0]` from `h3-js` is already a resolution-1 pentagon. Pass it directly. Do not call `cellToParent`. The footprint is non-empty and the call does not throw. Do not assert 607.
- A tactical cell four rings outside the core is absent. Build that cell from `gridDisk` on a core boundary cell, not by guessing an index.

Verify: `npm run build:main`, then `node dist/shared/tacticalBattleFootprint.test.js`.

## Phase 2  -  Snapshot

In `computeTacticalBattleSnapshot`, replace the single `tacticalChildrenOf` result with the cached footprint.

- `tacticalChildH3Indexes` is `h3Indexes`.
- Pass `coreChildH3Indexes` to `orderTacticalCellsForPlacement` and to `childFootprint` for opening passability. Do not pass the margin into placement.
- Copy terrain kind, urban and rubble flags already on the merged terrain row, and road and rail overlays for every footprint cell. `tacticalCountryNamesForCells` receives the footprint. Kind fallback, in order: the tactical row, then the geometric parent's kind when that strategic hex is in the loaded match, then the enclosing hex's kind. Do not throw when the parent is outside the loaded regional footprint. Three tactical rings can reach a strategic hex the map did not load. Use this same order when drawing, so the painted kind and the movement kind match. Do not query a parent for every footprint cell. Look one up only when the tactical row is missing.
- Airport and seaport flags still come from `listTacticalFeatureOverridesForGame` rows whose `h3Index` is in the **core** set. A neighbor's airport must not become a tactical airport, ferry destination, or strikeable facility.
- `refreshTacticalBattleTerrainFromGameDb` in the same file must use that same split. Today it treats `tacticalChildH3Indexes` as both the read set and the facility set. After this change the read set is the footprint and the airport and seaport set is the core. A refresh must not copy a neighbor's airport or seaport onto the snapshot.
- Add optional `coreChildH3Indexes?: readonly string[]` to `TacticalBattleSnapshot`, with an orienting comment. Production sets it to the footprint helper's core array. It stays optional so existing snapshot literals still typecheck. Destruction reads it when present. The playable area stays `tacticalChildH3Indexes`. `refreshTacticalBattleTerrainFromGameDb` spreads the battle, so it keeps this array. Do not rebuild it from H3 inside the refresh. When the array is missing, infrastructure checks keep today's parent test instead of treating every cell as indestructible or as a core cell.
- Update the contract comment on `tacticalChildH3Indexes` in [src/shared/tacticalBattleTypes.ts](src/shared/tacticalBattleTypes.ts). It is the battle footprint, a superset of the geometric children. Order is the stable code order. The comment today says the list is a subset of the geometric children. That sentence becomes false.
- [src/main/tacticalBattle/computeTacticalBattleSnapshot.ts](src/main/tacticalBattle/computeTacticalBattleSnapshot.ts) is already near the desirable 600-line limit. Keep the ring algorithm in the shared module. Do not move placement into a new block in this file.

Verify with a focused test that does not require a full match if the snapshot builder needs SQLite. Assert the placement input by extracting no new behavior: a test can call `tacticalBattleFootprint` and document that placement cells are the core. If [src/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.ts](src/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.ts) already starts a battle, assert `tacticalChildH3Indexes.length` is greater than `tacticalChildrenOf(enclosing).length` and that every `subUnits[].h3Index` is a core child. Do not assert a placed unit sits in the margin.

Verify: `npm run build:main`, then the footprint test and the snapshot test file that was updated.

## Phase 3  -  Membership gates

Inside the footprint, a cell is in the battle even when `strategicParentOf` is a neighbor. A margin cell is still not a destruction target.

- [src/shared/tacticalTerrainCombatModifiers.ts](src/shared/tacticalTerrainCombatModifiers.ts): `tacticalHasStrikeableInfrastructure` returns false when `coreChildH3Indexes` is present and the cell is not in it. Urban, seaport, and road or rail flags on a margin cell do not make it strikeable. When `coreChildH3Indexes` is omitted, keep today's behavior. Do not call `tacticalBattleFootprint` or `strategicParentOf` here. Fixture battles use ids such as `hex-a`, and H3 throws on those. The function's contract stays non-throwing. `collectTacticalLegalRangedTargetHexes` passes the same battle object, so it picks up the array with no extra argument.
- [src/main/gameActions/tacticalRangedInfrastructureRubble.ts](src/main/gameActions/tacticalRangedInfrastructureRubble.ts): at the start of `applyTacticalRangedRubbleToCell`, if `strategicParentOf(tacticalH3Index)` is not `strategicParentH3Index`, log at debug and return `{ changed: false, destroyedAirUnitsCount: 0 }`. Do this before the insert branch. This is the guard against a margin road becoming a rubble row parented to the enclosing hex.
- [src/main/gameActions/tacticalHumanAirStrikeValidation.ts](src/main/gameActions/tacticalHumanAirStrikeValidation.ts): keep the footprint check. `targetType === 'units'` is legal on a margin cell that contains an enemy. For `urban`, `airport`, and `seaport`: when `coreChildH3Indexes` is present, reject a target outside it; when it is absent, keep today's `strategicParentOf(target) === enclosing` reject. For a core cell, keep the existing `getStrategicInfrastructureForHex(enclosingStrategicH3Index)` checks unchanged. Do not call `getStrategicInfrastructureForHex(strategicParentOf(target))`.
- [src/main/tacticalBattle/tacticalOpponentOrderValidation.ts](src/main/tacticalBattle/tacticalOpponentOrderValidation.ts): `validateTacticalOpponentAirStrikeOrder` gets the same split. Its caller [src/main/openRouter/requestOrdersApplyParsed.ts](src/main/openRouter/requestOrdersApplyParsed.ts) has the battle and passes `coreChildH3Indexes`. A unit target anywhere in the plan-state hex list stays legal. When the core array is present, an infrastructure target outside it is invalid. When the array is absent, keep a parent test against the enclosing hex instead of rejecting every infrastructure target. Do not look up the neighbor's urban, airport, or seaport counts.
- [src/main/tacticalBattle/tacticalStrategicOrderPhases.ts](src/main/tacticalBattle/tacticalStrategicOrderPhases.ts): the air-strike branch around the `parent !== enclosing` check must resolve a unit strike whose target is in the footprint. Keep the feature-row filter. Do not call `applyTacticalRangedRubbleToCell` for a cell outside the core, including the defender-killed-on-hex loop and the infra-only loop.
- [src/renderer/tactical/tacticalUiGuards.ts](src/renderer/tactical/tacticalUiGuards.ts): a hit is inside the battle when it is the enclosing hex or a member of `tacticalChildH3Indexes`. Remove the `strategicParentOf(hit) === enclosing` fallback. A cell one ring past the margin is outside.
- Leave [src/main/returnFireAirportLookup.ts](src/main/returnFireAirportLookup.ts) and `tacticalParentAirportIntact` in [src/main/openRouter/possibleUnitActionsIndexedState.ts](src/main/openRouter/possibleUnitActionsIndexedState.ts) unchanged. `hasIntactAirportAtStrategicAirBase` is the strategic gate. Tactical air sub-units do not march, and ferry destinations stay core airports, so `strategicParentOf` of an air cell is already the enclosing hex. Rewriting those helpers would also run H3 against fixture ids.
- `canPlayerEmbarkFromTacticalHex` consults the enclosing strategic hex the caller already has, not `strategicParentOf` of the tactical cell. For a core cell those are the same hex. Pass `snap.enclosingStrategicH3Index` from [src/main/tacticalBattle/tacticalSealiftSlotUpdate.ts](src/main/tacticalBattle/tacticalSealiftSlotUpdate.ts), and thread that same index through `validateTacticalOpponentEmbarkOrder` from [src/main/gameActions/humanTacticalDraftCommit.ts](src/main/gameActions/humanTacticalDraftCommit.ts) and [src/main/openRouter/requestOrdersApplyParsed.ts](src/main/openRouter/requestOrdersApplyParsed.ts). The updated public function logs at debug with the enclosing hex and the player. Do not change `canManualDebarkFromHex`. It looks up a strategic hex row. Pointing it at a tactical cell or a neighbor is out of scope.

Do not change pathfinding, hover preview, or range. They already consume `tacticalChildH3Indexes`.

Tests:

- In [src/main/gameActions/tacticalRangedInfrastructureRubble.test.ts](src/main/gameActions/tacticalRangedInfrastructureRubble.test.ts): `applyTacticalRangedRubbleToCell(marginCell, enclosingHex, { insertStrikeableTransportCorridor: true, mergedTerrainKindForInsert: 'plains' })` returns `changed: false` and does not insert a row. The existing insert test uses a core cell whose parent is the enclosing hex. That test must still report `changed: true`.
- There is no air-strike validation test today. Add one file beside [src/main/gameActions/tacticalHumanAirStrikeValidation.ts](src/main/gameActions/tacticalHumanAirStrikeValidation.ts). A footprint cell outside the core is a legal `units` target. An `urban`, `airport`, or `seaport` target outside the core is rejected. A snapshot that omits `coreChildH3Indexes` still rejects an infrastructure target whose parent is not the enclosing hex.

Verify: `npm run build:main`, then the rubble test and the new air-strike validation test.

## Phase 4  -  Drawing

While a tactical snapshot is set, [src/renderer/rendering/terrainRendering.ts](src/renderer/rendering/terrainRendering.ts) and [src/renderer/rendering/tacticalCityOverlays.ts](src/renderer/rendering/tacticalCityOverlays.ts) iterate `tacticalChildH3Indexes`. Do not write that list into `tacticalChildrenByParent`. The strategic map and the strategic tooltip counts read that map and must keep geometric children after the battle. Do not skip the footprint when `shouldConsiderTacticalChildrenForViewport` rejects the enclosing hex. A margin cell can be on screen when that hex's polygon is not. Keep the per-cell projected-bounds test.

Terrain color comes from `tacticalTerrainOverridesByH3` for that cell. If that override is missing, use the same kind the snapshot stored: the geometric parent's kind from `gameState.hexes` when that parent is loaded, and otherwise the enclosing hex's kind. Do not throw when the parent is absent.

Airport and seaport glyphs, and the city-dot skip that treats a facility cell as already marked, use the snapshot's core flags during a battle (`tacticalIsAirportByH3`, `tacticalIsSeaportByH3`). `terrainInfraTacticalAirport` and `terrainInfraTacticalSeaport` include every loaded neighbor. A margin airport must not draw. Without a battle, keep those sets.

City labels in `tacticalCityOverlays` currently call `getTacticalChildCodeWithinParent`. During a battle, use `tacticalBattleHexCode(enclosing, cell)` so a margin label matches the briefing code. A missing code omits the badge. There is no separate road-draw pass. Roads draw with the terrain hexes. Do not add one.

[src/renderer/wiredEntryCallbacks.ts](src/renderer/wiredEntryCallbacks.ts) `detailHitAtClientPixel` returns a cell only when its geometric parent is loaded and explored. During a battle, return the cell when it is in `tacticalChildH3Indexes`, including a margin cell whose parent is outside the match. Without a battle, keep the parent test. Clicks already use `hitTestTacticalHexAtContainerPixel`, which trusts the footprint list. Leave that function as it is.

The strategic-map branch, when no battle snapshot is set, still draws `tacticalChildrenOf` per parent. Do not expand the strategic map.

Update the source assertion in [src/main/rendererConsolidation.test.ts](src/main/rendererConsolidation.test.ts) that `drawTacticalTerrainHexes` skips non-enclosing parents. The new contract is: with a snapshot, draw the footprint list; without a snapshot, keep the explored-parent path.

Verify: `npm run build:main`, then `node dist/main/rendererConsolidation.test.js`. Then `npm run build:renderer`.

## Phase 5  -  Codes and prompts

`initTacticalCoordinateRegistry` in [src/main/briefing/map/hexCoordinates.ts](src/main/briefing/map/hexCoordinates.ts) fills its maps from the cached `codeByH3`, not from `tacticalChildrenOf`. Both callers (`briefingMapSection` and `requestOrdersFlow`) pick this up without a new argument.

`getTacticalChildCodeWithinParent` stays the geometric-child code for the strategic map. Do not change `getLlmHexLocationParenLabelForNamingTarget` for callers with no battle. [src/renderer/map/terrainTooltipHtml.ts](src/renderer/map/terrainTooltipHtml.ts) already imports `rendererSharedState`. When `S.tacticalBattleSnapshot` is set, `formatLlmLocationBoldPrefixHtml` uses the enclosing hex's strategic code plus `tacticalBattleHexCode`. A margin cell must show the same two-character code the briefing map shows, not the neighbor's child code. With no snapshot, keep the geometric-parent label. Do not call `strategicParentOf` on the naming target in that battle branch.

The same battle branch owns control and weather. `resolveStrategicHexForControlLine` and `tooltipWeather` return the enclosing hex, not `strategicParentOf` of the cell. Do not require `namingTarget.resolution === 4`. A regional battle uses resolution 5 or 6, and a margin cell's parent is a neighbor whose weather and control are not the battle's. Facility words on the tooltip (airport, seaport, urban, rubble) come from the snapshot's core maps. Terrain kind still comes from the cell override, then the same fallback the snapshot stored. [src/renderer/map/terrainTooltipStrategicState.ts](src/renderer/map/terrainTooltipStrategicState.ts) is the pointer sampler that currently labels features from the geometric parent.

The operational map already lists `tacticalChildH3Indexes`. Do not build a second hex list in the prompter. Camera entry in [src/renderer/map/tacticalMapView.ts](src/renderer/map/tacticalMapView.ts) already fits the index list it is given. Do not recompute children there.

Registry tests that assume the tactical code map equals `tacticalChildrenOf` must expect the footprint instead. Birth-origin tests that call `tacticalChildrenOf` stay as they are.

Add a registry test: after init for `81263ffffffffff` on the global profile, the code map has 607 entries, and a known margin cell round-trips through `getHexCodeForContext` and `getH3IndexForCode`.

Verify: `npm run build:main`, then the hex-coordinate test file.

## Phase 6  -  Rules text

Update [doc/combat-rules-v3.md](doc/combat-rules-v3.md) section 12, [doc/ai-commander-prompts/tactical-prompt.md](doc/ai-commander-prompts/tactical-prompt.md), and `buildTacticalLatLngPreamble` in [src/main/openRouter/promptText.ts](src/main/openRouter/promptText.ts).

The live preamble is `Tactical battle map: H3 resolution 4 children inside the enclosing strategic hex.` Replace that geography clause so it names the enclosing hex's tactical cells plus three neighboring rings. Keep the two-character code sentence and the final JSON sentence. Update the function's orienting comment. In `tactical-prompt.md`, the opening line and the "One footprint" principle must match this builder. That file says the builders win when they disagree. The legend must take terrain kind from the cell itself, including a margin cell. If a test asserts the old preamble, update that assertion.

- The battlefield is the enclosing hex's tactical cells plus three rings of neighboring tactical cells.
- Deployment stays on the original entry edge.
- Movement, range, and the AI map use the full footprint.
- Infrastructure damage applies only to tactical cells of the enclosing strategic hex. Margin cells are not destroyed, and a shot there does not change any strategic hex's urban, airport, or seaport counts.
- Origin bonus uses each cell's country, or its regional origin area, including a margin cell. `buildOriginBonusRule` already says this. Do not rewrite it.
- Weather is the enclosing hex's weather for the whole battle. Leave the date wording in `buildWeatherRule`, the weather row of `tactical-prompt.md`, and the weather section of `combat-rules-v3.md`. Those sentences already say every beat uses the enclosing hex's weather.

Do not mention this plan's section titles.

## Out of scope

- A player setting for the ring count.
- Moving the deployment edge to the new perimeter.
- Changing unit birth, production, control, or strategic hex statistics except through destruction of a core cell, which already updates the enclosing hex.
- A battle-only rubble layer that is discarded when the battle ends.
- Regenerating terrain packs.
- Rewriting every `strategicParentOf` call in the repo. The files listed above are the battle boundary. Unit birth, terrain rollup, and strategic combat stay on the geometric parent.
