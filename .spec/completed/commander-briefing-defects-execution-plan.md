# Commander briefing defects execution plan

> **For the implementing agent:** Follow this plan from top to bottom, one phase at a time. Finish each phase's verification before you start the next one. When a check fails, stop and report the command, the actual output, and the expected output. Do not make a check pass by weakening a test. Do not commit or push. Do not build anything this plan does not name. Phase names and numbers in this file stay in this file. Never put them in code, comments, tests, `doc/`, or configuration.

**Goal:** Fix three defects found in a live strategic consultation, then make both commander prompts easy for a person to review.

1. A defend order whose unit is off its post is briefed as `holding` with no next move, while the engine walks the unit back to the post every turn. The model keeps moving the unit forward, and the engine keeps moving it back.
2. The commander submits an empty `productionOrders` while controlled hexes have empty, buildable queues. Nothing in the briefing points at those hexes.
3. The prompt forbids firing at the cell a unit moves into. The engine allows it, and Best Options rows suggest it.
4. After those fixes, the strategic and tactical prompts get headings that nest correctly and paragraph breaks in long prose.

**Tech stack:** TypeScript under `src/main/`, Node `node:test` tests compiled by `npm run build:main` into `dist/main/`, and Markdown docs under `doc/`.

## Locked decisions

These come from the product owner. Do not change them.

- **Defend walk-back stays.** The engine keeps walking an off-post defender back to its post. The briefing must say so truthfully: a status that means "returning to the post", Next Move and Turns Remaining filled in, and Attention and Action needed set to yes when that step moves away from the nearest enemy.
- **Defend post follows the commander.** When the AI commander gives an `explicit_move` that takes a defending unit off its post, the defend post moves to that move's destination.
- **Production is prompt-only.** Add a Production attention flag that names each empty or cap-blocked hex and the types it can still build, and one short opening-message clause that points at that flag. Do not auto-queue production.
- **Ranged rule follows the engine.** Remove the ban from both prompts and their docs, and say plainly that a unit may shoot a cell and move into it in the same period. Prove the tactical engine allows it with a test before changing tactical text.
- **Headings and paragraphs last.** Fix heading levels so they nest, turn the unheaded blocks into headings, and add paragraph breaks. Do this only after every other prompt change has landed.

## Implementation calls

The plan's author made these calls. They are locked for this plan, and the product owner reviews them along with it.

- **Status values.** A defend order on its post is `holding`. Off its post, with a route back, it is `en_route`. Off its post with no route back, it is `blocked`. `en_route` already exists, the Standing Order Status table already shows Next Move for it, and a `DEFEND` row with `en_route` reads correctly. Do not add a new status string. Air units never march to a defend post, so an air defender's status is never changed by this work.
- **One refresh point.** `expireAndUpdateStatus` in [`src/main/tools/standingOrdersGeneration.ts`](../src/main/tools/standingOrdersGeneration.ts) is the only place that recomputes a defend order's status and route. It already runs before the strategic briefing ([`requestOrdersFlow.ts`](../src/main/openRouter/requestOrdersFlow.ts) line 243) and at the start of standing-order generation. `assignOrder` only picks the initial status and does not plan a route. The function already runs more than once per consultation; each off-post defender is routed once per call, sharing one lazy pathfinding session. Do not add a cache or a skip.
- **Turns Remaining** is the number of turns from the unit's current cell, which is what `toComputedRoutePayload` stores (`routeResult.turnsRequired`). Generation keeps storing `turnsRequired - 1` after it queues this turn's step, as it does today.
- **Receding gating matches marches.** The Standing Order Status Attention column flags a receding defend walk-back with no threat condition, as it does for marches. Unit Status Action needed and the Attention Flags bullet flag it only under a moderate or critical threat, as they do for marches. This keeps one rule for both order types. If the product owner wants defend flagged without a threat, that is a one-line change in `needsAction` and the attention loop.
- **When the post moves.** The defend post moves when all of these hold: strategic consultation, standing-order tools on, the stored order is `defend`, the move came from the model (not from a standing order), the move passed validation, the unit is not air, the destination cell is not the current defend post, and this same response did not assign or cancel a standing order for that unit. The unit does not have to be standing on the post. A later explicit move must not leave the old post in place, or the walk-back starts again. A move whose destination is already the post is left alone. The new post is the destination cell's center from `latLngByH3`. The row becomes `en_route` with `computed_route` set to `NULL`; the next refresh sets `holding` once the unit stands there.
- **Stored route side effects.** An on-post or blocked defend row stores exactly `{"turnsRemaining":0}`, with no `nextMoveHex`. `readStandingThisPeriodMoves` treats a missing next step as not moving. An off-post row stores a full route, so Best Options treats that unit as leaving its cell this turn. That is intended: the engine will move it. `listHumanStandingOrders` draws a path only for `march`, so this does not add a line to the human map. Do not change that filter. `blocked` is already a warning status and can emit `standing_order_blocked` from `callbackEvaluation.ts`. Use it only when the route back fails.
- **Idle production hex.** A controlled hex is idle when at least one of its available build types is not at the seat's deployment cap, and either its queue is empty or its next queued type is at cap. This is the same condition `PRODUCTION_REQUIREMENT_BASE` in [`src/main/openRouter/promptText.ts`](../src/main/openRouter/promptText.ts) already states. A hex whose every available type is at cap is not idle.
- **Production bullet placement.** One bullet, appended after the capped unit bullets. It does not count against the five-bullet cap, and it replaces `None.` when it is the only bullet. It lists at most six hexes.
- **Heading levels.** Section builders keep their own heading levels. When `formatBriefing` nests a section inside the briefing, it shifts that section's headings down one level with one new helper. The standalone (no-briefing) prompt keeps the builders' levels.

## Exact text

Use these strings exactly. Placeholders are in braces.

- **Ranged sentence** (combat rules, both modes), replacing `or targetUnitId (not your move destination).`:
  `... or targetUnitId{hint}. A unit may fire at a cell and move into that same cell in the same {period}; the shot resolves first.`
  `{period}` is `turn` or `beat` from `periodNoun`. `{hint}` is the existing `combatTargetHint` or empty.
- **Defend attention bullet:** `{unitId} defend order walks it back to its post, away from the nearest enemy ({enemyId}) — override it this turn or assign defend on its current hex.`
- **March attention bullet** (unchanged): `{unitId} standing march recedes from the nearest enemy ({enemyId}) — override it this turn.`
- **Coaching sentence** (strategic, replaces `the attention column marks stalled orders and marches whose next move recedes from the nearest enemy.`):
  `the attention column marks stalled orders, and marches or defend orders whose next move recedes from the nearest enemy. A defend order with status en_route walks the unit back to its defend post; to keep the unit where it is, assign defend on its current hex. An explicit_move that takes a unit off its defend post moves the post to that destination.`
- **Production bullet:** `Production: {n} controlled {hex|hexes} can build but {is|are} not building — {items}. Add a set_build_queue row to productionOrders for each.`
  Each item is `{hexCode} (empty queue; can build {types})` or `{hexCode} (blocked at cap; can build {types})`, joined by `, `. `{types}` is the buildable types joined by `, `. When more than six hexes are idle, list six and append ` and {k} more (query_production lists every hex)` after the last item.
- **Production coaching sentence**, appended to the coaching bullet that starts `When a controlled cell can build and its queue is empty, queue something.`: `When the Production attention flag is present, it names each such hex and the types it can still build.`
- **Opening-message clause** (strategic, briefing present, production on, at least one idle hex): ` Queue production for every hex named in the Production attention flag.` It goes after the action clause and before `Then submit JSON with ...`.

## Target heading outline

Strategic prompt with a briefing. A gated section that is absent this consultation is simply missing; the others keep their order and level.

```text
# Your Command
# Coordinates
# Combat and Movement Rules
# Commander's Briefing
## Unit Status and Threats
## Attention Flags
## Operational Map
### Best Options This Turn
## Supplemental Hex Intelligence
## Recent Turn Notes
## Production Status
### Controlled Hex Queues
## Your Strategic Memory
### Persistent (Active Strategic Context)
### Reminders Triggered This Turn
## Standing Order Status
### Units Without Standing Orders
## Active Callbacks
## Sides
# Scenario Objective (Required)
# Strategic Context
# Air Operations Status
# Missile Forces
# Mercenaries
## Your Mercenaries
## Rehire Candidates
## Raise Options
# Naval Transport Status
# Available Tools
## How to Use These Tools Effectively
# Unit Roster
# Response Format
## Example Response
```

Tactical prompt:

```text
# Your Command
# Coordinates
# Combat and Movement Rules
# Commander's Briefing
## Unit Status and Threats
## Attention Flags
## Operational Map
### Best Options This Turn
## Recent Turn Notes
## Active Callbacks
# Battle Context
# Air Operations Status
# Naval Transport Status
# Available Tools
## How to Use These Tools Effectively
# Unit Roster
# Response Format
## Example Response
```

What each new heading covers: **Your Command** is the role and clock line, the goal statement, the scouting directive, and the tool-budget warning. **Coordinates** is the coordinate preamble. **Combat and Movement Rules** is the combat paragraph plus the naval routing and assessment hints. **Strategic Context** and **Battle Context** replace the `Strategic context:` label. **How to Use These Tools Effectively** replaces `HOW TO USE THESE TOOLS EFFECTIVELY:`. **Unit Roster** holds the observed-enemy line, plus the own-unit line and adjacent-cell fallback on the no-briefing path. **Response Format** holds the JSON contract. **Example Response** holds the example. **Your Mercenaries** is present only when that seat has a mercenary. **Rehire Candidates** and **Raise Options** are present only when production tools are on.

## Global constraints

- Follow `AGENTS.md` and every file in `.cursor/rules/`. Never commit or push.
- No plan, phase, or workflow identifiers in code, comments, tests, `doc/`, or configuration.
- Every new or changed function, type, interface member, and module-level constant gets an orienting comment with Purpose, When to use, Expected outcome, and Exceptions. Match the comments in [`src/main/tools/standingMarchReceding.ts`](../src/main/tools/standingMarchReceding.ts).
- **Logging.** Public functions that change state log at debug on entry with the ids and counts needed to troubleshoot. Caught exceptions log at error with the error object. Read-only helpers log at trace. Use `logDebug`, `logTrace`, and `logError` from [`src/main/logger.ts`](../src/main/logger.ts).
- **Tests.** Cover the happy path and the essential failures of each new contract, and nothing more. Do not test pure delegation. When an existing test asserts text this plan changes, update the assertion to the new text; do not delete the test.
- **Building and running tests.** PowerShell at `F:\Projects\Personal\agent-wars-public`. Run one command per line; do not chain with `&&`. `npm run build:main` compiles `src/main` and its tests into `dist/main`. Run one test file with `node dist/main/<path>.test.js`. `npm run lint` runs ESLint. `npm run check:circular` checks import cycles. `npm test` runs everything.
- **File size.** The desirable limit is 600 lines and the hard limit is 1000. [`src/main/briefingFormatter.ts`](../src/main/briefingFormatter.ts) is already 945 lines: this plan moves code out of it before adding any, and it must not grow past its starting size. [`src/main/openRouter/requestOrdersApplyParsed.ts`](../src/main/openRouter/requestOrdersApplyParsed.ts) is 634 lines: add only the call site this plan names. If any edit would push a file past 1000, stop and report.
- **Arguments.** At most 6 named arguments. Use one `readonly` parameter object when you would need more.
- **Immutability.** Use `const`, `readonly`, and `ReadonlySet`/`ReadonlyMap` wherever a value does not change.
- **Naming.** Follow [`doc/naming-conventions-contract-v1.md`](../doc/naming-conventions-contract-v1.md). New files are camelCase. Do not rename stored status strings, SQL columns, or JSON envelope fields.
- **Docs.** Update the `doc/` files each phase names, in that phase. Name the symbol a number or rule comes from. Do not edit the historical documents listed in `AGENTS.md`. The builders under `src/main/openRouter/` win over `doc/ai-commander-prompts/`.

## Phase 1: Remove the ranged move-destination ban

**Outcome:** Both prompts say a unit may fire at a cell and move into it in the same period. No prompt text or doc forbids it.

### Files

- Modify [`src/main/gameActions/sanitizeOpponentTacticalDraft.test.ts`](../src/main/gameActions/sanitizeOpponentTacticalDraft.test.ts).
- Modify [`src/main/openRouter/promptSpec/gameRuleText.ts`](../src/main/openRouter/promptSpec/gameRuleText.ts) (`buildAttackConstraintsClause`, line 583, and the `GameRuleTextGates` type).
- Modify [`src/main/openRouter/openRouterBuildSystemPrompt.ts`](../src/main/openRouter/openRouterBuildSystemPrompt.ts) (lines 361-366).
- Modify [`src/main/openRouter/promptSpec/envelopeContract.ts`](../src/main/openRouter/promptSpec/envelopeContract.ts) (line 248).

### Steps

1. **Tactical proof first.** Add a test to `sanitizeOpponentTacticalDraft.test.ts`: `a tactical armor shot at its move destination is legal from the pre-move cell`. Build the same snapshot shape as `minimalOpponentMarchBattle`: opponent armor on `center`, human infantry on `neighbor = firstRingCellDistinctFrom(center)`, footprint `[center, neighbor]`, plains terrain. Call `validateTacticalGroupRangedTarget` from [`src/main/gameActions/tacticalGroupRangedTargetValidation.ts`](../src/main/gameActions/tacticalGroupRangedTargetValidation.ts) with that snapshot, the armor id, and `neighbor`. Assert `success: true`. Do not call `sanitizeOpponentTacticalDraftForReadyCommit` for the shot. Its ranged check goes through `validateGroupRangedTarget`, which reads the active battle session rather than the fixture, so it fails in a test with no session even when the shot is legal.
2. Build and run that test. Then read `applyHumanTacticalDraftBeatInStrategicOrder` in [`src/main/tacticalBattle/tacticalBattleSession.ts`](../src/main/tacticalBattle/tacticalBattleSession.ts) and `applyAiOnlyTacticalBeat` in [`src/main/tacticalBattle/aiOnlyTacticalBeat.ts`](../src/main/tacticalBattle/aiOnlyTacticalBeat.ts). Confirm that in both, the air-and-ranged phase runs on the pre-move snapshot and movement is applied after it. In the first function, `applyTacticalAirStrikeThenRangedPhaseOnBattle` is called before the movement projection.
3. **Stop condition.** If the assertion fails, or ranged does not run before movement in either beat path, stop. Report what you found. Do not change engine code, and do not change tactical prompt text. A fixture problem is not a stop: armor range is 1, and `neighbor` is one cell away on plains.
4. In `GameRuleTextGates`, add an optional `rangedTargetHint?: string` with an orienting comment. In `buildAttackConstraintsClause`, replace `or targetUnitId (not your move destination). ` with the ranged sentence from Exact text, inserting `gates.rangedTargetHint ?? ''` as `{hint}`.
5. In `openRouterBuildSystemPrompt.ts`, pass `rangedTargetHint: combatTargetHint` into `buildCombatRulesParagraph` and delete the `combatRulesWithToolHints` string replace. Use `combatRulesParagraph` where `combatRulesWithToolHints` was used.
6. In `envelopeContract.ts`, delete `"A ranged action's target must not be the acting unit's own move destination.",` from `shared`. Update the orienting comment if it lists that rule.
7. Search `src/` for `move destination` and `own move`, and update any test assertion that quoted the old wording.

### Docs

Search `doc/ai-commander-prompts/` for `move destination`. Expected hits are in `strategic-prompt.md` (around lines 51, 270, 294, and 323) and `tactical-prompt.md` (around line 95). Remove the ban, and state the new sentence where the catalog lists the attack-constraint clause. Name `buildAttackConstraintsClause` as its source. Leave both example reading copies for phase 7.

### Verification

```powershell
npm run build:main
node dist/main/gameActions/sanitizeOpponentTacticalDraft.test.js
node dist/main/openRouter/promptSpec/variantConformance.test.js
node dist/main/openRouter/promptSpec/consultationContract.test.js
npm run lint
```

Then search `src/` and `doc/` for `not your move destination` and `own move destination`. Expected: no hits.

## Phase 2: Truthful defend progress in Standing Order Status

**Outcome:** Every briefing shows an off-post defender as `en_route` with its Next Move and Turns Remaining, or `blocked` when it cannot get back. The Attention column is `yes` when the walk-back step recedes from the nearest enemy.

### Files

- Modify [`src/main/tools/standingOrdersShared.ts`](../src/main/tools/standingOrdersShared.ts).
- Create `src/main/tools/standingOrdersDefendPost.ts` and `src/main/tools/standingOrdersDefendPost.test.ts`.
- Modify [`src/main/tools/standingOrdersGeneration.ts`](../src/main/tools/standingOrdersGeneration.ts) (`expireAndUpdateStatus`, line 221).
- Modify [`src/main/tools/standingOrdersCore.ts`](../src/main/tools/standingOrdersCore.ts) (`assignOrder`, line 209).
- Modify [`src/main/tools/standingOrdersInjectionText.ts`](../src/main/tools/standingOrdersInjectionText.ts).
- Modify [`src/main/briefingFormatter.ts`](../src/main/briefingFormatter.ts) and [`src/main/callbackEvaluation.ts`](../src/main/callbackEvaluation.ts) (shared warning set only).

### Steps

1. **One warning set.** The same `WARNING_STATUSES` set is declared in `briefingFormatter.ts` (line 87), `standingOrdersInjectionText.ts` (line 26), and `callbackEvaluation.ts` (line 292). Export it once from `standingOrdersShared.ts` as `STANDING_ORDER_WARNING_STATUSES: ReadonlySet<string>`, with the same six values and an orienting comment. Delete the three local copies and import the shared one. This is a pure refactor.
2. **Create `standingOrdersDefendPost.ts`** with these exports:
   - `resolveDefendPostH3(row: StandingOrderRow): string | undefined`. Reads `params.defendHex` with `parseOrderParams`. Returns `strategicCellAt(lat, lng)` from [`src/shared/h3Resolutions.ts`](../src/shared/h3Resolutions.ts), or `undefined` when `defendHex` is missing or malformed. Catches a throw from `strategicCellAt`, logs it at error, and returns `undefined`. Logs at trace.
   - `refreshDefendPostProgress(args)`, where `args` is a `readonly` object with `playerId`, `row`, `unit` (a `GameStateSnapshot['units'][number]`), and `getRouteSession: () => PathfindingSession`. Logs at debug. Rules, in order:
     1. Air unit: return without writing.
     2. `resolveDefendPostH3(row)` is `undefined`: return without writing. (Older rows store `{}` params; see [`src/main/gameDb.test.ts`](../src/main/gameDb.test.ts) line 119.)
     3. Unit is on the post: write status `holding` and `computed_route` exactly `{"turnsRemaining":0}`. No `nextMoveHex`. See Stored route side effects.
     4. Otherwise call `executePlanRouteWithSession(row.unit_id, defendHex, { avoidEnemies: false }, getRouteSession())`. `defendHex` is the stored lat/lng, the same destination the generation defend branch passes. When the result is `ok` with a non-empty path, write status `en_route` and `toComputedRoutePayload(result, unit.h3Index)`. Otherwise write status `blocked` and exactly `{"turnsRemaining":0}`, and log the route error at debug.
   - A private `writeDefendProgress(playerId, unitId, status, computedRoute)` that runs one `UPDATE standing_orders SET status = ?, computed_route = ? WHERE player_id = ? AND unit_id = ?`. Do not call `saveDatabase` here; `expireAndUpdateStatus` already saves once at the end.
3. **Call it from `expireAndUpdateStatus`.** Before the loop, add a lazy route-session getter. On first use it builds `buildLatLngCoordinateMap(state.hexes.map((h) => h.h3Index))` from [`src/main/mapData.ts`](../src/main/mapData.ts) and passes that into `createPathfindingSession(state, latLngByH3, resolveToH3)`. Inside the loop, after the air-ineligible deletion and before the march block, add: when `row.order_type === 'defend'` and the unit exists, call `refreshDefendPostProgress`, then `continue`. Defend rows therefore skip `advanceNextMovePastOccupiedCell`, because the refresh recomputes the whole route. Update the function's orienting comment.
4. **Assign-time status.** In `assignOrder`, replace `status = 'holding'` for defend with: `holding` when the unit is air or already on the post cell (resolve `paramsObj.defendHex` with the same `resolveToH3` used elsewhere in `assignOrder`), otherwise `en_route`. Do not plan a route here; the next refresh does. Leave `computed_route` null at assign time.
5. **Expose the next step.** In `getStandingOrderForUnit` ([`standingOrdersCore.ts`](../src/main/tools/standingOrdersCore.ts) line 384), add optional `nextMoveHex?: [number, number]` to the return type, with an orienting comment. Set it from `parseStandingOrderComputedRoute` when `nextMoveHex` is present and is not `[0, 0]`. This is what phase 3 compares. The function is read-only; its existing trace log stays.
6. **Receding for defend in the table.** In `standingOrderRowRecedesFromEnemy` (`standingOrdersInjectionText.ts`, line 218), accept `defend` as well as `march` and `pursue`. For `defend`, return false unless `row.status === 'en_route'`. The step is `computed_route.nextMoveHex` only. Do not fall back to `params.defendHex`: the post is the goal, not this turn's step. Update the orienting comment. `toStandingOrderPromptRow` needs no other change: `en_route` with turns remaining already shows Next Move and Turns Remaining, and `en_route` with no route shows `pending route refresh`.

### Tests

Create `standingOrdersDefendPost.test.ts`. Follow the real-database pattern in [`src/main/tools/standingOrdersNextMove.test.ts`](../src/main/tools/standingOrdersNextMove.test.ts): a temp database, `resetGameForNewMatch`, `getGameState`, a direct `INSERT` into `standing_orders` with status `holding` and `computed_route` NULL, then `getInjectionText('opponent', getGameState())`. Find the row by unit id and compare its cells. Pick an opponent infantry unit and a land neighbor of its cell as the post, as `standingOrders.test.ts` does near line 770. Use `h3ToCode(h3, { mode: 'strategic' })` for expected codes.

1. `an off-post defend order is briefed en_route with its next move and turns`: unit on cell A, post P adjacent. Expect Status `en_route`, Next Move P, Turns Remaining `1`. `getStandingOrderForUnit` returns a `nextMoveHex` that resolves to P.
2. `a defend order on its post is briefed holding with no next move`: unit on P. Expect `holding`, `—`, `—`. The stored `computed_route` is `{"turnsRemaining":0}` and `getStandingOrderForUnit` omits `nextMoveHex`.
3. `a defend order with no post is left unchanged`: params `{}`, status `holding`. After `getInjectionText`, status is still `holding` and `computed_route` is still null.
4. `an off-post defend whose walk-back recedes from the nearest enemy needs attention`: as case 1, then move one human unit (with `UPDATE units SET h3_index`) to a neighbor E of A where `gridDistance(P, E) === 2`. Expect Attention `yes`. If the seed has no such cell, skip with a logged message, as the existing tests do.

Run the existing [`src/main/tools/standingOrders.test.ts`](../src/main/tools/standingOrders.test.ts) and `standingOrdersNextMove.test.ts` unchanged. They must still pass.

### Docs

- [`doc/combat-rules-v3.md`](../doc/combat-rules-v3.md), the DEFEND paragraph at line 167: add that a defender on its post is `holding`, that a defender off its post walks back and is `en_route` (or `blocked` with no route), and that air defenders hold station. Say the stored next step is what Best Options treats as this turn's move. Name `refreshDefendPostProgress`. Do not describe a path on the human map.
- [`doc/ai-commander-prompts/strategic-prompt.md`](../doc/ai-commander-prompts/strategic-prompt.md): wherever Standing Order Status statuses or the Attention column are described, add the defend statuses and the defend receding rule.
- Search `doc/hybrid-ai.md` for `defend` and `holding`, and update any statement this phase makes wrong.

### Verification

```powershell
npm run build:main
node dist/main/tools/standingOrdersDefendPost.test.js
node dist/main/tools/standingOrders.test.js
node dist/main/tools/standingOrdersNextMove.test.js
node dist/main/briefingFormatter.test.js
npm run check:circular
npm run lint
```

## Phase 3: Defend walk-back in Unit Status and Attention Flags

**Outcome:** Under a moderate or critical threat, an off-post defender whose walk-back recedes from the nearest enemy is Action needed `yes` and gets the defend attention bullet. The strategic coaching explains the defend statuses.

### Files

- Modify [`src/main/tools/standingMarchReceding.ts`](../src/main/tools/standingMarchReceding.ts) and its test.
- Modify [`src/main/briefingFormatter.ts`](../src/main/briefingFormatter.ts).
- Modify [`src/main/openRouter/promptSpec/coachingTextStrategic.ts`](../src/main/openRouter/promptSpec/coachingTextStrategic.ts) (the bullet near line 205).

### Steps

1. Move `standingMarchRecedesFromNearestEnemy` (`briefingFormatter.ts`, line 339) into `standingMarchReceding.ts`, exported as `standingOrderRecedesFromNearestEnemy(assessment: UnitAssessmentResult): boolean`. Use a type-only import for `UnitAssessmentResult`. Keep the march logic as it is. Add `defend`: the step is `order.nextMoveHex` from phase 2, and only when `order.status === 'en_route'`. Return false when `nextMoveHex` is missing, the unit is air, or the step's cell is the unit's cell. Do not compare `defendHex`. The post can be many turns away; Action needed is about this turn's step, which is what the table's Attention column uses. Log at trace. Update the module header comment to say it covers standing marches and defend walk-backs.
2. Export `standingOrderTypeOf(assessment): string` from the same module. It returns `order.type` or `order.orderType`, or `''`; the moved function already reads both. Also export `recedingOrderAttentionText(unitRef: string, enemyRef: string, orderType: string): string`, which returns the defend bullet for `defend` and the march bullet otherwise. Both strings are in Exact text.
3. In `briefingFormatter.ts`, delete the moved function and import the new ones. Replace its three call sites (`needsAction`, `isQuiet`, and the attention loop near line 682). In the attention loop, build the bullet with `recedingOrderAttentionText(formatUnitDisplayRef(a.unitId), formatUnitDisplayRef(nearest.unitId), standingOrderTypeOf(a))`. Update the `needsAction` and `isQuiet` orienting comments to say "standing march or defend walk-back". Check the file's line count; it must not exceed its starting 945 lines.
4. In `coachingTextStrategic.ts`, replace the attention-column clause with the coaching sentence from Exact text.

### Tests

In [`src/main/tools/standingMarchReceding.test.ts`](../src/main/tools/standingMarchReceding.test.ts), add three cases for `standingOrderRecedesFromNearestEnemy`: an `en_route` defend whose `nextMoveHex` is farther from the enemy is true; the same order with no `nextMoveHex` is false; an on-post `holding` defend is false. Build the assessment like the march assessment in `briefingFormatter.test.ts` near line 469, using real cell centers from `cellToLatLng`. In `briefingFormatter.test.ts`, add one case: the off-post receding defend under a moderate threat produces the defend bullet from `buildAttentionFlags`. A defend order with no threat, or a low threat only, does not. Update any coaching assertion that quoted the old clause.

### Docs

- `strategic-prompt.md`: in Unit Status Action needed (item 4, around line 267), say "a standing march or defend walk-back whose next step recedes". Update the coaching catalog item that carries the attention-column sentence. Leave the example reading copy for phase 7.

### Verification

```powershell
npm run build:main
node dist/main/tools/standingMarchReceding.test.js
node dist/main/briefingFormatter.test.js
node dist/main/openRouter/promptSpec/coachingText.test.js
node dist/main/briefingAirStrikeAttention.test.js
npm run check:circular
npm run lint
```

## Phase 4: Move the defend post with the commander's explicit move

**Outcome:** A model `explicit_move` that takes a defending unit off its post moves the post to the destination. The unit no longer bounces back next turn.

### Files

- Modify [`src/main/openRouter/envelopeOrderRows.ts`](../src/main/openRouter/envelopeOrderRows.ts) (`EnvelopeOrderRowsResult`, `processV3OrdersArray`).
- Modify [`src/main/openRouter/orderResponseParsing.ts`](../src/main/openRouter/orderResponseParsing.ts) (the inline return type near line 553, and the return near line 674).
- Modify `src/main/tools/standingOrdersDefendPost.ts` and its test.
- Modify [`src/main/openRouter/requestOrdersApplyParsed.ts`](../src/main/openRouter/requestOrdersApplyParsed.ts).

### Steps

1. Add `standingOrderUnitIds: string[]` to `EnvelopeOrderRowsResult`, with an orienting comment saying it lists the units whose standing order this response assigned or cancelled. In `processV3OrdersArray`, push `unitId` after a successful `assign_order` (next to `appliedStandingOrderCount += 1`) and after `cancel_order`.
2. In `parseOrdersResponse`, add `standingOrderUnitIds?: string[]` to the inline return type with an orienting comment. Return the list, or `undefined` when it is empty. `ParsedRequestOrders` picks the field up automatically.
3. In `standingOrdersDefendPost.ts`, export `moveDefendPostsToExplicitMoveDestinations(args): readonly string[]`. `args` is a `readonly` object with `playerId`, `state`, `moves: readonly { unitId: string; toH3Index: string }[]`, `skipUnitIds: ReadonlySet<string>`, and `latLngByH3: ReadonlyMap<string, [number, number]>`. For each move, skip it unless every condition in "When the post moves" holds. The unit's current cell comes from `state.units`; the post comes from `resolveDefendPostH3`. A missing `latLngByH3` entry is logged at error and skipped. For each kept move, set `params.defendHex` to the destination center, keep every other params field, set status `en_route`, and set `computed_route` to `NULL`. Log each move at debug with the unit id, the old post, and the new post. Call `saveDatabase` once when anything changed. Return the ids that changed.
4. In `applyParsedRequestOrders`, right after the `invalidStandingMovementUnits` cancel block (around line 426), add the call when `flags.ordersEnabled && !tacticalBattle`: `moves` is `validated.filter((order) => llmMovementUnitIds.has(order.unitId))`, `skipUnitIds` is `new Set(parsed.standingOrderUnitIds ?? [])`, and `state`, `latLngByH3`, and `seatId` are the ones already in scope. Add the changed-id count to the existing `orders applied` debug log.

### Tests

Add to `standingOrdersDefendPost.test.ts`:

1. `an explicit move off the post moves the defend post`: unit on post P, move to neighbor Q. Expect the returned ids to contain the unit, `defendHex` to resolve to Q, status `en_route`, and `computed_route` null.
2. `an explicit move while already off the post moves the defend post`: unit on A, post P, move to Q, with Q different from P. Expect the post to become Q.
3. `an explicit move to the current post leaves the row`: unit on A, post P, move to P. Expect no change.
4. `a unit whose standing order this response changed keeps its post`: the move from case 1, with the unit in `skipUnitIds`. Expect no change.
5. `an air defender keeps its post`: same move as case 1 for an air unit. Expect no change. If the seed has no opponent air unit, skip with a logged message.

If an `envelopeOrderRows` test file exists, add one assertion that a successful `assign_order` row lists its unit in `standingOrderUnitIds`. Do not add a test for the `applyParsedRequestOrders` call site.

### Docs

- `doc/combat-rules-v3.md`, DEFEND paragraph: add the post-move rule for AI commanders and name `moveDefendPostsToExplicitMoveDestinations`.
- `strategic-prompt.md`: in the `explicit_move` row of the action table (near line 291), add that a move that takes a unit off its defend post moves the post there.

### Verification

```powershell
npm run build:main
node dist/main/tools/standingOrdersDefendPost.test.js
node dist/main/tools/standingOrders.test.js
npm run check:circular
npm run lint
```

## Phase 5: Production attention flag and opening-message pointer

**Outcome:** When production is on and a controlled hex is idle, Attention Flags carries the production bullet, and the opening message carries the pointer clause. Otherwise both are absent.

### Files

- Create `src/main/openRouter/productionQueueSnapshotTypes.ts`. Move the `ProductionQueueEntrySnapshot` and `ControlledHexQueueSnapshot` interfaces into it from [`src/main/openRouter/briefingSections.ts`](../src/main/openRouter/briefingSections.ts), comments included, and export them.
- Create `src/main/openRouter/productionAttention.ts` and `src/main/openRouter/productionAttention.test.ts`.
- Modify `briefingSections.ts`, [`src/main/openRouter/requestOrdersInjection.ts`](../src/main/openRouter/requestOrdersInjection.ts), `briefingFormatter.ts`, [`src/main/openRouter/requestOrdersFlow.ts`](../src/main/openRouter/requestOrdersFlow.ts), [`src/main/openRouter/promptSpec/consultationText.ts`](../src/main/openRouter/promptSpec/consultationText.ts), [`src/main/openRouter/promptText.ts`](../src/main/openRouter/promptText.ts), and `coachingTextStrategic.ts`.

### Steps

1. **`productionAttention.ts` exports:**
   - `IdleProductionHex`: `readonly hexText: string; readonly reason: 'empty' | 'blocked'; readonly buildableTypes: readonly string[]`.
   - `selectNextQueueEntry(entries: readonly ProductionQueueEntrySnapshot[]): ProductionQueueEntrySnapshot | undefined`. Move the `queueIndex`-then-`entryId` sort out of `normalizeControlledHexQueueRow` and use it there too, so both places pick the same entry.
   - `findIdleProductionHexes(rows, maxedTypes, formatHexLabel): IdleProductionHex[]`, which applies "Idle production hex". Available types come from `availableUnitTypes`, filtered with `isBuildUnitType`, the same way `normalizeControlledHexQueueRow` filters them. Buildable types are the available types not in `maxedTypes`. Keep row order. Log at trace.
   - `formatProductionAttentionBullet(idle: readonly IdleProductionHex[]): string | null`. Returns the production bullet without the leading `- `, or null for an empty list. Uses a module constant `PRODUCTION_ATTENTION_LISTED_HEXES = 6`.
   - `appendProductionAttentionBullet(attentionFlags: string, bullet: string | null): string`. Returns `attentionFlags` unchanged for null. Returns `- {bullet}` when `attentionFlags` is `None.`. Otherwise returns `{attentionFlags}\n- {bullet}`.
2. **`briefingSections.ts`:** add `buildProductionBriefing(args): { readonly text: string; readonly idleHexes: readonly IdleProductionHex[] }`, holding today's body of `buildProductionBriefingBlock`. Compute `idleHexes` from all `queues`, not only the rows shown in the table. Every early return gives `idleHexes: []`. `buildProductionBriefingBlock` becomes `return buildProductionBriefing(args).text;`.
3. **`requestOrdersInjection.ts`:** add `productionAttention: string | null` to `StatusInjectionTexts` with an orienting comment. Fill it with `formatProductionAttentionBullet(idleHexes)` when production is on, and null otherwise.
4. **`briefingFormatter.ts`:** add `productionAttention?: string | null` to `FormatBriefingSharedContext` with an orienting comment. Wrap the `buildAttentionFlags(...)` push with `appendProductionAttentionBullet(..., sharedContext?.productionAttention ?? null)`. Do not add the bullet inside `buildAttentionFlags`. That function's five-bullet cap, and the test that asserts it, count unit bullets only. Do not pass the bullet into [`src/main/openRouter/formatTacticalBriefing.ts`](../src/main/openRouter/formatTacticalBriefing.ts). A consultation with no briefing has no Attention Flags section: the opening clause stays off because `hasBriefing` is false, and the standalone production block is unchanged. Confirm `briefingFormatter.ts` is still at or below 945 lines. `productionAttention.ts` must not import `briefingSections.ts`.
5. **`requestOrdersFlow.ts`:** declare `let productionAttention: string | null = null;` before the strategic branch. Set it from `injection.productionAttention`, and pass it in the `formatBriefing` shared context. Pass `hasProductionAttention: productionAttention !== null` in the roster argument of `getInitialUserMessage` (line 324).
6. **`consultationText.ts`:** add `readonly hasProductionAttention?: boolean` to `OpeningMessageGates`, documented with the same Contract / When to use / Expected outcome / Exceptions shape as its neighbors. Add a private `buildOpeningProductionClause(gates)` that returns the opening-message clause when the mode is strategic, `hasBriefing`, `productionEnabled`, and `hasProductionAttention` are all true, and `''` otherwise. In `buildOpeningUserMessage`, place it between `action` and `envelopeClause`.
7. **`promptText.ts`:** add `hasProductionAttention?: boolean` to the `getInitialUserMessage` roster parameter, include it in that function's debug log, and pass `hasProductionAttention: roster.hasProductionAttention === true` through.
8. **`coachingTextStrategic.ts`:** append the production coaching sentence from Exact text to the empty-queue bullet.

### Tests

`productionAttention.test.ts`:

1. An empty queue with buildable types is listed as `empty queue` with its types.
2. A queue whose next entry is at cap, with another type still buildable, is listed as `blocked at cap`, and the capped type is not in its list.
3. A hex whose every available type is at cap is not listed.
4. A queue with a buildable next entry is not listed.
5. Seven idle hexes list six and add `and 1 more`.
6. `appendProductionAttentionBullet` replaces `None.` and appends after existing bullets.

In [`src/main/openRouter/promptSpec/consultationContract.test.ts`](../src/main/openRouter/promptSpec/consultationContract.test.ts), add: the strategic opening message contains the clause when `hasProductionAttention` is true, and does not when it is false, when production is off, or in tactical mode.

### Docs

- `strategic-prompt.md`: the Attention Flags description (five unit bullets plus at most one production bullet, which replaces `None.` when it is alone); the production rows of section 3.2; and coaching item 14. Name `findIdleProductionHexes` and `PRODUCTION_ATTENTION_LISTED_HEXES`.
- [`doc/ai-commander-prompts/assembly-contract.md`](../doc/ai-commander-prompts/assembly-contract.md): the `## Attention Flags` row of the include/omit table.
- [`doc/ai-commander-prompts/consultation-flow.md`](../doc/ai-commander-prompts/consultation-flow.md): the strategic opening-message row (line 52). The clause is a pointer to a system-prompt section, which the submit-only rule allows.
- [`doc/ai-commander-prompts/variants.md`](../doc/ai-commander-prompts/variants.md): production off omits both the bullet and the clause. Leave the example reading copy for phase 7.

### Verification

```powershell
npm run build:main
node dist/main/openRouter/productionAttention.test.js
node dist/main/openRouter/promptSpec/consultationContract.test.js
node dist/main/openRouter/promptSpec/variantConformance.test.js
node dist/main/briefingFormatter.test.js
npm run check:circular
npm run lint
```

## Phase 6: Heading levels

**Outcome:** Both prompts follow the target heading outline. Every heading is at most one level deeper than the one before it, and no unheaded label block remains.

### Files

- Modify [`src/main/openRouter/promptSpec/sectionHeadings.ts`](../src/main/openRouter/promptSpec/sectionHeadings.ts) and its test.
- Modify `briefingFormatter.ts`, [`src/main/openRouter/formatTacticalBriefing.ts`](../src/main/openRouter/formatTacticalBriefing.ts), [`src/main/briefing/map/briefingMapSection.ts`](../src/main/briefing/map/briefingMapSection.ts), `openRouterBuildSystemPrompt.ts`, `promptText.ts` (line 360), `standingOrdersInjectionText.ts` (line 339), [`src/main/openRouter/promptSpec/sidesBlock.ts`](../src/main/openRouter/promptSpec/sidesBlock.ts) (line 99), [`src/main/openRouter/briefingSectionsMercenaries.ts`](../src/main/openRouter/briefingSectionsMercenaries.ts), `coachingTextStrategic.ts`, and `requestOrdersFlow.ts` (lines 278 and 307).
- Create `src/main/testSupport/promptOutlineHelpers.ts` and `src/main/openRouter/promptOutline.test.ts`.

### Steps

1. **New title constants** in `sectionHeadings.ts`, each with an orienting comment: `SECTION_TITLE_YOUR_COMMAND` (`Your Command`), `SECTION_TITLE_COORDINATES` (`Coordinates`), `SECTION_TITLE_COMBAT_AND_MOVEMENT_RULES` (`Combat and Movement Rules`), `SECTION_TITLE_STRATEGIC_CONTEXT` (`Strategic Context`), `SECTION_TITLE_BATTLE_CONTEXT` (`Battle Context`), `SECTION_TITLE_TOOL_USAGE_GUIDANCE` (`How to Use These Tools Effectively`), `SECTION_TITLE_UNIT_ROSTER` (`Unit Roster`), `SECTION_TITLE_RESPONSE_FORMAT` (`Response Format`), `SECTION_TITLE_EXAMPLE_RESPONSE` (`Example Response`), `SECTION_TITLE_UNITS_WITHOUT_STANDING_ORDERS` (`Units Without Standing Orders`), `SECTION_TITLE_SIDES` (`Sides`), `SECTION_TITLE_YOUR_MERCENARIES` (`Your Mercenaries`), `SECTION_TITLE_REHIRE_CANDIDATES` (`Rehire Candidates`), and `SECTION_TITLE_RAISE_OPTIONS` (`Raise Options`). Change the `SECTION_TITLE_OPERATIONAL_MAP` comment from "always H1" to "H2 inside both briefings".
2. **Heading shift helper** in `sectionHeadings.ts`: `shiftMarkdownHeadings(markdown: string, delta: number): string`. For each line outside fenced code blocks (a line starting with three backticks toggles the fence), a line matching `^(#{1,6}) (.*)$` gets level `level + delta`, clamped to 1 through 6. Other lines are unchanged. Log at trace with the delta and line count. Tests in `sectionHeadings.test.ts`: +1 turns H1 into H2 and H2 into H3; a `#` line inside a fence is unchanged; -1 clamps H1 at H1.
3. **Literal headings to constants.** `standingOrdersInjectionText.ts` line 339 uses `subHeading(SECTION_TITLE_UNITS_WITHOUT_STANDING_ORDERS)`. `sidesBlock.ts` line 99 uses `subHeading(SECTION_TITLE_SIDES)`. In `briefingSectionsMercenaries.ts`, replace the plain `Your mercenaries`, `Rehire candidates`, and `Raise options` label lines with `subHeading(...)` of the three new titles. Keep each label's following blank line and table.
4. **Operational map at H2.** In `briefingMapSection.ts` (lines 80 and 109), use `subHeading(SECTION_TITLE_OPERATIONAL_MAP)`. In `formatTacticalBriefing.ts`, replace `sections.push('\n\n' + markdownHeading1(SECTION_TITLE_OPERATIONAL_MAP))` with `sections.push(markdownHeading2(SECTION_TITLE_OPERATIONAL_MAP))`. `markdownHeading2` already starts with a blank line, so do not add another. Best Options stays `###`. Update both orienting comments that say the map is `#`.
5. **Nest injected sections in the strategic briefing.** In `formatBriefing`, pass `productionText`, the empty production section, the memory text, and `standingOrderText` through `shiftMarkdownHeadings(..., 1)` before pushing them. Keep the `hasStrategicMemoryHeader` check on the unshifted text. In its fallback branch, use `markdownHeading2(SECTION_TITLE_STRATEGIC_MEMORY)`.
6. **System prompt headings** in `openRouterBuildSystemPrompt.ts`:
   - Start the prompt with `topLevelHeading(SECTION_TITLE_YOUR_COMMAND)` and a blank line, before the role line.
   - Put `topLevelHeading(SECTION_TITLE_COORDINATES)` before `latLngBlock`, and `topLevelHeading(SECTION_TITLE_COMBAT_AND_MOVEMENT_RULES)` before the combat paragraph.
   - Replace `Strategic context:` in `strategicContextBlock` with `topLevelHeading(SECTION_TITLE_STRATEGIC_CONTEXT)` and a blank line. Do the same in `tacticalContextBlock` with `SECTION_TITLE_BATTLE_CONTEXT`.
   - Put `topLevelHeading(SECTION_TITLE_UNIT_ROSTER)` and a blank line before the roster text in both `mainBlock` branches.
   - Put `topLevelHeading(SECTION_TITLE_RESPONSE_FORMAT)` before `finalJsonContract`, and `subHeading(SECTION_TITLE_EXAMPLE_RESPONSE)` before `finalJsonExample`, each followed by a blank line.
   - In the no-briefing branch only, pass the Sides block through `shiftMarkdownHeadings(sidesBlock, -1)`, so it is H1 beside the other standalone sections.
7. **Tool guidance heading.** In `promptText.ts` line 360, return `'\n\n' + subHeading(SECTION_TITLE_TOOL_USAGE_GUIDANCE) + '\n\n' + lines.join('\n')`. Update the orienting comment at line 290.
8. **Inline hash references.** In `coachingTextStrategic.ts`, `listed under ## Units Without Standing Orders` becomes `listed in the Units Without Standing Orders table`, and `Use the # Naval Transport Status section` becomes `Use the Naval Transport Status section`. Search `src/main/openRouter/` for `under ## `, `the # `, and `the ## ` in prompt strings, and reword any other hit the same way.
9. **Map checks.** In `requestOrdersFlow.ts`, line 278 checks `briefingOverride.includes(subHeading(SECTION_TITLE_OPERATIONAL_MAP))` and line 307 checks `includes(SECTION_TITLE_OPERATIONAL_MAP)`.
10. **Outline helpers** in `promptOutlineHelpers.ts`: `headingOutline(prompt): string[]` returns heading lines outside fences. `assertHeadingsNest(outline): void` throws, naming the offending pair, when the first heading is not H1 or when any heading is more than one level deeper than the previous one.
11. **Outline tests.** In `promptOutline.test.ts`, build a full strategic prompt the way `requestOrdersFlow.ts` lines 241-322 do, on a fresh temp-database match with every tool group enabled. Copy the coordinate-map setup from [`src/main/openRouter/openRouterMatrix.test.ts`](../src/main/openRouter/openRouterMatrix.test.ts). Assert `assertHeadingsNest`. Assert that the always-present strategic headings appear in target-outline order (as a subsequence). Assert that no line equals `Strategic context:` or `HOW TO USE THESE TOOLS EFFECTIVELY:`. For tactical, extend the test near line 542 of [`src/main/openRouter/tacticalPromptSectionParity.test.ts`](../src/main/openRouter/tacticalPromptSectionParity.test.ts) with the same three assertions against the tactical outline.
12. **Existing heading assertions.** Build and run the whole suite. Expect failures in the tests that quote heading strings: `tacticalPromptSectionParity.test.ts`, `briefingFormatter.test.ts`, `openRouterMatrix.test.ts`, `standingOrders.test.ts`, `sectionHeadings.test.ts`, `recentTurnNotesSection.test.ts`, `briefingMapSection.test.ts`, `standingOrdersInjectionMission.test.ts`, and `briefingSections.test.ts`. Update each one to the new level. Two traps: `'## Operational Map'.includes('# Operational Map')` is true, so a negative `includes` check may now be wrong, and a `startsWith('You command')` check now has to skip the `# Your Command` heading.

### Docs

- `assembly-contract.md` section 2: put the heading name on each skeleton row (blocks 1-15) and on the include/omit rows, and state the nesting rule and the `shiftMarkdownHeadings` mechanism.
- Search `doc/ai-commander-prompts/` for `Strategic context:`, `HOW TO USE THESE TOOLS`, `# Operational Map`, `# Production Status`, `# Your Strategic Memory`, `# Standing Order Status`, `Rehire candidates`, and `Raise options`. Update `strategic-prompt.md`, `tactical-prompt.md`, `source-inventory.md`, `crosswalk.md`, and `variants.md` to the new headings and levels.

### Verification

```powershell
npm run build:main
node dist/main/openRouter/promptSpec/sectionHeadings.test.js
node dist/main/openRouter/promptOutline.test.js
node dist/main/openRouter/tacticalPromptSectionParity.test.js
npm test
```

## Phase 7: Paragraph breaks and reading copies

**Outcome:** Long prose in both prompts is broken into paragraphs, and the example reading copies match the builders.

### Rules

The target paragraphs are the ones already shown in `example-strategic-prompt.md` and `example-tactical-prompt.md`. Where a reading copy and these rules disagree, follow these rules and fix the copy.

1. **Goal statement.** In `buildWinConditionReminderClause` in [`src/main/openRouter/scenarioGoals.ts`](../src/main/openRouter/scenarioGoals.ts), join paragraphs with `\n\n` instead of joining every sentence with a space. Paragraph one is `WIN_CONDITION_REMINDER_FIRST_SENTENCE` alone. When `TURN_LIMIT_GOAL_SENTENCE` is included, it is its own paragraph. `MUTUAL_WIPE_GOAL_SENTENCE` and `WIN_CONDITION_REMINDER_SECOND_SENTENCE` stay together as the last paragraph. Leave `buildTacticalBattleGoalClause` and `GENERIC_OBJECTIVE_SENTENCE` as one paragraph each.
2. **Combat and Movement Rules:** in `buildCombatRulesParagraph` in `gameRuleText.ts`, join `parts` with `'\n\n'` instead of `' '`. Keep `buildResolutionOrderRule`, `'Ranged uses pre-move positions.'`, and `buildAttackConstraintsClause` together as one paragraph, joined by spaces. Inside `buildWeatherRule` (same file, line 285), emit five paragraphs, split before `Armor strategic movement`, before `Armor ranged attack`, before `None of these penalties`, and before `The Unit Status Weather column`. The naval routing hint and the assessment hint in `openRouterBuildSystemPrompt.ts` each become their own paragraph.
3. **Available Tools intro:** in `buildAvailableToolsIntro` ([`promptText.ts`](../src/main/openRouter/promptText.ts) line 218), break at the sentence boundaries the example shows (lines 427-435), plus a blank line before the numbered list.
4. **Long coaching bullets:** continuation paragraphs are `'\n\n  '` (two-space indent) at the split points the example shows (lines 457-466 and 472-476). The defend sentences added in phase 3, and the production sentence added in phase 5, are each their own continuation paragraph. That is whitespace around existing sentences, not new wording.
5. **Mercenaries rule** (`buildMercenaryRule` in [`src/main/openRouter/promptSpec/gameRuleMercenaryText.ts`](../src/main/openRouter/promptSpec/gameRuleMercenaryText.ts)): three paragraphs. The first ends after `or rehire a Neutral unit you can see.`. The second ends after `does not fill.`. The third is the rest.
6. **Response Format** (`buildFinalJsonContractInstruction` in [`src/main/openRouter/promptContracts.ts`](../src/main/openRouter/promptContracts.ts) and the clause builders it joins): one paragraph per clause, matching the example (lines 486-536). Keep the field list inline. The prompt forbids markdown fences in the answer, so do not fence anything in the live prompt.
7. Do not change wording while splitting. Only whitespace changes in this phase.

### Tests

In `promptOutline.test.ts`, add a check for both modes. In the sections Your Command, Coordinates, Combat and Movement Rules, Strategic Context or Battle Context, Mercenaries, Available Tools, and Response Format, no line is longer than 700 characters. Skip table rows (`|`), the compact JSON example line (starts with `{`), roster lines, and lines containing `home region hexes are`. Update any existing assertion that a whitespace change broke.

### Docs

- Bring both example reading copies in line with the builders: headings, paragraph breaks, and every sentence changed by earlier phases. Keep each copy's opening note accurate.
- Final sweep: search `doc/` for every old string this plan replaced. Leave historical documents alone.

### Verification

```powershell
npm run build:main
node dist/main/openRouter/promptOutline.test.js
npm test
```

## Final report

When every phase is done, report:

- The phases completed, and the result of the tactical proof in the ranged phase.
- Each file created or changed, with its final line count when it is over 600.
- The `doc/` files updated, or "checked, none needed" for a document you searched and left alone.
- Any place where code and a doc disagreed and you could not tell which side should change.
