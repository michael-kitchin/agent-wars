# Ferry, orderless air, and coastal hexes

> **For agentic workers:** Implement this plan phase by phase. Steps use checkbox (`- [ ]`) syntax. Do not commit or push. Do not copy phase names, or any other plan identifier, into code, comments, configuration, lint text, or `doc/`.

**Goal:** A strategic ferry onto the air unit's current hex is rejected. Every orderless air unit is offered `defend` on the hex it already occupies. A new match stores a water-dominant hex as coastal when land units can already enter it, so the database, the briefing map, and the renderer agree. An existing save is left unchanged.

**Architecture:** Ferry rejection is one comparison inside `validateFerryOrder`, repeated once where resolution applies a ferry so a stored same-hex order does not move or delete the squadron. The air mission is a change in `suggestApproachDestinationsForOrderlessUnits`: air cannot march, so it always gets defend, whether or not it has a strike and whether or not an enemy is visible. The coastal label is decided only while inserting `hexes` for a new match. Land movement already uses `landUnitCanOccupyHex` and `STRATEGIC_LAND_MAX_WATER_PCT` (85). Naval movement already treats `coastal` as passable. The generated terrain JSON and the classifier stay as they are.

**Tech stack:** TypeScript main process and one shared pure function. Node `node:test` after `npm run build:main`.

## Global constraints

- Do not commit or push.
- Do not put phase, stage, or plan identifiers into code, comments, docs, lint text, or configuration.
- New and updated functions get an orienting comment in the shape already used in that file: why it exists, when to use it, what it returns, and what it throws. Main-process public functions log at debug on entry. Caught exceptions log at error. Getter-style reads log at trace. Use the existing logger. Do not add a renderer logger.
- Do not log inside `storedStrategicTerrainKind`. Seeding calls it once per hex, and a log there would write one line per hex.
- Do not change `EXPECTED_USER_VERSION`. Do not `ALTER` an existing database. Do not rewrite `data/generated/`.
- Do not change the idle-air ferry coaching that says to ferry toward the fighting. Do not change tactical ferry. Tactical destination collection already excludes the origin cell.
- Leave historical docs alone: `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, `doc/market-research.md`, release notes, and everything under `.spec/completed/`. That includes `.spec/completed/blind-orderless-missions.md`.
- Edit living docs in place. Do not rewrite a whole paragraph to change one clause. Do not regenerate `doc/ai-commander-prompts/example-strategic-prompt.md`; edit the one coaching sentence it already contains.
- Tests cover the contract cases named in each phase. Do not add tests for accessors, constructors, or a controller that only forwards a call.

## Decisions already made

- A ferry whose destination hex is the unit's current hex is invalid. The reason string is `Air unit is already based at that airport`. A different controlled airport in range stays valid.
- A group ferry uses the same per-unit check. If one selected squadron is already at the destination, that squadron fails with this reason and the group fails on the first such unit. Do not drop that squadron out of the group before validation.
- Resolution skips a same-hex ferry before it updates the unit and before the branch that deletes a squadron whose destination airport is gone. A same-hex ferry must not destroy the unit.
- Every orderless air unit gets `{ orderType: 'defend', destinationH3: <its current hex> }`, including when no enemy is visible, when an enemy is visible, and when it has no strike. A missile stays omitted. A ground unit's march rules do not change. An orderless air unit is never offered a march.
- The Suggested Destination cell for that air unit stays `defend` plus the briefing hex. The coaching text must tell the model to assign that defend order even when no enemy is observed. An em dash still means do not invent a march and do not invent a defend.
- At seeding only, when the classified kind is `water` and the land-mass record says the hex is occupiable by a land unit and its `waterPct` is strictly below `STRATEGIC_LAND_MAX_WATER_PCT`, store both `terrain` and `terrain_kind` as `coastal`. Every other classified kind is stored unchanged. A water hex with no continent id and no island id stays `water`. A water hex at or above 85% water stays `water`. A missing land-mass record stays `water`.
- Coastal is already passable for naval units and already has the same cover as water (0/0). Do not add a special embark, melee, or cover exception. Existing matches keep the labels they were seeded with. The briefing map draws `.` only for `terrain === 'water'`, and the renderer already colors `coastal` from the stored `terrain` column, so those surfaces follow the new row without a renderer change.

## Review focus

- Same-hex rejection must happen before the range check returns success. A destination one hex away must not be rejected by the new comparison.
- The resolution skip must `continue` before `UPDATE units` and before `DELETE FROM units`.
- Air defend must not depend on `airStrikeUnitIds`. Keep that argument: callers pass it, and the existing debug log still records its size.
- Do not offer defend to a missile, and do not offer a march to an air unit. `standingOrderTypeRejectionReason` rejects `march` for both air and missile; the defend branch is air only.
- The coastal rule must not relabel a plains, forest, or other non-water kind. It must not relabel open ocean.
- Seeding reads the land-mass cache once per call, not once per hex inside a fresh load. `getStrategicLandMassByH3` already loads the terrain cache, and `seedHexesFromTerrainMetadata` already calls `ensureTerrainClassificationCacheLoaded` before the loop. Call `getStrategicLandMassByH3` once after that.
- `src/main/openRouter/promptSpec/coachingText.test.ts` matches `only when an enemy is already observed` and `assign defend on its current hex`. Those assertions fail unless this plan updates them in the same phase as the bullet.

## File map

- `src/main/gameActions/airValidation.ts` — reject a destination equal to the unit's `h3_index`.
- `src/main/gameActions/readyStrategicResolutionPipeline.ts` — skip a same-hex ferry in the apply loop.
- `src/main/tools/orderlessUnitSuggestions.ts` — defend for every orderless air unit. Update the file header, the function comment, and the `OrderlessMissionSuggestion.orderType` comment that still say defend is only for an air unit that can strike.
- `src/main/openRouter/promptSpec/coachingTextStrategic.ts` — the orderless bullet matches that cell.
- `src/main/openRouter/promptSpec/coachingText.test.ts` — drop the assertions that require the old defend sentence.
- `src/shared/landTraversalStrategic.ts` — pure stored-kind rule.
- `src/main/gameDb/seeding/infrastructureSeeding.ts` — use that rule when inserting `hexes`.
- Living docs named in the last phase.

## Phase 1: Reject a ferry onto the current base

**Produces:** `validateFerryOrder` returns invalid for the unit's own hex. Resolution does not apply that order. No suggestion or terrain behavior changes.

- [x] In `validateFerryOrder`, after the owned-unit load and the air-type check, if `destinationH3Index === unit.h3_index`, return `{ valid: false, reason: 'Air unit is already based at that airport' }`. Leave the range, airport, and control checks after that. The function already logs at trace on entry. Do not add another log on this return.
- [x] In the ferry loop in `readyStrategicResolutionPipeline.ts`, after the unit row is loaded and known to be air, if `unit.h3_index === ferry.destinationH3Index`, log at debug with the unit id and hex, then `continue`. Do not update or delete the unit.
- [x] Add `src/main/gameActions/airValidation.test.ts`. Use `withTempGameDb` from `src/main/testSupport/withTempGameDb.ts`. That helper already calls `resetGameForNewMatch`, which seeds hexes, control, and infrastructure. Query two distinct hexes that have `airport_count > 0`, are controlled by the human seat, and are within ferry range of each other (`gridDistance` from 1 through the ferry range). Insert one human air unit on the first with an id that is not already in `units`. Assert `validateFerryOrder` of that unit to its own hex is invalid with that reason. Assert the same call to the second hex is valid. Pass `allowedPlayer` as the human seat. If the query finds no such pair, throw; do not skip the test.
- [x] Run `npm run build:main`, then `node dist/main/gameActions/airValidation.test.js`. The new assertions pass. `src/main/tools/tempoRuleAirFerry.ts` already skips the current base before it calls `validateFerryOrder`; do not change it unless that test fails.

## Phase 2: Defend for every orderless air unit

**Produces:** An orderless air unit's suggestion is defend on its current hex, with or without a visible enemy and with or without a strike. A missile and a ground unit are unchanged. The strategic coaching bullet and its test agree.

- [x] In `suggestApproachDestinationsForOrderlessUnits`, when `standingOrderTypeRejectionReason(unit.unitType, 'march')` is not null and `unit.unitType === 'air'`, set the suggestion to defend on `unit.h3Index`. Do not consult `airStrikeUnitIds` for that decision. Any other unit type that cannot march, including a missile, stays omitted. This branch stays ahead of the enemy-visible march branch so an air unit is never offered a closing march.
- [x] Update the function's orienting comment, the file header, the `OrderlessMissionSuggestion.orderType` comment, and the header comment in `src/main/tools/orderlessUnitSuggestions.test.ts`. They must no longer say an air unit is omitted, or is told to defend, only when it can strike.
- [x] Update `src/main/tools/orderlessUnitSuggestions.test.ts`. `testAirUnitsAreNeverOfferedAMarchDestination` has a visible enemy and must expect defend on the air unit's current hex, and must still expect `orderType` not to be `march`. `testStrikingAirUnitIsToldToDefendOnItsCurrentHex` must expect defend both when the strike-id set is omitted and when it contains the unit. Add one missile case on the same chain: `unitType: 'missile'` is absent from the suggestion map.
- [x] In `ORDERLESS_BULLET` in `src/main/openRouter/promptSpec/coachingTextStrategic.ts`, replace the two clauses that limit defend to an air unit that can strike and to a current hex only when an enemy is already observed. The replacement keeps a cell that starts with `defend` as defend on that hex, including when no enemy is observed, and keeps an em dash as neither a march nor a defend. Do not edit `IDLE_AIR_BULLET`.
- [x] In `src/main/openRouter/promptSpec/coachingText.test.ts`, remove the match for `only when an enemy is already observed`. Replace the match for `assign defend on its current hex` with a match for the new "including when no enemy is observed" clause. Keep the matches for `When the cell is —`, `Suggested Destination starts with defend`, and `toward the fighting`.
- [x] Run `npm run build:main`, then `node dist/main/tools/orderlessUnitSuggestions.test.js`, `node dist/main/tools/standingOrdersInjectionMission.test.js`, and `node dist/main/openRouter/promptSpec/coachingText.test.js`. The air row in the injection test still contains `defend` plus its own code. The land row is still a bare hex.

## Phase 3: Store land-traversable water hexes as coastal

**Produces:** A pure kind rule, used only by new-match hex seeding. An open database is not rewritten.

- [x] Add `storedStrategicTerrainKind(classifiedKind, record)` in `src/shared/landTraversalStrategic.ts`. `classifiedKind` is a `PipelineTerrainKind`. `record` is a `StrategicLandMassRecord` or null. Import `PipelineTerrainKind` from `shared/pipelineTerrain.ts`.
  - Not `water`: return `classifiedKind`.
  - `water` and `record` is null: return `water`.
  - `water` and `landUnitCanOccupyHex` is false for that record's hex: return `water`. Build the one-entry map the occupy check needs from `record`, keyed by `record.h3Index`.
  - `water` and `record.waterPct >= STRATEGIC_LAND_MAX_WATER_PCT`: return `water`.
  - `water` and the hex is land-occupiable and `waterPct` is below that cap: return `coastal`.
- [x] Add tests in `src/shared/landTraversalStrategic.test.ts`: plains stays plains; water at 39.7% with a continent id becomes coastal; water at 85 with a continent id stays water; water at 40% with empty continent and island ids stays water; water with a null record stays water. Give each record an `h3Index` and pass that same id to the occupy check.
- [x] In `seedHexesFromTerrainMetadata`, load `getStrategicLandMassByH3()` once after the terrain cache is loaded. For each hex, pass the classified kind from `getTerrainStrategicKindsFromCache` and that hex's land-mass record through `storedStrategicTerrainKind`, then `pipelineTerrainToPassability` on the result. Insert that passability as `terrain` and the stored kind as `terrain_kind`.
- [x] Run `npm run build:main`, then `node dist/shared/landTraversalStrategic.test.js`. Do not reseed the user's save. Do not add an `UPDATE hexes` migration.

## Phase 4: Living docs

**Produces:** The prompt and mechanics docs describe the behavior from phases 2 and 3. Phase 1 has no separate player-facing sentence beyond the drop reason.

- [x] In `doc/ai-commander-prompts/strategic-prompt.md`, `doc/ai-commander-prompts/information-decision-model.md` (the standing-order item, the scout item, and the `SUGGESTED_DESTINATION` row), and `doc/ai-commander-prompts/variants.md` (the orderless-table row), change the Suggested Destination description so defend on the current hex is offered for every orderless air unit, not only an air unit with a strike. An em dash remains the missile and the ground unit with no legal hex. Keep the three cell shapes.
- [x] In `doc/ai-commander-prompts/strategic-prompt.md`, change coaching item 8 so it matches the edited `ORDERLESS_BULLET`. Do not change the idle-air ferry item. In `doc/ai-commander-prompts/example-strategic-prompt.md`, edit that same coaching sentence in place.
- [x] In `doc/combat-rules-v3.md`, in the sentence that says `hexes.terrain_kind` is the dominant detail-cell kind stored at seeding, add that a water-dominant hex is stored as `coastal` when `storedStrategicTerrainKind` says so. Name `STRATEGIC_LAND_MAX_WATER_PCT`. Say the value is fixed at seeding and an existing match is not relabeled.
- [x] Search `doc/` for `air unit that can strike`, `only when an enemy is already observed`, and `dominant detail-cell kind`. Update the living hits from this change. Leave the historical docs listed above, including `.spec/completed/`.
- [x] Re-read the edited doc sentences against the code. No game test is required in this phase.

## Out of scope

- Migrating an existing save, including the match that showed armor on D4.
- Regenerating terrain metadata or land-mass JSON.
- Changing land pathfinding, the 85% water cap, or naval pathfinding.
- Changing the idle-air "ferry toward the fighting" sentence.
- Tactical ferry rules.
- A renderer or briefing-map code change. Both already follow the stored `terrain` column.
