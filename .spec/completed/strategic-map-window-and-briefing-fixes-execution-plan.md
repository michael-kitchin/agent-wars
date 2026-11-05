# Strategic Map Window and Briefing Fixes — Execution Plan

**Audience:** A coding agent implementing this in order. Do not start a phase until the previous phase's verification has passed.

**Confirmed choices:**

- The Controlled Hex Queues table stays the top 10 hexes by urban count, plus any hex that already has a queue. Capped hexes with `fortification` or `credits` are named in the Production attention flag. They are not added as extra table rows.
- An `explicit_move` onto the unit's current cell does not move the unit. It is reported as held, and it is not counted as a drop.
- A strategic `explicit_move` that is past this turn's budget, but that pathfinding can reach, becomes a standing march when standing orders are enabled.

## How to execute

Work the phases from top to bottom. Each phase lists the files, the behavior, the tests, the docs, and the commands that prove it. When a step says to stop, stop and report. Do not invent a neighboring change.

The Results section at the bottom is filled in during the last phase.

## Rules for every phase

- Never commit or push.
- Do not copy phase names, stage names, or this file's name into code, comments, test names, configuration, or `doc/`.
- Every new or changed field and function gets an orienting comment: why it exists, when to use it, what it returns, and what it throws.
- Log with `logDebug`, `logTrace`, and `logError` from `src/main/logger`. Public functions log at debug on entry. Getters that do not change state log at trace. Caught exceptions log at error. A missing hex code in a briefing is expected: do not log it at error.
- Use `const` and `readonly`. Keep each source file under 600 lines. Keep each function at or under 6 named parameters; use one parameter object when it needs more.
- Follow `doc/naming-conventions-contract-v1.md`. New files are camelCase, two to four words, with no role suffix unless the suffix is on that contract's allowlist. Do not rename `get_map` or any other frozen tool name, IPC channel, or SQL column.
- Update the living `doc/` page in the same phase as the behavior it describes. Do not edit `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, or `doc/market-research.md`.
- `formatBriefing` is the AI briefing. Do not change the human map UI.

**Verify a phase** from the repo root:

1. `npm run build:main`
2. `node --test dist/main/<each touched test>.js`
3. `npx eslint` on each touched source file

The last phase runs `npm test` once.

## What this plan covers

| Need | Phase |
| --- | --- |
| Strategic callbacks must not appear in a tactical briefing, and a missing hex code must not log an error | Callbacks |
| Available Unit Types lists `fortification` and `credits`. A hex whose unit types are all capped, but which can still queue those, counts as idle | Production |
| Over-budget reachable explicit moves become marches. Already-arrived explicit moves are held, not dropped | Explicit moves, then prompt text |
| The model overwrites one `turn_objectives` note instead of minting a new key each turn | Prompt text |
| Approach rows do not repeat the whole enemy roster | Target units |
| The strategic Operational Map uses the tactical window's local-IJ blocks, keeps cells within 2 steps of own units and visible enemies, and also keeps controlled hexes with urban cells, airports, or seaports, plus Best Options targets | Projection, selection, rendering |
| `get_map(center, radius)` works on a strategic consult and is clipped to the strategic map | get_map |
| Find out why one tactical seat had enemies two cells away and no Best Options | Investigation |

## Phase 1 — Callbacks

### Behavior

In `src/main/openRouter/tacticalCallbackSubscriptionLifecycle.ts`, `stashOpponentCallbackSubscriptionsForTacticalBattle` already copies the AI seat and, when different, the lead seat. After `writeTacticalCallbackStashToGameConfig` returns, call `clearSubscriptions` from `src/main/callbackSubscriptions.ts` for each seat that was copied. A null seat clears nothing. If the write throws, do not clear.

Before editing, search `getSubscriptions(`. If any caller outside the tactical briefing reads a stashed seat's live list while a battle is in progress, stop and report that caller.

In `src/main/briefing/activeCallbacksSection.ts`, stop calling `h3ToCode`. Call `getHexCodeForContext` from `./map/hexCoordinates` inside `try/catch`. That helper throws when `cellToLatLng` is given an ordinary string, and it returns `undefined` when the cell is not in the active registry.

- `formatTerritoryTarget`: a two-character code stays as it is. A resolved code is returned. A throw or `undefined` returns `specified territory`. Do not log.
- `sanitizeCallbackParamsForPrompt`: a resolved code replaces the string. A throw or `undefined` leaves the original string, so unit ids and other text pass through. Do not log.

### Tests

Update `src/main/openRouter/tacticalPromptSectionParity.test.ts`:

- Immediately after a stash, each stashed seat's live list is empty.
- Restore still returns the subscriptions from before the stash.
- A seat that was not stashed is unchanged.
- A null seat does not clear anyone.

Add a test beside `activeCallbacksSection.ts`: a tactical context and a `territory_changed` row whose hex is not in that battle's registry render `specified territory` and do not throw.

### Docs

Update the stash description in `doc/ai-commander-prompts/consultation-flow.md` and `doc/ai-commander-prompts/variants.md` so it says the live list is cleared after the stash is saved and restored when the battle ends.

### Verify

`tacticalPromptSectionParity.test.js` and the new callbacks test.

## Phase 2 — Production listing and attention

### Behavior

`query_production` already appends `fortification` and `credits` in `summarizeQueue` (`src/main/tools/productionTools.ts`). The briefing drops them. Make the briefing match, without adding table rows.

In `src/main/openRouter/briefingSections.ts`:

- `normalizeControlledHexQueueRow` keeps every `isBuildQueueItemType` value. It must not filter with `isBuildUnitType`.
- `formatBriefingAvailableUnitTypes` splits the list into unit types and extras (`fortification`, `credits`). Run `filterQueueableUnitTypes` and `isEveryAvailableTypeAtCap` on the unit types only. Append extras at the end. Examples:
  - `infantry, fortification, credits` when a unit type is still queueable.
  - `armor, naval (all unit types at cap), fortification, credits` when every unit type is capped.
  - `fortification, credits` when the hex has no unit types.
  - `—` when nothing is available.
- Leave the table selection as it is: the first 10 rows after the urban sort, plus later rows that already have a queue. Do not add idle rows.

In `src/main/productionCaps.ts`:

- Change `ALL_AVAILABLE_TYPES_AT_CAP_NOTE` to `all unit types at cap`.
- Rewrite `PRODUCTION_CAP_QUEUE_GUIDANCE` so that it still says: do not queue a capped type while another unit type can be built. Add: when every unit type a hex can build is at cap, queue `fortification` or `credits` if they are listed. A marked hex that lists neither has no alternative, so leave that queue until the cap frees up.
- Do not change `shouldRejectCappedQueueType`.

In `src/main/openRouter/productionAttention.ts`, `findIdleProductionHexes`:

- Buildable types are the uncapped unit types, plus `fortification` and `credits` when the snapshot lists them.
- A hex with an empty buildable list is not idle. That keeps a fully capped hex with no extras off the flag.
- `empty` means no queue entry and a non-empty buildable list.
- `blocked` means the next entry's type is in `maxedTypes` and the buildable list is non-empty. A next entry of `fortification` or `credits` is not idle.
- Leave the overflow words `(query_production lists every hex)`. That tool returns every controlled hex and the tool loop rewrites each one to a briefing code. Fix the comment above `PRODUCTION_ATTENTION_LISTED_HEXES` if it says the production table lists every hex.

Search the repo for `all at cap` and update each prompt string and test to the new note. Known sites include `coachingTextStrategic.ts`, `productionSubmitText.ts`, and `briefingSections.test.ts`.

### Tests

- `productionAttention.test.ts`: a hex whose unit types are all capped, and which lists `credits`, is idle and names `credits`. A hex queued with `fortification` is not idle. A hex with no extras and every unit type capped is not idle.
- `briefingSections.test.ts`: the available-types cell matches the examples above. A hex past the top 10 with an empty queue is still absent from the table.

### Docs

Search `doc/` for `all at cap`. Update each hit, including `doc/ai-commander-prompts/strategic-prompt.md` and `doc/ai-tools.md`, so the note and the fortification/credits guidance match the constants.

### Verify

`productionAttention.test.js`, `briefingSections.test.js`, and `productionRules.test.js`.

## Phase 3 — Explicit moves

`src/main/openRouter/requestOrdersApplyParsed.ts` is already 685 lines. Put the new logic in `src/main/openRouter/explicitMoveMarch.ts`.

### Already arrived

The loop near the `explicitMoveAlreadyArrivedReason` check applies to both modes. When it matches:

- Do not push a drop reason.
- Do not push a validated move.
- Keep `seenUnits.add`, so the unit is not ordered twice.
- Do not cancel a standing order.
- Record a held reason of the same shape as today's drop text: `{label} -> {destination}: {reason}`.

Add optional `held` and `heldReasons` to `RequestOrdersResult` in `src/main/openRouter/requestOrdersFlowTypes.ts`, with orienting comments. Omit them when the count is 0. `dropped` and `dropReasons` must not include these rows.

This is not the tactical "held on its firing cell" branch. Leave that branch as a drop.

### Over-budget march

Export `explicitMoveReasonIsOverBudget(reason: string): boolean`. It is true only when the reason matches `can move at most` followed by a number and `hex`. It is false for `Invalid distance`, `ARMOR_MOVE_ENDS_ON_ENTER_REASON`, `LAND_UNIT_ROUTE_STEP_BLOCKED_REASON`, naval destination reasons, and already arrived.

Call `convertOverBudgetExplicitMoveToMarch` only from the strategic `validateAiOrder` failure branch, and only after the existing standing-order `Invalid distance` cancel check. Do not change that cancel check.

The function takes one object: `ordersEnabled`, `fromModel` (true when the unit is in `llmMovementUnitIds`), `seatId`, `unitId`, `toH3Index`, `reason`, `state`, `latLngByH3`, `resolveToH3`, `pathfindingSession`, and `validateAiOrder`. Return `{ converted: false }` or `{ converted: true, firstStep }`.

Convert only when all of these are true:

1. `ordersEnabled` and `fromModel` are true.
2. `explicitMoveReasonIsOverBudget(reason)` is true.
3. The unit exists, belongs to `seatId`, and is not air or a missile.
4. `latLngByH3` has a finite latitude and longitude for `toH3Index`.
5. `executePlanRouteWithSession` from `src/main/tools/pathfinding.ts` returns status `ok`, a non-empty path, `turnsRequired >= 2`, and a non-empty `orderToH3`. Call this before `assign_order`.
6. `validateAiOrder` accepts `{ unitId, toH3Index: orderToH3 }`.
7. `executeStandingOrders(seatId, 'assign_order', { unitId, order: { type: 'march', destination: [lat, lng] } }, ...)` returns a non-error. Copy the call shape from `src/main/openRouter/envelopeOrderRows.ts`. This replaces any previous standing order for that unit.

If any step fails, return `{ converted: false }` and do not leave a new standing order behind. A failure at step 7 is a drop of the original reason; do not also emit `orderToH3`.

On success, push `{ unitId, toH3Index: firstStep }` into `validated`, mark the unit seen, and do not drop the original reason. Add the unit id to the `skipUnitIds` set passed to `moveDefendPostsToExplicitMoveDestinations`.

Log each conversion at debug with the unit id, the destination, and the first step. Add optional `convertedToMarch` on `RequestOrdersResult`, omitted when 0.

### Reporting

In the existing completion `logDebug` and in the `onLog` line, include `held` and `converted to march` counts when they are non-zero. Keep them out of the `validation note(s)` count. The sidebar line stays one sentence.

### Tests

Use the temp-database harness already used by `src/main/tools/standingOrders.test.ts`. In `explicitMoveMarch.test.ts`:

- The predicate accepts a `can move at most 2 hex(es)` reason and rejects `Invalid distance`.
- An infantry unit whose destination is three cells away and whose route reports two or more turns is converted. The stored march destination is that cell's lat/lng, and `firstStep` is the route's `orderToH3`.
- An unreachable destination does not convert and does not write a standing order.
- `ordersEnabled: false` does not convert.
- An air unit does not convert.

Do not add a test that only checks a constructor or a log string.

### Docs

None in this phase. The next phase updates the sentences the model reads.

### Verify

`explicitMoveMarch.test.js`. If an existing apply-parsed test asserts an already-arrived drop, update it to expect `heldReasons` and a `dropped` count that excludes that row.

## Phase 4 — Movement and memory prompt text

### Behavior

`buildMovementBudgetRule` in `src/main/openRouter/promptSpec/gameRuleText.ts` gains a second argument, `standingOrdersEnabled: boolean`.

- Strategic and true: the last sentence is `An explicit_move farther than this turn's budget becomes a standing march to that hex.`
- Strategic and false: keep `An explicit_move farther than this turn's budget is dropped, not shortened to the first step.`
- Tactical: do not mention the march conversion.

`buildCombatRulesParagraph` passes `gates.ordersEnabled`. In `src/main/tools/referenceTools.ts`, the `movement` topic passes `true`, because `ruleTextForTopic` already describes every gate as open.

Already-arrived wording, keeping the substring `already arrived`:

- `envelopeContract.ts`: both the tactical and strategic sentences say the order is ignored as already arrived and the unit holds.
- `coachingTextStrategic.ts` around the Suggested Destination paragraph: a march or `explicit_move` to the unit's current Hex is ignored as already arrived and the unit holds.

Memory, in `coachingTextStrategic.ts`: tell the model to write the key `turn_objectives` every strategic turn, to overwrite that key, and never to put the turn number in a key. When all 5 persistent slots are full, a new key still replaces the oldest note. Keep the ban on persisting enemy positions.

In `src/main/openRouter/promptText.ts`, change the example key `strategy` to `turn_objectives`. The envelope example already uses `turn_objectives`; leave it.

### Tests

Update `gameRuleText.test.ts`, `envelopeContract.test.ts`, and `coachingText.test.ts` to the new sentences. Assert both the standing-orders-on sentence and the standing-orders-off sentence.

### Docs

Update `doc/ai-commander-prompts/strategic-prompt.md`, `example-strategic-prompt.md`, and `crosswalk.md` so the movement sentence, the already-arrived sentence, and the memory key match the builders.

### Verify

The three prompt test files above.

## Phase 5 — Approach Target Units

In `src/main/openRouter/possibleUnitActionsBestOptionsInterest.ts`, export `APPROACH_TARGET_UNITS_LISTED = 3` with an orienting comment. `nearestEnemyUnitIdsSummary` keeps its nearest-distance selection, sorts ids as it does now, and emits at most 3. When more ids share that distance, append ` +N more` with the true remainder. An empty result stays `—`.

Update the tests named around `approach Target Units lists nearest enemy unit id`. Add one case with five enemies on the nearest hex, expecting three ids and `+2 more`.

Update the Best Options column description in `doc/ai-commander-prompts/strategic-prompt.md` and `tactical-prompt.md`.

### Verify

`possibleUnitActions.test.js`, `possibleUnitActionsStrategicBestOptions.test.js`, and `possibleUnitActionsTacticalInfraApproach.test.js`.

## Phase 6 — Shared local-IJ projection

This phase is a move. Tactical maps must look the same afterward.

Create `src/main/briefing/map/localIjGridProjection.ts` and move these private helpers out of `src/main/briefing/map/tacticalAsciiGridProjection.ts`:

- `localIjToOddRRowCol`
- the origin picker, renamed `pickLocalIjOrigin`
- `rawOddRPositions`
- `gridFromRaw`

The tactical file imports them. Its exported names stay: `selectTacticalMapWindowCells`, `tacticalMapWindowIndentsFirstRow`, `projectTacticalFootprintToAsciiGrid`, `projectTacticalMapWindow`, and `TACTICAL_MAP_WINDOW_RADIUS`. The latitude-times-1e6 fallback in `rawOddRPositions` stays for those tactical callers.

Add `tryProjectLocalIjGrid(cells, context): HexGrid | null`. It returns an empty grid for an empty list. It returns null if any cell throws from `cellToLocalIj` or has no briefing code. It must not use the latitude fallback. On success it returns one cell per input, with row and column shifted so the minimum of each is 0, and it does not set `indentFirstRow`.

Log the new public functions at debug. Do not log at error for a failed local-IJ lookup.

### Verify

Existing tactical map tests and `briefingMapSection.test.js` pass without expected-string edits. If a test asserts a log prefix, update only that prefix.

## Phase 7 — Strategic window selection

Create `src/main/briefing/map/strategicMapWindow.ts`.

`STRATEGIC_MAP_WINDOW_RADIUS = 2`. It is a separate constant from the tactical one, with a comment that the two match on purpose.

`selectStrategicMapWindowCells` takes `{ mapCells, ownUnitH3, visibleEnemyH3, controlledCityH3, targetH3 }`, all readonly string arrays. It returns a new array.

- Add every `mapCells` member within the radius of an own unit or a visible enemy, using `gridDisk`. On a `gridDisk` throw, keep that seed cell and log at debug.
- Add each controlled-city cell and each target that is also in `mapCells`.
- An empty result returns a copy of `mapCells`.

`groupConnectedMapPatches(cells)` returns connected components. Two cells connect when one is in `gridDisk(other, 1)` and both are in the set. On a `gridDisk` throw, that cell is its own patch; log at debug. Sort each patch lexicographically. Order the patches by their first cell.

`visibleEnemyH3ForStrategicMap(state)` returns enemy unit cells using the same rule as `buildStrategicHexGameStateMap`: fog off, or the cell is in `visibleHexes` or `exploredHexes`. Own units are not filtered. The seat is `briefingOwnSeatId`.

`controlledCityH3ForStrategicMap(state)` returns hexes whose controller is that seat and whose `strategicInfrastructure` row has urban count, airport count, or seaport count above 0.

### Tests

`strategicMapWindow.test.ts`, using real H3 cells where the assertion depends on adjacency, and plain strings only where the function does not call H3:

- Two cells farther apart than the radius, each occupied, produce two patches.
- A controlled city with no unit is included.
- A cell outside `mapCells` is excluded.
- An empty seed list returns every map cell.
- An enemy cell is omitted by `visibleEnemyH3ForStrategicMap` when fog is on and the cell is not visible or explored.

### Verify

`strategicMapWindow.test.js`.

## Phase 8 — Strategic window rendering

### Behavior

`buildStrategicOperationalMapSectionMarkdown` in `src/main/briefing/map/briefingMapSection.ts` gains optional `mentionGetMap?: boolean`.

Keep the early return `(No units — map not rendered.)` when both sides have no units.

Then:

1. Build Best Options rows before drawing the map. The targets are those rows' `targetH3` values.
2. Select the window from `listStrategicH3Indexes()`, own units, `visibleEnemyH3ForStrategicMap`, `controlledCityH3ForStrategicMap`, and those targets.
3. Split the window into patches.
4. For each patch, render one fenced block. `renderStrategicWindowPatchesMarkdown` lives in `strategicMapWindow.ts` so the briefing file stays under 600 lines. Project with `tryProjectLocalIjGrid`. When it returns null, project that patch with `projectToGrid`. Render with `renderHexAsciiMap` and the existing `buildStrategicHexGameStateMap` output, so fog and `?` still apply inside the window.
5. Each block normalizes to row 0. Do not set `indentFirstRow`. These blocks are not a crop of one world grid.
6. Concatenate displaced-feature lines once, after the blocks.
7. Leave the Best Options subsection where it is, after the map.

Legend:

- Replace `Odd rows are indented one space. Use only hex codes from this map or tables.` with `Each fenced block is one connected area. Odd rows in that block are indented one space. Use only hex codes from these blocks or the tables.`
- When the window is smaller than the strategic cell list, add `Shown: N of M cells in K areas around your units, visible enemies, your cities, and the listed targets.` Use `area` when K is 1.
- When that line is present and `mentionGetMap` is true, append `Call get_map(center, radius) for cells outside this window.`

Rewrite the function's "Map extent" comment to describe this window.

`FormatBriefingSharedContext` in `src/main/briefingFormatter.ts` gains optional `mentionGetMap`. `formatBriefing` passes it through and adds no other logic. `requestOrdersFlow.ts` sets it from `enabledToolNames.includes('get_map')`, including on the full-prompt disk-log supplement.

### Tests

Update `briefingMapSection.test.ts`. Do not delete the fog coverage.

- A unit and a controlled city far from that unit render as two fenced blocks, and the Shown line is present.
- With fog on, an enemy on an undiscovered hex is not a reason to include that hex, and the map does not mark it as an enemy.
- No units still returns `(No units — map not rendered.)`.
- `mentionGetMap: false` omits the `get_map` sentence. `mentionGetMap: true` includes it only when the window is cropped.

In the test, record the character length of one cropped section in the Results section below.

### Docs

Update the Operational Map extent in `doc/ai-commander-prompts/strategic-prompt.md` (the extent bullet near the line that says every strategic cell). Update `example-strategic-prompt.md`, `assembly-contract.md`, and `source-inventory.md` so they name the window, the patches, and the Shown line.

### Verify

`briefingMapSection.test.js` and `briefingFormatter.test.js`.

## Phase 9 — Strategic get_map

### Behavior

In `src/main/openRouter/openRouterToolGroups.ts`, `filterToolNamesForStrategicConsult` must stop removing `get_map`. If that leaves the function as a pass-through, delete it, call the list directly from `resolveConsultToolNames`, and fix the comment that says strategic consults never offer `get_map`.

In `src/main/tools/referenceTools.ts`, `executeGetMap` keeps the tactical path. When there is no battle:

- The footprint is `listStrategicH3Indexes()`.
- Reject a missing center, a center outside that footprint, a bad radius, or an empty disk with `That cell is not on the map.` Keep the tactical error `That cell is not on this battle map.`
- Clip `gridDisk` to the footprint. Radius rules stay 0 to `GET_MAP_RADIUS_MAX`, default `TACTICAL_MAP_WINDOW_RADIUS`.
- Render with `renderStrategicWindowGridMarkdown({ state, windowCells })` in `strategicMapWindow.ts`. It reuses the patch renderer and `buildStrategicHexGameStateMap`. Export `buildStrategicHexGameStateMap` only if the helper must live outside `briefingMapSection.ts`. If exporting it widens the API for no reason, pass the prepared game-state map into the renderer instead.
- Log success at debug with the radius and cell count. Log a `gridDisk` or render failure at error and return the same error string.

In `src/main/openRouter/openRouterToolCatalog.ts`, change the `get_map` description and `promptLine` from `The battle map around a cell` to `The map around a cell`. Do not rename the tool.

### Tests

Update the tests that expect strategic consults to exclude `get_map`:

- `src/main/openRouter/openRouterMatrix.test.ts`
- `src/main/openRouter/openRouterToolGroups.test.ts`
- `src/main/tools/referenceTools.test.ts`: replace the strategic rejection with a successful strategic call. Assert the result status is ok, the cell count is inside the footprint, and a center outside the strategic map is the new error string. Keep a tactical test that the old battle error still applies off the battle footprint.

### Docs

Update `doc/ai-tools.md`, `doc/ai-commander-prompts/strategic-prompt.md`, and `tactical-prompt.md` so strategic consults offer `get_map` and the result is clipped to the loaded strategic cells.

### Verify

The three test files above, plus `strategicMapWindow.test.js`.

## Phase 10 — Tactical seat with no Best Options

This phase is an investigation. Change product code only if the cause contradicts a written rule.

The case is opponent4 in the debug log: six armor on cell MM, enemies on K1 and K0 two cells away, rain weather, and no Best Options table.

1. Find that consultation in `debug.log` and the possible-actions trace around it.
2. Reproduce it with `collectAggregatedPossibleActionRows` in tactical mode. Put the scratch test outside the repo, or delete it before this phase ends. Do not leave it in the tree.
3. Use the existing trace counts to see which filter removes the rows. Check the urban or forest range cap, mountain line of sight, the rain budget `TACTICAL_WEATHER_BUDGET_CAP`, and the approach filter.

Write the cause in the Results section. If it matches the tactical prompt and the code, stop. If it contradicts them, fix the code, add one regression test next to the existing possible-actions tests, and update the doc that stated the wrong rule.

### Verify

If you changed code, run that new test. If you did not, this phase has no test command.

## Phase 11 — Doc sweep and full test

Search `doc/` for the old strings and symbols:

- `h3ToCode` in the callback pages
- `all at cap` without the word `unit`
- `query_production lists every hex` only if a doc claims the table lists every idle hex
- `dropped, not shortened to the first step` in a strategic standing-orders-on context
- `every strategic cell of the match`
- `get_map is only available during a battle`
- `The battle map around a cell`
- `turnN_objectives` or an instruction to invent a new objectives key each turn

Fix any living doc that still describes the old behavior. Then run `npm test`.

Fill in the Results section: docs updated, the no-options finding, the cropped-map length from Phase 8, and any place where a doc and the code still disagree.

## Do not

- Do not add idle hexes to the Controlled Hex Queues table.
- Do not change `shouldRejectCappedQueueType` or the production spawn loop.
- Do not convert `Invalid distance`, armor end-on-enter, or land-route-blocked moves into marches.
- Do not call `assign_order` before the route and the first-step validation have succeeded.
- Do not report the tactical firing-cell hold as a held order.
- Do not change tactical ASCII output in Phase 6.
- Do not set `indentFirstRow` on a strategic patch.
- Do not fall back to one world-sized latitude grid when local IJ fails. Fall back one patch at a time.
- Do not clear callback lists before the stash write returns.
- Do not rename `get_map`.

## Risks

- A resolution-1 patch that crosses a pentagon or an icosahedron face makes `tryProjectLocalIjGrid` return null. That patch uses latitude bands. Other patches stay on local IJ.
- March conversion runs after `generateOrdersForStandingOrders`. The first step comes from `executePlanRouteWithSession`, not from a second generation pass. The stored march is what the next turn continues.
- `assign_order` replaces a previous standing order for that unit. That is intended, because the model named this destination.
- Clearing live callbacks is safe only because the stash is written first and restored at battle end.

## Results

Filled in by the implementer:

- Docs updated: `doc/ai-commander-prompts/consultation-flow.md`, `variants.md`, `strategic-prompt.md`, `example-strategic-prompt.md`, `tactical-prompt.md`, `example-tactical-prompt.md`, `information-decision-model.md`, `assembly-contract.md`, `source-inventory.md`, and `doc/ai-tools.md`.
- Cropped strategic map length: 826 characters for one infantry unit plus one controlled city outside that unit's window. The Shown line was `Shown: 20 of 842 cells in 2 areas around your units, visible enemies, your cities, and the listed targets.`
- Tactical no-options finding: opponent 4, battle `tb-8158fffffffffff`, beat 11, rain. Six armor stood on MM. Enemies stood on K1 (distance 2) and K0. `collectAggregatedPossibleActionRows` offered 156 move slots and 26 ranged slots and kept none. The move filter dropped every cell because none was enemy-occupied or uncontrolled infrastructure, and the approach filter then found no legal cell that strictly closed the distance. The ranged filter dropped every cell because none of the legal shots was enemy-occupied; the enemies two cells away were not in that legal set. The other side, on K1, received approach rows (including LU) and a ranged row on MM in the same battle. That matches the tactical rules: options are this-beat legal, empty infrastructure is not listed, and a shot needs the enemy cell in range. No code change.
- Doc and code still open: `example-strategic-prompt.md` still prints one large grid. Its opening note and legend name the window, the patches, and the Shown line. The grid itself was not regenerated from a live cropped briefing. `h3ToCode` remains the registry encoder in `assembly-contract.md` and `information-decision-model.md`. Callback text no longer calls it for a hex that has no tactical code.
