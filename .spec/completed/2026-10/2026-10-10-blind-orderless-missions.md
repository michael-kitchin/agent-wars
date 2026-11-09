# Blind Orderless Missions

> **For agentic workers:** Follow the phases in order. Each phase is done only when its verification command passes. Do not commit. Do not copy phase names, workflow labels, or this filename into `src/`, `doc/`, comments, tests, or configuration.

**Goal:** When the AI sees no enemy unit, every orderless ground unit is offered a multi-turn march to the enemy home region, an orderless air unit that can strike is offered defend on its current hex, and Unit Status marks those units Action needed.

**Architecture:** Keep today's one-step closing suggestion whenever any enemy unit is visible. Add the blind mission only when the visible enemy set is empty. Render that mission in the existing Suggested Destination cell. Teach the coaching text to march to a bare hex and to defend when the cell says `defend`. Drive the extra Action needed flag from that suggestion, a legal shot, or a Best Options approach or move/melee row. A unit that already has a standing order is left to the existing threat rules.

**Tech stack:** TypeScript under `src/main`, node:test style `assert` tests already used beside these modules.

## Global constraints

- Never commit or push.
- Do not put plan, phase, or workflow identifiers into code, comments, `doc/`, or test names.
- New public functions get a debug log; per-unit detail stays trace. Caught failures log at error. Use `logDebug`, `logTrace`, and `logError` from [src/main/logger.ts](src/main/logger.ts).
- New functions get an orienting comment: why it exists, when to call it, what it returns, and which exceptions escape. A unit that cannot be scored is omitted. Loading the terrain cache for a blind land march can throw.
- Test the contract (which hex or order is chosen, and what the table cell and Action needed cell say). Do not test private ranking loops.
- Keep named arguments at or below six. Keep each edited file under 1000 lines. [src/main/briefingFormatter.ts](src/main/briefingFormatter.ts) is already about 830 lines, so put new selection logic in [src/main/tools/orderlessUnitSuggestions.ts](src/main/tools/orderlessUnitSuggestions.ts) and add only a short call in the formatter.
- Update the living prompt docs in the same change as the coaching text. Leave historical docs, including anything under `.spec/completed/`, unchanged.
- Contact behavior stays: an observed enemy still produces a one-step closing hex from `getValidDestinations`, enemy-occupied preferred, never the unit's own hex, air never offered a march.

## Cell contract

The Suggested Destination cell has exactly three shapes.

- A two-character briefing hex, such as `BS`: `assign_order` march to that hex. When an enemy is visible, this hex is still inside this turn's budget. When no enemy is visible, it may be farther than this turn's budget. Copy it into `explicit_move` only when that same hex is also a Best Options Target Hex for that unit. A farther explicit move is dropped, not shortened.
- `defend` plus a space plus a two-character hex, such as `defend GW`: `assign_order` defend on that hex. This is only for an air unit. Never emit a march for air.
- An em dash: do not invent a march.

## Selection rules

Implement these in `suggestApproachDestinationsForOrderlessUnits`. Change its return value from `ReadonlyMap<string, string>` to `ReadonlyMap<string, OrderlessMissionSuggestion>`, where the value is `{ orderType: 'march' | 'defend'; destinationH3: string }`. Update every caller. Known callers:

- [src/main/tools/standingOrdersInjectionText.ts](src/main/tools/standingOrdersInjectionText.ts) (renders the cell)
- [src/main/tools/orderlessUnitSuggestions.test.ts](src/main/tools/orderlessUnitSuggestions.test.ts)
- [src/main/openRouter/possibleUnitActionsStrategicBestOptions.test.ts](src/main/openRouter/possibleUnitActionsStrategicBestOptions.test.ts)

Selection order for one orderless unit:

1. Air never takes a march. If `airStrikeUnitIds` contains the unit, suggest `defend` on the unit's current hex. Otherwise omit it.
2. If any enemy unit is visible, keep the current closing-destination logic and return `march` for that hex. Do not substitute an enemy-home hex when a closing hex is missing.
3. If no enemy unit is visible and the unit can march:
   - Outside `state.humanHomeRegionHexes`: nearest passable hex in that list.
   - Already inside that region: nearest passable hex in that list that is not in `state.exploredHexes` and is not the unit's current hex.
   - Empty `humanHomeRegionHexes`, or no remaining candidate: omit the unit.
4. Never return the unit's current hex as a march destination.
5. A land or armor candidate must be on the snapshot, pass `landUnitCanOccupyHex` from [src/shared/landTraversalStrategic.ts](src/shared/landTraversalStrategic.ts) with `getStrategicLandMassByH3`, and its land-mass record must share a continent id or an island id with the unit's current hex. Its `waterPct` must be below `STRATEGIC_LAND_MAX_WATER_PCT`, because the last step of a land route rejects a cell at or above that cap and `assignOrder` then drops the march. A nearer hex on another landmass must not be suggested. If the unit hex has no land-mass record, or no candidate shares one and stays under the cap, omit the unit. Load the land-mass cache only for this blind land path, not for a contact march and not for naval.
6. A naval candidate must pass `terrainIsPassableForDomain` from [src/main/pathfinding.ts](src/main/pathfinding.ts) with domain `water` (`water` or `coastal` terrain on `state.hexes`). Fog-masked `unknown` is not water. Do not send a naval unit to an inland home hex.
7. Distance is `gridHopDistanceBetween` from [src/main/tools/assessUnitProximity.ts](src/main/tools/assessUnitProximity.ts). Skip a null distance. Ties break by ascending H3 string.
8. `state.exploredHexes` is already the fog of the snapshot's player. AI consultations pass `getGameStateForPlayer('opponent')`. Do not treat the home-region outline as explored. A listed home hex missing from `exploredHexes` is unexplored.
9. Do not call `plan_route` from the suggestion function.

`airStrikeUnitIds` is an optional fifth argument, a set of unit ids that have an `air strike` row in this turn's Best Options. Compute it by calling `collectAggregatedPossibleActionRows` with `forThisTurnOptionsTable: true` once inside `getInjectionText` and once inside `formatBriefing`. That same call also collects the approach and move/melee unit ids used for Action needed. Do not call it once per unit. When the argument is omitted, air units stay omitted, which preserves current tests that do not care about strikes.

## Phase 1 — Choose the mission

Edit [src/main/tools/orderlessUnitSuggestions.ts](src/main/tools/orderlessUnitSuggestions.ts) and its test. Keep the existing contact tests green; they must read `.destinationH3` and expect `orderType === 'march'`.

Replace `testNoSuggestionWhenNoEnemyIsPresent`. That test currently locks the bug. New cases, using `buildLandChainState` and `humanHomeRegionHexes` / `exploredHexes` on the snapshot:

- No enemy, unit outside the home list: suggestion is the nearest passable home hex, `march`, and not the unit's own hex.
- No enemy, unit already inside the home list: suggestion is the nearest unexplored passable home hex, not the current hex.
- No enemy, unit inside the home list, every other home hex explored: unit is absent.
- No enemy and `humanHomeRegionHexes` missing or empty: unit is absent.
- Naval unit: an inland home hex is not chosen; a `water` or `coastal` home hex is.
- Two occupiable home hexes, only one sharing a continent or island id with the unit: the shared one is chosen. When the only home hex does not share an id, the unit is absent.
- Air unit is still absent when `airStrikeUnitIds` is omitted.
- Air unit with its id in `airStrikeUnitIds`: `defend` on its current hex.
- An observed enemy still beats the home-region goal, including the existing "already on the enemy means omit" case.

Verify: `npx tsx --test src/main/tools/orderlessUnitSuggestions.test.ts`

## Phase 2 — Render the cell

In [src/main/tools/standingOrdersInjectionText.ts](src/main/tools/standingOrdersInjectionText.ts), build the air-strike id set once and pass it in. Render `march` as the briefing hex only. Render `defend` as `defend` plus one space plus the briefing hex. Keep the em dash when the unit is absent.

Add one injection test beside the existing standing-order injection tests, reusing that file's fixture style: a blind land unit's row contains the home hex and does not contain `defend`; a striking air unit's row contains `defend` and its current briefing hex. Update the comment on `getInjectionText` that still says every orderless unit gets a closing destination.

In [src/main/openRouter/possibleUnitActionsStrategicBestOptions.test.ts](src/main/openRouter/possibleUnitActionsStrategicBestOptions.test.ts), keep the assertions that an enemy-visible suggestion is one of that unit's approach hexes. Those tests must not be relaxed to accept an enemy-home hex. The return type change is `.destinationH3` with `orderType === 'march'`.

Verify: `npx tsx --test src/main/tools/orderlessUnitSuggestions.test.ts src/main/tools/standingOrders.test.ts src/main/openRouter/possibleUnitActionsStrategicBestOptions.test.ts`

## Phase 3 — Tell the model what the cell means

Replace the orderless coaching bullet in [src/main/openRouter/promptSpec/coachingTextStrategic.ts](src/main/openRouter/promptSpec/coachingTextStrategic.ts). Keep these duties in one bullet:

- Every orderless row gets `assign_order`.
- A bare hex is a march. It may be enemy-occupied. When no enemy is observed it may lie beyond this turn's budget; that is still the march destination.
- Put that hex in `explicit_move` only when Best Options lists it for that unit this turn. Do not copy a farther hex from a printed path into `explicit_move`.
- A cell that starts with `defend` is defend on that hex, including an air unit that can strike. Do not march an air unit.
- An em dash means do not invent a march. Defend on the current hex only when an enemy is already observed and the unit is on that enemy or has no closing step.
- Never march a unit to its current hex.

Leave the separate scouting bullet in place; it still says to move rather than hold when blind.

[src/main/openRouter/promptSpec/coachingText.test.ts](src/main/openRouter/promptSpec/coachingText.test.ts) already requires these phrases in strategic coaching. The new bullet must still contain them: `When the cell is —`, `assign defend on its current hex`, `only when an enemy is already observed`, `enemy-occupied hex`, `inside this turn's movement budget, including weather`, `Do not copy a farther hex from the printed nearest-enemy path`, and `Never march to the unit's current Hex`. Add assertions for the beyond-budget march rule and for a Suggested Destination cell that starts with `defend`. Tactical coaching must still omit the orderless bullet.

Verify: `npx tsx --test src/main/openRouter/promptSpec/coachingText.test.ts src/main/openRouter/promptSpec/variantConformance.test.ts`

## Phase 4 — Action needed

In [src/main/briefingFormatter.ts](src/main/briefingFormatter.ts), `needsAction` stays the authority for units that already have a reason to act (legal shot, this-turn close under a moderate or critical threat, receding march, warning status).

Add one strategic-only extra, and only when standing orders are active and the assessment's unit has no standing order. Mark Action needed `yes` when any of these is true:

- the suggestion map contains that unit
- `hasLegalAttackThisTurn` is true
- the unit id is on a Best Options `approach` or `move/melee` row from the same `collectAggregatedPossibleActionRows` call that produced `airStrikeUnitIds`

Do not use `getValidDestinations` for this flag. That set includes ordinary neighbor steps, so it would mark nearly every idle land unit yes, including a unit whose Suggested Destination is an em dash and that has no option row.

Do not apply this extra in tactical briefings. Do not mark a unit yes only because it has a move row while it already has a healthy standing order. Do not fold the extra into the critical-threat count in `buildStrategicNarrative`; that count must keep calling the existing threat predicate.

Do not call `suggestApproachDestinationsForOrderlessUnits` or `collectAggregatedPossibleActionRows` from inside `needsAction`. Both are called once per briefing, and the resulting id sets are passed in. `buildUnitStatusTable` already has four parameters; add one optional argument object for those sets rather than a fifth and sixth loose argument. `buildAttentionFlags` gets the same object.

`buildAttentionFlags` must not put these units on the legal-attack bullet. The selector at the bottom of that function keeps at most four threat bullets plus the one rank-4 attack bullet, and drops anything else. Extend that selector so the mission bullet is kept the same way as the attack bullet: threats first, then the attack bullet if any, then the mission bullet if any, still at most five lines. When both extra bullets exist, drop the lowest-ranked threat first. The mission bullet states the count and tells the model to assign a Suggested Destination when the cell names one, and to copy a Best Options move or strike when the table lists that unit. It does not list ids, and it does not say that every counted unit has a suggested hex. On a blind turn with no threats and no shots, that one bullet replaces `None.`

Update [src/main/briefingFormatter.test.ts](src/main/briefingFormatter.test.ts):

- An orderless land unit with no enemy and a home hex reads Action needed `yes`, and Attention Flags contain the single mission sentence.
- An orderless land unit with no enemy, no home candidate, and no approach or move/melee row still reads `no`. This is the regression check against marking every unit that can step to a neighbor.
- A unit that already has a healthy standing order and no threat still reads `no`, even if it has a move row.
- An orderless air unit with a strike reads `yes`.
- A tactical row is unchanged by the new rule.
- When a critical-threat bullet and the mission bullet both exist, the critical bullet is still present.

Verify: `npx tsx --test src/main/briefingFormatter.test.ts src/main/tools/orderlessUnitSuggestions.test.ts src/main/openRouter/promptSpec/coachingText.test.ts`

## Phase 5 — Living docs

Update these in place so they describe the new contract. Do not add phase labels.

- [doc/ai-commander-prompts/strategic-prompt.md](doc/ai-commander-prompts/strategic-prompt.md) section 2 items 4 and 11, section 4 items 8 and 13, and section 5 item 2. Item 2 currently says every suggestion comes from `pickApproachHexesTowardNearestEnemy`. That remains true only when an enemy is visible. The blind goal is the home-region rule above.
- [doc/ai-commander-prompts/information-decision-model.md](doc/ai-commander-prompts/information-decision-model.md) rows `SUGGESTED_DESTINATION` and `ACTION_NEEDED_FLAG`, and job 15.
- [doc/ai-commander-prompts/variants.md](doc/ai-commander-prompts/variants.md) section 3.5, where an em dash is described as the only blind result.

State the three cell shapes, the enemy-visible versus blind selection rule, the same-landmass limit, the explicit-move limit, and that Action needed is yes for an orderless unit with a suggestion, a legal shot, or a Best Options approach or move/melee row. Units with a healthy standing order stay no unless an older threat rule already marks them. Do not describe `getValidDestinations` as the Action needed source.

Verify by reading those three sections against the coaching bullet and `needsAction`. Then run:

`npx tsx --test src/main/tools/orderlessUnitSuggestions.test.ts src/main/briefingFormatter.test.ts src/main/openRouter/promptSpec/coachingText.test.ts src/main/openRouter/promptSpec/variantConformance.test.ts src/main/openRouter/possibleUnitActionsStrategicBestOptions.test.ts`

## Out of scope

- Tactical grammar and tactical Action needed.
- Forcing a memory write.
- Changing the user-message sentence that already says to give the orderless table standing orders.
- Calling the model or editing `debug.log` or the debug prompt dumps.
