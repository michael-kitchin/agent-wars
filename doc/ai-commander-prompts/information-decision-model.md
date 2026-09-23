# Information and decision model

What the AI commander has to decide, what it is allowed to know, and which facts the builders therefore carry. This file names jobs and information items. Where a section, heading, or column carries an item is described in `assembly-contract.md`, `strategic-prompt.md`, and `tactical-prompt.md`, matching the builders. If an item's emission disagrees with code, the builders win.

Item ids defined here are the stable vocabulary for the rest of the package. Cite them; do not rename them.

## 1. Commander jobs

The model is a weak model. Each job below must be answerable from information the builders actually emit, without arithmetic across distant tables and without knowledge the prompt does not supply.

### 1.1 Strategic turn jobs

1. **Judge win progress.** Decide whether this turn should push enemy home hexes, protect own home production, or fight in the field. Needs `WIN_CONDITIONS`, `HOME_REGION_HEXES`, `HOME_CONTROL_PROGRESS`, `SCENARIO_ID`.
2. **Read the resolution order.** Know that this period's attacks resolve from turn-start positions, before movement, so a unit can shoot and move. Needs `WEGO_PHASE_ORDER`, `TEMPO_RANGED_SHOT`, `ATTACK_ONE_PER_UNIT`.
3. **Choose this turn's shots and their targets.** Decide, per armed unit, whether to fire and at what. Needs `RANGED_LEGAL_TARGETS`, `BEST_OPTIONS_ROWS`, `COMBAT_STATS`, `STRATEGIC_RANGE_TABLE`, `CASUALTY_PRIORITY`, `ACTION_NEEDED_FLAG`.
4. **Decide when a unit should not fire.** Recognise the one case where withholding is a real choice, and that it is expressed as an order rather than as silence. Needs `HOLD_FIRE_SEMANTICS`.
5. **Choose where each unit should be next.** Pick a legal destination for units that need to move now. Friendly stacking is legal; enemy-occupied cells are move/melee contact. Needs `BEST_OPTIONS_ROWS`, `LEGAL_DEST_OCCUPANCY`, `TERRAIN_CLASS`, `NAVAL_MOVEMENT_DOMAIN`, `MOVE_BUDGET`.
6. **Choose standing orders over per-turn micromanagement.** Give every orderless march-capable unit a mission instead of re-planning it every turn. Needs `ORDERLESS_UNITS`, `SUGGESTED_DESTINATION`, `ORDER_TYPE_LEGALITY`, `MARCH_CURRENT_HEX_RULE`, `STANDING_ORDER_STATE`.
7. **Decide air employment.** For each air unit, strike or reposition, never both. Needs `AIR_STRIKE_ENVELOPE`, `FERRY_DESTINATIONS`, `AIR_ORDER_RESTRICTIONS`.
8. **Move land force across water.** Decide embark, transport, and disembark. Needs `EMBARK_STATE`, `EMBARK_HEX`, `EMBARK_LEGALITY`, `NAVAL_MOVEMENT_DOMAIN`.
9. **Keep production running.** Decide which controlled hexes queue what, given caps. Needs `PRODUCTION_QUEUES`, `PRODUCTION_CAPS`, `PRODUCTION_CAP_QUEUE_RULE`, `PRODUCTION_RULES_COSTS`, `PRODUCTION_INCOME`, `PRODUCTION_TIMING`.
10. **Decide whether to call a tool at all.** Copy a listed option instead of re-deriving it; call a tool only for something the briefing does not list. Needs `BEST_OPTIONS_ROWS`, `TOOL_CATALOG`, `TOOL_BUDGET_WARNING`.
11. **Choose re-consultation triggers.** Subscribe to the events that would change the plan. Needs `CALLBACK_EVENT_VOCABULARY`, `CALLBACK_ACTIVE_LIST`, `CALLBACK_REPLACE_SEMANTICS`.
12. **Write `message` and `strategy`.** One in-character line at the player, one operational summary for its own future self. Needs `JSON_ENVELOPE`, `MESSAGE_DISCIPLINE`, `MEMORY_PERSISTENT`.
13. **Record intent for next turn.** Persist what this turn was for. Needs `MEMORY_PERSISTENT`, `MEMORY_WRITE_PATH`, `MEMORY_LIMITS`, `RECENT_TURN_NOTES`.
14. **Handle an unresolved home boundary.** When home regions overlap, know that some hexes count for both sides. Needs `HOME_REGION_OVERLAP`.
15. **Scout when blind.** When no enemy unit is observed, move to regain contact rather than hold. Needs `ENEMY_ROSTER_OBSERVED`, `FOG_MODE`, `SUGGESTED_DESTINATION`.

### 1.2 Tactical beat jobs

16. **Fight the local battle, not the war.** Reduce enemy sub-units inside this footprint; regional victory text does not apply. Needs `BATTLE_FRAME`, `SUBUNIT_IDENTITY`.
17. **Choose this beat's shots.** Same tempo logic at res4 ranges, including infantry. Needs `TACTICAL_RANGE_TABLE`, `TEMPO_RANGED_SHOT`, `RANGED_LEGAL_TARGETS`, `CASUALTY_PRIORITY`.
18. **Move sub-units within a beat budget.** Pick a destination this beat can actually reach, and know an over-reaching destination is truncated rather than rejected. Needs `TACTICAL_MP_RULES`, `FIRST_LEG_TRUNCATION`, `BEST_OPTIONS_ROWS`.
19. **Employ air inside the footprint.** Strike any occupied cell, or ferry to an intact airport cell in the battle; never both. Needs `AIR_STRIKE_ENVELOPE`, `FERRY_DESTINATIONS`, `AIR_ORDER_RESTRICTIONS`.
20. **Handle cargo in battle.** Embark, transport, disembark at res4. Needs `EMBARK_STATE`, `EMBARK_LEGALITY`.
21. **Not rely on standing orders.** Know that no standing order will move a sub-unit this beat, so an unordered sub-unit is an idle sub-unit. Needs `STANDING_ORDERS_INERT_IN_BATTLE`.
22. **Scope callbacks to sub-units.** Use `parent:slot` ids and know the list dies with the battle. Needs `CALLBACK_TACTICAL_SCOPE`, `SUBUNIT_IDENTITY`.

### 1.3 Jobs that exist only in a variant

23. **Act with stale intel.** Under fog, treat an enemy position as a last-known report with an age. Needs `INTEL_FRESHNESS`, `INTEL_STALENESS_WINDOW`, `FOG_MODE`.
24. **Trust printed distances correctly.** Under fog off at res1, printed distances are straight hop counts, not march paths. Under fog on at res1, printed distances are march or sail path lengths when a path exists, while Best Options Target Hexes remain this-turn legal hops. Needs `HOP_VS_PATH_CAVEAT`.
25. **Do nothing about production, memory, or standing orders when those tools are off.** Needs `TOOL_CATALOG`, `JSON_ENVELOPE`.
26. **Plan with no options table.** When the options table is absent, derive destinations with the planning tool instead. Needs `TOOL_CATALOG`, `BEST_OPTIONS_ROWS` empty-state.
27. **Handle every type at cap.** Leave a blocked queue alone rather than churning it. Needs `PRODUCTION_CAP_QUEUE_RULE`.
28. **Accept that some periods bring no consult.** Under event-driven policy the model is asked only when an event fires; a beat or turn with no prompt is a period it did not act in, and no standing order will act for it in battle. Needs `CONSULT_POLICY`, `STANDING_ORDERS_INERT_IN_BATTLE`.

## 2. Visibility contract

What the commander may be told is decided by the snapshot it is given, never by the prompt reaching past it.

1. **Fog on** (`fogOfWarEnabled` true; the default in `isFogOfWarEnabled`). The snapshot passed to prompt assembly is already filtered by `getGameStateForPlayer` for `playerPerspective: 'opponent'`. The prompt may state: own units in full; enemy units only where the snapshot lists them; `exploredHexes` terrain; `enemyIntel` last-known positions with `intelState` and `lastSeenTurn`. Printed nearest-enemy distances are path lengths when a path exists. The prompt must not state: unexplored terrain (masked to `unknown`), enemy units absent from the snapshot, or `pendingOrders`. Own home region hexes and the intersection are force-visible per `getForcedVisibleHomeRegionHexesForPlayer`, so home-region bullets are legitimate even when the region is not scouted. `HOP_VS_PATH_CAVEAT` is required here as the path-versus-Best-Options line.
2. **Fog off.** Every hex is visible and explored, and every enemy unit appears with `intelState: 'current'`. `INTEL_FRESHNESS` collapses to "current" for every row, and `HOP_VS_PATH_CAVEAT` becomes required because `usesOmniscientGridProximity` is true at res1.
3. **Tactical.** Every sub-unit in the footprint is visible to both sides; the narrative states this outright. Fog-off does not make the tactical layer omniscient in the strategic sense: the omniscient gate requires res1 and is therefore never true in a tactical prompt, and `HOP_VS_PATH_CAVEAT` is not emitted there.
4. **Never disclosed in any mode:** `pendingOrders`, `playerPerspective`, human memory or standing orders, human production queues on hexes the opponent does not control, and any derived quantity that would reveal a hidden enemy position (including per-type vision radii).

## 3. Information items

Scope is `strategic`, `tactical`, `both`, or `consult-only`. Status is `required`, `conditional` (with the gate), or `exclude` (with the reason). Conditional gates name the symbol from `source-inventory.md` section 6.

### 3.1 Identity and frame

| Id | Meaning | Engine source | Visibility | Jobs | Scope | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `HEX_IDENTITY` | Every cell the model may name is a two-character briefing code drawn from the map or a table | `h3ToCode`, `CoordinateContext` | n/a | 3, 5, 7, 8, 9, 18, 19 | both | required |
| `UNIT_IDENTITY` | Strategic unit id, type, side, current hex | `GameStateSnapshot.units` | fog-filtered for enemies | 3, 5, 6, 7, 8 | strategic | required |
| `SUBUNIT_IDENTITY` | Sub-unit id is `parent:slot`; enemy sub-unit ids are legal targets | `TacticalSubUnitSnapshot.id` | full in battle | 16, 17, 22 | tactical | required |
| `TURN_CLOCK` | Strategic turn number and phase; tactical beat number when in battle | `turnNumber`, `phase`, `tacticalTurnNumber` | n/a | 1, 13, 16 | both | required |
| `BATTLE_FRAME` | This is one battle inside one res1 hex, and the goal is local | `enclosingRes1H3Index`, `buildTacticalBattleGoalClause` | n/a | 16 | tactical | required |
| `FOG_MODE` | Whether enemy information is complete or a filtered report | `fogOfWarEnabled` | n/a | 15, 23 | strategic | required |

### 3.2 Map and territory

| Id | Meaning | Engine source | Visibility | Jobs | Scope | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `MAP_GRID` | Rendered cell grid with a legend for terrain, presence, and features | `renderHexAsciiMap`, `buildStrategicOperationalMapSectionMarkdown` | fog-filtered | 3, 5, 15, 18 | both | required |
| `TERRAIN_CLASS` | Land or water per cell, which gates who may occupy it | `hexes[].terrain` | fog-filtered | 5, 8 | both | required |
| `TERRAIN_KIND_NOTES` | Finer terrain and passability notes for cells the enemy occupies | `hexAssessments[].result` | fog-filtered | 5 | strategic | conditional — `hexAssessments.length > 0` |
| `INFRA_PRESENCE` | Urban, airport, and seaport counts per cell and whose control they are under | `res1Infrastructure`, `res1Control` | fog-filtered | 1, 7, 9 | strategic | required |
| `CONTROL_STATE` | Which side controls each cell | `res1Control` | fog-filtered | 1, 9 | strategic | required |
| `DISPLACED_FEATURES` | Feature markers hidden under a unit overlay on the map | `renderDisplacedFeaturesLine` | fog-filtered | 5, 7 | both | conditional — at least one feature is overlaid |
| `EXPLORED_CONTROLLED_PROGRESS` | Share of land hexes explored and controlled | `exploredHexes`, `res1Control` | own-side aggregate | 1, 15 | strategic | required |

### 3.3 Enemy picture

| Id | Meaning | Engine source | Visibility | Jobs | Scope | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `ENEMY_ROSTER_OBSERVED` | Which enemy units are currently observed, with type and cell | fog-filtered `units` where `player === 'human'` | fog-filtered | 3, 15 | both | required |
| `NEAREST_ENEMY_DISTANCE` | Nearest observed enemy per own unit and the distance to it | `nearbyEnemies[].hexDistance` | fog-filtered | 3, 5, 17 | both | required |
| `CONTACT_FLAGS` | Whether that enemy is inside this unit's ranged or melee reach | `inRangedRange`, `inMeleeRange` | fog-filtered | 3, 17 | both | required |
| `THREAT_SEVERITY` | Per-unit worst threat severity | `threats[].severity` | fog-filtered | 3, 5 | both | required |
| `INTEL_FRESHNESS` | Confidence and last-seen turn on an enemy position | `enemyIntel[].intelState`, `lastSeenTurn` | fog-only | 23 | strategic | conditional — `fogOfWarEnabled` true |
| `INTEL_STALENESS_WINDOW` | How long a last-known position survives before it is dropped | `STALE_INTEL_TURNS` (2) | fog-only | 23 | strategic | conditional — `fogOfWarEnabled` true |
| `HOP_VS_PATH_CAVEAT` | What a printed nearest-enemy distance means, and that Best Options dests are this-turn legal hops | `OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE`, `FOG_PATH_DISTANCE_BRIEFING_LINE` | n/a | 24 | strategic | conditional — res1; hop-count line when fog off, path line when fog on |

### 3.4 Own force state

| Id | Meaning | Engine source | Visibility | Jobs | Scope | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `OWN_UNIT_TABLE` | One row per own unit with identity, position, nearest threat, and whether it needs a decision | `buildUnitStatusTable` | own-side | 3, 5, 6, 17 | both | required |
| `ACTION_NEEDED_FLAG` | Per-unit yes/no that this unit needs an order this period | `needsAction` | own-side | 3, 5, 6 | both | required |
| `ATTENTION_FLAGS` | Short ranked list of the situations most likely to need a decision | `buildAttentionFlags` | own-side | 3, 5, 6 | both | required |
| `STANDING_ORDER_STATE` | Current order, destination or target, status, next move, attention | `standingOrdersCore.getInjectionText` | own-side | 6 | strategic | conditional — `flags.ordersEnabled` |
| `ORDERLESS_UNITS` | Which own units have no standing order | same | own-side | 6 | strategic | conditional — `flags.ordersEnabled` |
| `SUGGESTED_DESTINATION` | A legal cell that closes on the nearest enemy, per orderless march-capable unit | `suggestApproachDestinationsForOrderlessUnits` → `pickApproachHexesTowardNearestEnemy` | fog-filtered | 6, 15 | strategic | conditional — `flags.ordersEnabled` |
| `EMBARK_STATE` | What is aboard each naval unit and how much capacity is used | `embarkedOnNavalUnitId`, `embarkedOnSubUnitId` | own-side | 8, 20 | both | conditional — the opponent has naval units |
| `STANDING_ORDERS_INERT_IN_BATTLE` | Standing orders never move a sub-unit during a beat | tactical beat resolution reads no standing-order movement | n/a | 21, 28 | tactical | required |

### 3.5 Available options

| Id | Meaning | Engine source | Visibility | Jobs | Scope | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `BEST_OPTIONS_ROWS` | Precomputed legal actions for this period, grouped by action type and target, with the unit ids that may take each | `collectAggregatedPossibleActionRows`, `renderThisTurnOptionsTableMarkdown` | fog-filtered | 3, 5, 10, 17, 18, 26 | both | required |
| `LEGAL_DEST_OCCUPANCY` | Friendly stacking is legal; an enemy-occupied cell is legal as move/melee contact; approach dests omit stay-put friendlies; a cell a friendly is leaving this period is a legal dest | `getValidDestinations` plus Best Options interest; orderless suggestions use stay-put occupancy over `getValidDestinations` | n/a | 5, 18 | both | required |
| `RANGED_LEGAL_TARGETS` | Which enemy cells or units this unit may fire on this period | `appendNearestLegalEngagement`, `collectTacticalLegalRangedTargetRes4Hexes` | fog-filtered | 3, 17 | both | required |
| `AIR_STRIKE_ENVELOPE` | What each air unit can strike now: enemy units and enemy infrastructure by kind | `buildAirOperationsBriefingBlock`, `AIR_STRIKE_RANGE_HEXES` | fog-filtered | 7, 19 | both | conditional — the opponent has air units |
| `FERRY_DESTINATIONS` | Where an air unit may rebase this turn | `AIR_FERRY_RANGE_HEXES`, air ops block | own-side | 7 | strategic | conditional — the opponent has air units |
| `EMBARK_HEX` | Nearest cell where this naval unit may take cargo aboard | `findNearestOpponentEmbarkHex`, `canEmbarkAtHex` | fog-filtered | 8 | strategic | conditional — the opponent has naval units |

### 3.6 Rules the model must apply

| Id | Meaning | Engine source | Visibility | Jobs | Scope | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `COMBAT_STATS` | d6 per shot; attack and defense per unit type | `getAttack`, `getDefense` | n/a | 3, 17 | both | required |
| `STRATEGIC_RANGE_TABLE` | Strategic ranged reach per type, including infantry at zero | `strategicRangedRangeHexesForUnitType` | n/a | 3 | strategic | required |
| `TACTICAL_RANGE_TABLE` | Res4 ranged reach per type, including infantry at two, the urban/forest/rubble/transport cap to one, and mountain LOS | `RANGED_RANGE_BY_UNIT_TYPE`, `effectiveTacticalRangedMaxRangeForAttacker`, `tacticalMountainBlocksImplicitLosForAirArmorNavalRanged` | n/a | 17, 19 | tactical | required |
| `ATTACK_ONE_PER_UNIT` | One ranged or air action per unit per period, measured from period-start positions | `runRangedPhase`, `mergeOpponentAttackOrders` | n/a | 2, 3, 17 | both | required |
| `WEGO_PHASE_ORDER` | Embark, then air strikes, then ranged, then movement, then ferry, then melee | `executeReadyStrategicTurn`, `applyHumanTacticalDraftBeatInStrategicOrder` | n/a | 2, 3, 5, 7 | both | required |
| `TEMPO_RANGED_SHOT` | A shot costs no movement, so a legal shot declined is output lost | phase order above | n/a | 3, 17 | both | required |
| `CASUALTY_PRIORITY` | Hits land on the lowest-defense defender first, then in the fixed type order | `combatResolution.ts` victim sort, `CASUALTY_PRIORITY_ORDER` | n/a | 3, 17 | both | required |
| `HOLD_FIRE_SEMANTICS` | A `hold_fire` order suppresses automatic engagement for that unit until replaced | `holdFireUnitIdsForPlayer`, `assignOrder` | n/a | 4 | strategic | conditional — `flags.ordersEnabled`, since the order can only be issued through a standing order |
| `MOVE_BUDGET` | Strategic movement is one cell for infantry and two for armor and naval; air does not march | `MOVEMENT_BUDGET` | n/a | 5 | strategic | required |
| `TACTICAL_MP_RULES` | Beat movement is a terrain-weighted point budget, reduced in urban and rubble, never below one for non-air | `MOVEMENT_RANGE_BY_UNIT_TYPE`, `effectiveTacticalMovementPointBudgetForMarchLeg` | n/a | 18 | tactical | required |
| `FIRST_LEG_TRUNCATION` | A too-far beat destination is clamped to the first reachable leg, not rejected | `tacticalMarchFirstStopAlongPath` | n/a | 18 | tactical | required |
| `NAVAL_MOVEMENT_DOMAIN` | Naval units move on water and coastal cells and may fire on land targets within range | `getNavalStrategicReachableHexes`, `NAVAL_MOVEMENT_PROMPT_RULE` | n/a | 5, 8 | both | conditional — the opponent has naval units |
| `ORDER_TYPE_LEGALITY` | The five standing-order types and the fields each requires | `assignOrder` | n/a | 6 | strategic | conditional — `flags.ordersEnabled` |
| `MARCH_CURRENT_HEX_RULE` | A march to the unit's own cell is discarded as already arrived | `assignOrder` march branch | n/a | 6 | strategic | conditional — `flags.ordersEnabled` |
| `AIR_ORDER_RESTRICTIONS` | Air units reject march, patrol, and pursue, and cannot strike and ferry in the same period | `AIR_INELIGIBLE_ORDER_TYPES`, ferry-vs-strike drop | n/a | 7, 19 | both | conditional — the opponent has air units |
| `EMBARK_LEGALITY` | Coastal cells and land seaports allow embark outright; a naval-transit cell with a seaport requires control | `canEmbarkAtHex` | fog-filtered | 8, 20 | both | conditional — the opponent has naval units |

### 3.7 Production

| Id | Meaning | Engine source | Visibility | Jobs | Scope | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `PRODUCTION_QUEUES` | Controlled cells that can build, what they may build, and what is queued | `query_production` summary, `res1BuildQueueTotals` | own-control only | 9 | strategic | conditional — `flags.productionEnabled` |
| `PRODUCTION_RULES_COSTS` | Cost and infrastructure minimum per unit type | `UNIT_COST_BY_TYPE`, build availability rules | n/a | 9 | strategic | conditional — `flags.productionEnabled` |
| `PRODUCTION_CAPS` | Per-side deployment cap per type at this game size, and current counts against it | `getMaxUnitsPerType`, `parseGameSize`, `getMaxedUnitTypesForPlayer` | own-side | 9, 27 | strategic | conditional — `flags.productionEnabled` |
| `PRODUCTION_CAP_QUEUE_RULE` | Replace a queue blocked by a cap unless every available type is capped, in which case leave it | `shouldRejectCappedQueueType`, `filterQueueableUnitTypes`, `ALL_AVAILABLE_TYPES_AT_CAP_NOTE` | n/a | 9, 27 | strategic | conditional — `flags.productionEnabled` |
| `PRODUCTION_INCOME` | A cell earns points equal to its urban count each turn and spends them in queue order | `applyProduction` | own-side | 9 | strategic | conditional — `flags.productionEnabled` |
| `PRODUCTION_TIMING` | Spawns resolve after combat and control resolution | ready pipeline ordering | n/a | 9 | strategic | conditional — `flags.productionEnabled` |

### 3.8 Memory, callbacks, and history

| Id | Meaning | Engine source | Visibility | Jobs | Scope | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `MEMORY_PERSISTENT` | Notes that reappear in every briefing | `memory.getInjectionText` | own-side | 12, 13 | strategic | conditional — `flags.memoryEnabled` |
| `MEMORY_TRIGGERED` | Stored notes that fired this turn | same | own-side | 13 | strategic | conditional — `flags.memoryEnabled` |
| `MEMORY_LIMITS` | Five persistent slots, fifteen stored slots, and the current usage | `PERSISTENT_LIMIT`, `STORED_LIMIT` | own-side | 13 | strategic | conditional — `flags.memoryEnabled` |
| `MEMORY_WRITE_PATH` | Writes and deletes travel in the response envelope; there is no write tool | `MEMORY_TOOL_NAMES`, `executeMemory` | n/a | 13 | strategic | conditional — `flags.memoryEnabled` |
| `MEMORY_WRITE_LIMITS` | A key is at most 64 characters from a restricted alphabet and content at most 500 characters | `memory` validation | n/a | 13 | strategic | conditional — `flags.memoryEnabled` |
| `CALLBACK_ACTIVE_LIST` | Which subscriptions are live right now | `getSubscriptions('opponent')` | own-side | 11, 22 | both | required |
| `CALLBACK_EVENT_VOCABULARY` | The subscribable event names and their parameters | `evaluateSubscriptionEvents` | n/a | 11 | both | required |
| `CALLBACK_REPLACE_SEMANTICS` | Each response replaces the whole list; omitting the field clears it | `replaceSubscriptions` | n/a | 11 | both | required |
| `CALLBACK_TACTICAL_SCOPE` | In battle, unit-scoped callbacks use sub-unit ids and the list is cleared when the battle ends | `filterCallbackSubscriptionsForTacticalBattleRoster`, battle-end restore | n/a | 22 | tactical | required |
| `RECENT_TURN_NOTES` | Own previous messages, strategies, and losses on both sides for up to three prior periods | `buildRecentTurnNotesSection` | own-side plus own losses | 1, 13 | both | conditional — at least one prior period qualifies |
| `CONSULT_POLICY` | Whether the model is asked every period or only on an event | event-driven consult entry points | n/a | 28 | both | required |

### 3.9 Scenario and victory

| Id | Meaning | Engine source | Visibility | Jobs | Scope | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `SCENARIO_ID` | Which scenario is running | `state.scenarioId` | n/a | 1 | strategic | conditional — `scenarioId` present |
| `WIN_CONDITIONS` | Control every enemy home hex, or eliminate all enemy home urban production | `evaluateRegionControlWinnerAtEndOfTurn` | n/a | 1 | strategic | conditional — `scenarioId === 'region_vs_region'` |
| `HOME_REGION_NAMES` | Own and enemy home region names | `aiHomeRegion`, `humanHomeRegion` | n/a | 1 | strategic | conditional — names present |
| `HOME_REGION_HEXES` | The cells that make up each home region | `aiHomeRegionHexes`, `humanHomeRegionHexes` | force-visible | 1 | strategic | conditional — `scenarioId === 'region_vs_region'` |
| `HOME_REGION_OVERLAP` | Cells belonging to both home regions | `computeHomeRegionHexPartitionsForPrompting.intersection` | force-visible | 14 | strategic | conditional — `intersection.length > 0` |
| `HOME_CONTROL_PROGRESS` | Own home cells held and enemy home cells taken | `countControlledHexesInRegion` | own-side aggregate | 1 | strategic | conditional — `scenarioId === 'region_vs_region'` |
| `HOME_REGION_VISIBILITY` | Both home outlines are always visible | `getForcedVisibleHomeRegionHexesForPlayer` | n/a | 1 | strategic | conditional — `scenarioId === 'region_vs_region'` |

### 3.10 Consultation mechanics

| Id | Meaning | Engine source | Visibility | Jobs | Scope | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `TOOL_CATALOG` | Which tools exist this consult and what each returns | `getFilteredToolMetadata`, `getToolFlags` | n/a | 10, 25, 26 | consult-only | required |
| `TOOL_BUDGET_WARNING` | The previous consultation burned its tool budget and submitted nothing | `getAndClearAiToolLimitExceededLastTurn` | n/a | 10 | consult-only | conditional — flag set and planning or orders enabled |
| `JSON_ENVELOPE` | The exact response object: field names, order, which are optional, which actions are legal | `buildFinalJsonContractInstruction`, `parseOrdersResponse` | n/a | 3, 5, 6, 7, 8, 9, 11, 12 | both | required |
| `SUBMIT_INSTRUCTION` | What to do now: read the briefing, then emit the envelope | `getInitialUserMessage` | n/a | all | consult-only | required |
| `MESSAGE_DISCIPLINE` | `message` is player-facing psychological warfare and must not leak cells, ids, or intent | `COACHING_MESSAGE_BLOCK` | n/a | 12 | both | required |
| `REPAIR_SCHEMA` | On unparseable output, the exact object shape to re-emit | `buildJsonAssistantRepairSchema` | n/a | 12 | consult-only | required |

## 4. Gaps to close

These are `required` or `conditional` above but `absent` or `partial` in today's prompt. Each is a fact the engine already computes; none invents a system.

1. `WEGO_PHASE_ORDER` — the prompt states only that ranged uses pre-move positions. A model cannot reason about firing then moving, or about ferry landing after movement, from that alone.
2. `LEGAL_DEST_OCCUPANCY` — closed: stacking is legal in both modes; approach omits stay-put friendlies and lists cells a friendly is leaving this period.
3. `CASUALTY_PRIORITY` — target selection is a core job and the victim-sort rule is nowhere in the prompt.
4. `HOLD_FIRE_SEMANTICS` — `hold_fire` is offered as a legal order with no statement of what it does.
5. `CALLBACK_EVENT_VOCABULARY` — the model is invited to subscribe with no list of valid events, so subscriptions are guesses.
6. `MOVE_BUDGET` — strategic per-type movement budgets are never printed, leaving multi-turn planning unanchored.
7. `PRODUCTION_INCOME` — the caps and costs are printed but not the income rule, so the model cannot tell a cheap queue from an unaffordable one.
8. `INTEL_STALENESS_WINDOW` — under fog the model sees a last-seen turn with no idea how long such a report survives.
9. `TACTICAL_MP_RULES` numbers — the prompt says terrain-weighted MP without the per-type budget, so the model cannot judge reach beyond the options table.
10. `MEMORY_WRITE_LIMITS` — an over-length write is silently rejected today.
11. `STANDING_ORDERS_INERT_IN_BATTLE` is present in tactical guidance but `CONSULT_POLICY` is not, so a model in an event-driven battle has no statement that a skipped beat is a beat it did not act in.

## 5. Explicit exclusions

| Excluded | Reason |
| --- | --- |
| `pendingOrders` | Human private intent; disclosing it would break the simultaneous-movement premise |
| `playerPerspective` | Snapshot plumbing with no decision value |
| `units[].displayOrder` | Renderer stacking only |
| `gameOver`, `winner` | No consultation occurs in a terminal state |
| `staleHexes` as a list | Redundant with `INTEL_FRESHNESS` per unit and would add a large low-value hex list |
| `contestedHomeRegionHexes` | Derivable from the map overlay the model already reads; a second overlapping list invites contradiction |
| `VISION_RANGE_BY_UNIT_TYPE` | Publishing radii lets the model infer where enemies must be hiding, which is information the fog filter deliberately withheld |
| Assessment scan radius (4) | Internal precomputation bound; it does not change any legal action |
| `res4RoadSidesByH3`, `res4RailSidesByH3`, `res4IsRubbleByH3` as raw data | Their only effect is movement cost, which reaches the model as `TACTICAL_MP_RULES` and pre-filtered options |
| `initialPlacedSubUnitCountByParentId`, `battleId` | Bookkeeping; no legal action depends on them |
| Mandatory consult overrides (`first_consultation`, `deadman`, and the rest) | Not subscribable, so listing them would imply control the model does not have |
| `expireAndUpdateStatus` housekeeping | Engine cleanup; the resulting statuses are already shown |
| Raw H3 indexes and latitude/longitude as order values | Rejected by the parser and by tool argument decoding |
| Player-facing unit labels (`displayName`) | Ids are the addressable handle; two names for one unit invites mis-addressed orders |
| Production, memory, and standing orders in tactical prompts | No beat resolution reads them, and the forbidden-marker guard exists to keep them out |
| Tactical light-precompute allowlist | Disabled by default and changes no model-visible text when off |
| Combat RNG seed and per-roll detail | Not actionable and would invite the model to predict rolls |
| Renderer layout, tooltips, and map styling | No effect on legal orders or win conditions |
