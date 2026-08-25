# Source inventory and discrepancy log

Read-only catalog of what the AI commander prompt **currently** contains, what the engine **currently** provides, and where the two disagree. Nothing here is a requirement. Requirements start in `information-decision-model.md`.

Every row cites a symbol or file so a later reader can re-verify without re-deriving. Paths are repo-relative from the workspace root.

## 1. Authority reminder

1. **Live engine behavior is first authority.** If a fact, stat, range, cap, phase order, or legality rule can be read from a symbol under `src/`, that symbol wins.
2. **Game-rule documents in `docs/` and `.spec/` are second authority.** They are used where the engine is silent, and are treated as suspect where they contradict a symbol. Contradictions are recorded in section 8, not silently reconciled.
3. **Current prompt copy is not authority at all.** It is an inventory of what we already tell the model. A sentence appearing in today's prompt is evidence that we say it, never evidence that it is true.
4. `debug-last-strategic-prompt.txt` and `debug-last-user-prompt.txt` are used only to cross-check emitted **shape** (which headings appear, in what order). They are one captured consultation, not a contract.
5. `debug-last-tactical-prompt.txt` **is not used as a source anywhere in this package.** It predates several tactical changes; its section list and wording are stale. The tactical catalog in section 3 is derived from code only.
6. `docs/devleopment-plan-v3.3.md` is historical architecture and is not prompt authority.

## 2. Strategic section catalog

Assembled by `buildSystemPromptForTools` in `src/main/openrouter/openRouterBuildSystemPrompt.ts`. The briefing body is produced separately by `formatBriefing` in `src/main/briefingFormatter.ts` and passed in as `briefingOverride`.

### 2.1 Preamble (no headings)

Emitted before `mainBlock`, in this order.

| Content | Builder | Include condition in code | Empty-state | Dump match |
| --- | --- | --- | --- | --- |
| `You are the enemy commander in a WEGO (simultaneous movement) hex wargame. Current turn: {turnNumber}, phase: {phase}.` | `turnPhaseHeader` inline | always | n/a | yes |
| Win-condition reminder sentence pair | `buildWinConditionReminderClause` (`src/main/openrouter/scenarioGoals.ts`) | `coordinateContext.mode !== 'tactical'` | n/a | yes |
| Scouting directive | `scoutingDirective` inline | `humanRoster.length === 0` (strategic only) | omitted entirely | no (dump has 4 observed human units) |
| Tool-limit warning | `warning` inline | `getAndClearAiToolLimitExceededLastTurn()` **and** (`planningEnabled` or `ordersEnabled`) | omitted entirely | no |
| Coordinate preamble (two paragraphs) | `buildLatLngPreamble` (`src/main/openrouter/promptText.ts`) | always (strategic) | n/a | yes |
| Combat stats paragraph | inline: `combatSummary` + `combatTargetHint` + `infantryRangedScope` + `combatTempoClause` + `navalCoaching` + `combatAssessHint` | always; the four suffixes are independently gated (see 2.5) | n/a | yes |

`combatSummary` is built from `getAttack` / `getDefense` and `formatCombatStatRangeClause`, which uses `getRange` in strategic mode. Present values: `infantry: 1 attack / 2 defense, melee only; armor: 3 attack / 2 defense, range 1; naval: 2 attack / 2 defense, range 2; air: 3 attack / 1 defense, range 3`.

### 2.2 Briefing body (`formatBriefing`)

Emit order as coded. All headings quoted exactly.

| Heading | Builder | Include condition in code | Empty-state | Dump match |
| --- | --- | --- | --- | --- |
| `# Commander's Briefing` | `formatBriefing` | always | n/a | yes |
| (narrative, no heading) | `buildStrategicNarrative` | always | never empty; capped at 5 sentences | yes |
| `## Unit Status and Threats` | `formatBriefing` | always | n/a | yes |
| (omniscient hop line, no heading) | `omniscientGridProximityBriefingLine` → `OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE` (`src/main/tools/assessUnitProximity.ts`) | `state.hexes[0]?.h3Index` exists **and** `usesOmniscientGridProximity` (`fogOfWarEnabled === false` and res1) | omitted entirely | no (dump is fog-on) |
| (fog path-distance line, no heading) | `FOG_PATH_DISTANCE_BRIEFING_LINE` (`src/main/tools/assessUnitProximity.ts`) | fog on at res1, immediately after the intel-staleness sentence | omitted when fog is off or in battle | yes |
| (unit status table) | `buildUnitStatusTable` | always | header plus plain line `(No AI units)` | yes |
| `## Attention Flags` | `formatBriefing` | always | `None.` | yes |
| `# Operational Map` | `buildStrategicOperationalMapSectionMarkdown` (`src/main/briefing/map/briefing-map-section.ts`) | `operational.trim().length > 0` | `# Operational Map` plus `(No units — map not rendered.)` when neither side has units | yes |
| `### Best Options This Turn` | `formatBestOptionsThisTurnSubsection` → `renderThisTurnOptionsTableMarkdown` (`src/main/briefing/map/briefing-tables.ts`) | table text non-blank (at least one aggregated row) | heading and table both omitted | yes |
| `## Supplemental Hex Intelligence` | `buildSupplementalHexIntelligenceBlock` | `precomputed.hexAssessments.length > 0` | section omitted | yes |
| `## Recent Turn Notes` | `buildRecentTurnNotesSection` (`src/main/briefing/recentTurnNotesSection.ts`) | at least one of the previous 3 turns has a message, strategy, or loss | section omitted | yes |
| `# Production Status` | `buildProductionBriefingBlock` (`src/main/openrouter/briefingSections.ts`), passed as `productionText` | `productionText.trim().length > 0`; caller gates on `flags.productionEnabled` | section omitted | yes |
| `## Controlled Hex Queues` | same | `queues.length > 0` | replaced by the sentence `No currently controlled hexes with editable production queues.` | yes |
| `# Your Strategic Memory` | `getInjectionText` (`src/main/tools/tool4Memory.ts`), passed as `memoryText` | `memoryText.trim().length > 0`; caller gates on `flags.memoryEnabled` | section omitted | yes |
| `## Persistent (Active Strategic Context)` | same | present whenever the memory block is present | one row of `—` | yes |
| `## Reminders Triggered This Turn` | same | present whenever the memory block is present | one row of `—` | yes |
| `# Standing Order Status` | `getInjectionText` (`src/main/tools/tool5StandingOrdersCore.ts`), passed as `standingOrderText` | `standingOrderText.trim().length > 0`; returns `''` when `coordinateContext.mode === 'tactical'` | section omitted | yes |
| `## Units Without Standing Orders` | same | present whenever the standing-order block is present | one row of `—` | yes |
| `## Active Callbacks` | `buildActiveCallbacksSection` | always | one row: `—` and `None. You may add callbacks in your response JSON to be consulted on specific events.` | yes |

Table columns as coded:

- Unit status: `Unit ID` | `Type` | `Hex` | `Nearest enemy + distance` | `Threat severity` | `Action needed`. No sort key beyond the assessment order (opponent units sorted by id). **No row cap.**
- Best Options: `Unit IDs` | `Action` | `Target Hexes` | `Target Units` | `Target Infrastructure`. `selectTopRowsPerUnit` keeps at most 5 rows per unit; `groupThisTurnOptionRowsByTarget` merges identical action/hex/target rows so one row can list several unit ids.
- Controlled Hex Queues: `Hex` | `Urban Hexes` | `Airports` | `Seaports` | `Available Unit Types` | `Current Queue`. Sorted urban descending then hex text; top 10 plus any further hex with queued entries.
- Memory persistent: `Key` | `Updated Turn` | `Content`. Memory reminders: `Key` | `Tier` | `Recurring` | `Content`.
- Standing Order Status: `Unit ID` | `Unit Type` | `Order Type` | `Destination / Target` | `Status` | `Next Move` | `Turns Remaining` | `Attention`.
- Units Without Standing Orders: `Unit ID` | `Unit Type` | `Suggested Destination`.
- Active Callbacks: `Event` | `Details`.

Attention Flags is a bullet list, not a table: rank-sorted (`buildAttentionFlags`), capped at 5 bullets, with the armed-units bullet naming at most `ATTENTION_ARMED_UNITS_LISTED` (12) ids plus an overflow count sentence.

### 2.3 Sections after the briefing body

| Heading | Builder | Include condition in code | Empty-state | Dump match |
| --- | --- | --- | --- | --- |
| `# Scenario Objective (Required)` | `buildRegionVsRegionScenarioObjectiveBlock` | `state.scenarioId === 'region_vs_region'` **and** mode is not tactical | returns `''`, section omitted | yes |
| `Strategic context:` block (no heading) | `strategicContextBlock` inline | always (strategic) | n/a | yes |
| `# Air Operations Status` | `buildAirOperationsBriefingBlock` | non-empty return; strategic mode always returns a block | one table row of `—` across 9 columns when the opponent has no air | yes |
| `# Naval Transport Status` | `buildSealiftBriefingBlock` | non-empty return; strategic mode always returns a block | one table row of `—` across 7 columns when the opponent has no naval | yes |
| `# Available Tools` | `toolsSection` inline + `buildAvailableToolsIntro` + tool prompt lines + `buildToolUsageGuidance` | always | `# Available Tools` plus `No tools available.` when `getFilteredToolMetadata` is empty | yes |
| `Human units (currently observed): …` | `buildHumanUnitsPromptLine` | always (text varies with roster) | phrasing for an empty roster comes from the same helper | yes |
| Final JSON contract paragraph | `buildFinalJsonContractInstruction` (`src/main/openrouter/promptContracts.ts`) | always | n/a | yes |
| Final JSON example fence | `getFinalJsonOrdersExampleBlock` | always | n/a | yes |

`Strategic context:` contents, in order: `STRATEGIC_CONTEXT_OPENING`, `COACHING_STRATEGIC_PRIORITIES` (5 goals), `COACHING_STRATEGY_BLOCK` (3 strategy lines), `COACHING_MESSAGE_BLOCK`, `Explored:` land-hex progress, `Controlled:` land-hex progress, then `regionHomeProgressAndHexBullets` when `homePartitions` is non-null: own home control, own home hexes when the sets differ, enemy home control, enemy home hexes when the sets differ, and the both-regions overlap line when `intersection.length > 0`.

Air Operations table columns: `Unit ID` | `Base Hex` | `Base Intact` | `Base Controlled` | `Enemy Unit Targets` | `Strikeable Urban` | `Strikeable Airports` | `Strikeable Seaports` | `Ferry Destinations`. Naval Transport table columns: `Unit ID` | `Hex` | `Your control` | `Seaport Here` | `Aboard` | `Capacity Used` | `Nearest Embark Hex`.

### 2.4 Dump-only or code-only extras

- No heading appears in `debug-last-strategic-prompt.txt` that is absent from the catalog above; all 19 dump headings are covered.
- Code-only, absent from that dump because its gates were false: omniscient hop line, scouting directive, tool-limit warning, `# Your Units`-style `ownUnitsLine`, `Adjacent cells (fallback…)` block, and the `assess_unit` / `estimate_combat` combat hints.
- `### Unit Roster` exists in neither code nor dump. It was removed from the operational map section and must not be reintroduced.
- When a briefing override is present, `buildSystemPromptForTools` still computes `memoryBlock`, `standingOrderBlock`, and `productionBlock` but does not emit them; the same text reaches the model inside `formatBriefing` instead. Two call sites, one output. See discrepancy `DUP_INJECTION`.

### 2.5 Conditional preamble suffixes

| Suffix | Gate |
| --- | --- |
| `combatTargetHint` (`(e.g. use estimate_combat to pick the best)`) | `flags.estimationEnabled && !hasPrecomputedBriefing` |
| `navalCoaching` (naval range 2, movement rule, land-target hint) | `hasNaval`; land-target hint additionally requires `flags.planningEnabled` |
| `combatAssessHint` (`When assess_unit reports canAttackThisTurn…`) | `flags.assessmentEnabled && hasRanged && !hasPrecomputedBriefing` |
| `combatTempoClause` mentions air strikes | `hasAir` |
| `infantryRangedScope` | strategic wording when not tactical; tactical wording when tactical |

## 3. Tactical section catalog

Derived from `formatTacticalBriefing` (`src/main/openrouter/formatTacticalBriefing.ts`), `tacticalBriefingAssessments.ts`, the tactical branches of `buildSystemPromptForTools`, `promptText.ts`, and `promptContracts.ts`. **The stale tactical debug dump was not opened for this catalog.**

### 3.1 Tactical briefing body

| Heading | Builder | Include condition in code | Empty-state |
| --- | --- | --- | --- |
| `# Commander's Briefing` | `formatTacticalBriefing` | always | n/a |
| (narrative, no heading) | `buildTacticalBriefingNarrative` | always | never empty; opens with `Tactical beat {n}: you command {n} sub-unit(s); human sub-units in this battle: {m} (full visibility).` |
| `## Unit Status and Threats` | `buildUnitStatusTable(assessments, coordCtx, false)` | always | `(No AI units)` |
| `## Attention Flags` | `buildAttentionFlags(assessments, 'tactical', false)` | always | `None.` |
| `# Operational Map` | `buildTacticalOperationalMapSectionMarkdown` | always; if the whole map block is blank, `formatTacticalBriefing` returns `''` and the caller treats it as briefing-absent | `_No tactical cells — map not rendered._` when the footprint is empty |
| `### Best Options This Turn` | `formatBestOptionsThisTurnSubsection` | at least one aggregated row | heading and table both omitted |
| `## Recent Turn Notes` | `buildRecentTurnNotesSection({ scope: 'tactical', … })` | at least one qualifying prior row | section omitted |
| `## Active Callbacks` | `buildActiveCallbacksSection(getSubscriptions('opponent'), coordCtx)` | always | same `—` row as strategic |

Tactical unit status uses the identical six columns as strategic and has **no** standing-order column. Suppression happens twice over: `buildUnitStatusTable` is called with `standingOrdersActive = false`, and the assessment builders set `currentStandingOrder: null` because standing orders do not move sub-units in a beat. Attention Flags in tactical emits only threat bullets plus the armed-units bullet, capped at 5.

Tactical Best Options columns match strategic. Action values present in tactical: `air strike`, `ranged`, `approach`, `move/melee`. `ferry` rows are not produced in tactical (`collectAggregatedPossibleActionRows` returns no air move rows when a tactical battle is set).

### 3.2 Tactical system-prompt shell differences

| Surface | Tactical value |
| --- | --- |
| Turn header | `Strategic turn: {turnNumber}, tactical beat: {tacticalTurnNumber}, phase: {phase}.` |
| Goal clause | `buildTacticalBattleGoalClause`: `Your goal is to engage and defeat enemy forces in this battle. Review the rules, below, for how to order this.` |
| Coordinate preamble | `buildTacticalLatLngPreamble`: res4 children of the enclosing res1 hex; two-character tactical codes; `enemy sub-unit ids for targetUnitId` |
| Combat range clause | `formatCombatStatRangeClause` tactical branch: air is `, strike anywhere in the battle`; others use `RANGED_RANGE_BY_UNIT_TYPE` (`infantry: 2`, `armor: 5`, `naval: 10`) |
| Infantry clause | `Infantry may use ranged_attack at tactical res4 range (baseline 2; terrain may reduce it); use movement and melee when out of range.` |
| Coaching block | `tacticalContextBlock`: `COACHING_TACTICAL_PRIORITY`, `COACHING_STRATEGY_BLOCK`, `COACHING_MESSAGE_BLOCK`. No `Explored:` / `Controlled:` / home-region bullets. |
| Scenario objective | `''` (omitted) |
| Scouting directive | `''` (omitted) |
| Movement clause | `getMovementOrderInstruction` tactical branch adds terrain-weighted MP, first-leg truncation, and the one-step fallback sentence |
| Orders clause | `explicit_move`, `ranged_attack`, `transport_move`, `disembark`, `embark`; `Do not emit assign_order or cancel_order for tactical sub-unit ids.` |
| Callbacks clause | tactical sub-unit ids for unit-scoped events; evaluated after each beat in event-driven mode; cleared when the battle ends; each consultation replaces the full list |
| Tools intro | `buildAvailableToolsIntro` tactical branch (briefing present) |
| Tool guidance | briefing bullet, Best Options bullet (`this-beat legal destinations`), no-assign_order bullet, `buildTempoRuleLine('beat')`, sealift bullet |
| Air / naval blocks | present in the shell when the opponent has that arm; tactical air block states `Air rules (tactical): strikes may target enemy sub-units anywhere in this battle footprint; one air action per unit per beat.` and omits `Ferry Destinations` / `Strikeable Urban`; tactical sealift omits `Nearest Embark Hex` |

Always omitted in tactical: `# Standing Order Status`, `## Units Without Standing Orders`, `## Supplemental Hex Intelligence`, `# Production Status`, `# Your Strategic Memory`, `# Scenario Objective (Required)`, `### Unit Roster`, the omniscient hop line, the `Explored:` / `Controlled:` bullets, the strategic air-repositioning bullet, and the `assess_unit` / `estimate_combat` hints.

`TACTICAL_AI_PROMPT_STRATEGIC_SECTION_MARKERS` in `src/main/openrouter/tacticalPromptProjection.ts` names the strings a tactical prompt must not contain: `memoryupdates`, `productionorders`, `query_production`, `enemyintel`, `set_build_queue` (matched case-insensitively as substrings).

## 4. Consultation-message catalog

Built in `src/main/openrouter/requestOrdersFlow.ts`. The system prompt is constructed once and is never replaced or re-pushed during the consultation; the tool-limit warning reaches the model on the **next** consultation's system prompt, not mid-loop.

Message order: `system`, initial `user`, then zero or more (`assistant` with `tool_calls`, one `tool` message per call), then the final `assistant` text. The main loop runs at most 50 rounds (literal `while (iteration < 50)`; no named constant) and is also bounded by `REQUEST_ORDERS_MAX_WALL_CLOCK_MS` (90000 ms in `requestOrdersFlowSupport.ts`).

| Message kind | Source | When appended | Tools enabled on that call | States a rule? |
| --- | --- | --- | --- | --- |
| Initial user | `getInitialUserMessage` (`src/main/openrouter/promptText.ts`) | once, before the first call | yes (`tool_choice: 'auto'`) | **yes** — see 4.1 |
| Tool result | `requestOrdersFlow` + `encodeOpenRouterToolResultForLlm` (`src/main/openrouter/openRouterToolResultHex.ts`) | one per tool call the model makes | yes | no (facts and engine error strings only) |
| Malformed-completion corrective user | `buildMalformedCompletionCorrectiveMessage` (`src/main/openrouter/malformedCompletionRetry.ts`) | only when `nextRetryCount === MALFORMED_COMPLETION_RETRY_LIMIT` (2), i.e. before the final retry | yes | no (submit-shape only) |
| Parse-repair user | inline template in `requestOrdersFlow` + `buildJsonAssistantRepairSchema` (`src/main/openrouter/orderResponseParsing.ts`) | at most once, after a final assistant text fails to parse | **no** (`tool_choice: 'none'`, no `tools` key) | no (schema only) |

The repair call uses a separate copy of the message array; neither the unparseable assistant text nor the repair exchange is merged back into the main conversation.

### 4.1 Initial user message branches

`getInitialUserMessage(flags, hasPrecomputedBriefing, coordinateMode)`. Branches in evaluation order.

| Branch | Gate | Rule text it currently carries |
| --- | --- | --- |
| Tactical, briefing present | `planningEnabled` and `hasPrecomputedBriefing` and `coordinateMode === 'tactical'` | Best Options copy rule; `plan_route` only for unlisted dests; forbidden `assign_order` / `cancel_order` |
| Strategic, briefing present | `planningEnabled` and `hasPrecomputedBriefing` and mode is strategic | orderless-unit `assign_order` nudge (when `ordersEnabled`); Best Options copy rule split by action type; `plan_route` restriction; memory note; the whole production doctrine paragraph |
| No briefing | `planningEnabled` and not `hasPrecomputedBriefing` | memory note; production doctrine paragraph |
| Orders + memory, no planning | `!planningEnabled && ordersEnabled && memoryEnabled` | "use assign_order in orders[] and memoryUpdates for notes" |
| Orders only, no planning | `!planningEnabled && ordersEnabled && !memoryEnabled` | "use assign_order in orders[] for future turns" |
| Fallback movement | `!planningEnabled && fallbackMovementEnabled` | `Use explicit_move from the Adjacent cells list only.` |
| Memory only | `!planningEnabled && !fallbackMovementEnabled && memoryEnabled` | none beyond submit shape |
| Default | none of the above | none beyond submit shape |

Because `getToolFlags` sets `fallbackMovementEnabled = !planningEnabled && !ordersEnabled`, the last two branches are unreachable with today's flag derivation. They are still catalogued because they are live code paths if that derivation changes.

Rule quotes carried by user text today, each of which must end up in the system prompt or be dropped:

- `For units without standing orders in the briefing, include assign_order entries in orders[].`
- `Copy Best Options approach and move/melee Target Hexes into explicit_move when you need a one-step move this turn; copy ferry Target Hexes into ferryOrders.`
- `Call plan_route only if you need a dest not listed for that unit.`
- `After your analysis, include memoryUpdates in your final JSON for strategy notes.`
- `Also ensure production is actively queued when viable: when at least one controlled hex has availableUnitTypes and an empty queue, include at least one production action.` plus `PRODUCTION_REQUIREMENT_PRIORITY_INITIAL`, `PRODUCTION_CAP_QUEUE_GUIDANCE`, and `Prefer setting queues on every eligible controlled hex so production survives territory swings and reinforcements stay close to the front.`
- Tactical only: `For every sub-unit with a Best Options approach or move/melee row, copy a Target Hex from that sub-unit's Best Options This Turn row into explicit_move.destination.` and `do not use assign_order or cancel_order`.

`debug-last-user-prompt.txt` matches the strategic briefing-present branch with `ordersEnabled`, `memoryEnabled`, and `productionEnabled` all true, confirming that every rule above reaches the model twice (once in the system prompt, once in the user message).

### 4.2 Tool-result encoding

`encodeOpenRouterToolResultForLlm` returns the payload untouched when `result.status !== 'ok'`, so engine error strings reach the model verbatim. For `status === 'ok'`:

| Tool | Handler | Rewrites |
| --- | --- | --- |
| `plan_route` | `redactPlanRouteResult` | drops `origin`, `destination`, `orderToXY`, `orderToH3`; adds `orderToHexCode`; path `hexes`→`hexCodes`, `endHex`→`endHexCode`; `suggestedDestinations`→`suggestedDestinationHexCodes` |
| `check_distance` | `redactCheckDistanceResult` | drops `from`, `to`; adds `fromHexCode`, `toHexCode` |
| `query_production`, `set_build_queue` | `redactTool6ProductionPayload` | queue row `hex` tuple becomes `hexCode` |
| `assess_unit`, `assess_hex`, `estimate_combat`, `assign_order`, `query_orders`, `cancel_order`, `memory_*` | `deepRedactGeoCoordinateFields` | `GEO_COORDINATE_FIELD_KEYS`: `position`, `destination`, `defendHex`, `targetHex`, `nextMoveHex`, `origin`, `orderToXY`, `endHex`, `from`, `to`; `GEO_COORDINATE_ARRAY_KEYS`: `waypoints`, `totalPath` |

Failure handling: a tuple that cannot be encoded is left to recursive descent; unencodable array elements are dropped; a thrown error in top-level redaction is logged and the original result is returned. Non-object results skip the encoder entirely. Model-visible error payloads: `{"status":"error","error":"Tool {name} is disabled."}`, `{"status":"error","error":"Invalid briefing hex code in tool arguments."}`, and `{"status":"error","error":"Unknown tool: {name}"}`.

### 4.3 Retry and repair text

- `MALFORMED_COMPLETION_RETRY_LIMIT = 2`. Detection: no non-empty `tool_calls` **and** no non-empty string `content`. Exhaustion reason: `AI returned an unusable reply (no tool call and no content) after retries. Please try again.`
- Corrective message: `Your previous reply contained neither a tool call nor any text content, so it could not be used. Do not repeat that reply. Respond now with exactly one of: a single well-formed tool call, or your final orders as one JSON object matching the schema in the system prompt. Never return an empty message.`
- Repair template: `Your previous response was not parseable JSON. Reply now with JSON only (no prose, no markdown, no code fences) using exactly this top-level object schema (orders[] only; no movementOrders/rangedAttacks; never a top-level array): {schema}. Omit optional arrays when empty.`
- `buildJsonAssistantRepairSchema(includeProductionOrders)` emits keys in this order: `message`, `strategy`, `orders`, `airStrikes`, `ferryOrders`, `callbacks`, `memoryUpdates`, and `productionOrders` only when the flag is true. `requestOrdersFlow` passes `tacticalBattle ? false : flags.productionEnabled`.
- Repair is attempted once. A second failure fails the consultation with `Invalid response: could not parse orders`.
- Loop exhaustion (50 rounds) is not a parse failure: it sets the tool-limit flag, records a successful-but-empty consultation, logs an error, and returns zero orders.

## 5. Engine information catalog

`prompt` column: `present` = the fact is stated to the model; `partial` = a related fact is stated but not this one, or only in one mode; `absent` = never stated.

### 5.1 `GameStateSnapshot` (`src/shared/ipc/gameStateTypes.ts`)

| Symbol | Meaning | Prompt |
| --- | --- | --- |
| `hexes[].h3Index` | res1 cell identity | present as briefing codes |
| `hexes[].terrain` | land / water / coastal / unknown bucket | present (map legend, hex intelligence) |
| `hexes[].terrainKind` | finer terrain kind | partial (hex intelligence notes only) |
| `units[].id` | strategic unit id | present |
| `units[].player` | `human` or `opponent` | present |
| `units[].unitType` | infantry / armor / naval / air | present |
| `units[].h3Index` | occupied cell | present |
| `units[].displayOrder` | stack render order | absent (UI only) |
| `units[].embarkedOnNavalUnitId` | strategic sealift cargo link | present (`Aboard`, `Capacity Used`) |
| `units[].embarkedOnSubUnitId` | tactical cargo link | present in tactical sealift block |
| `visibleHexes` | currently visible cells | partial (drives content; never explained) |
| `exploredHexes` | ever-seen cells | present as the `Explored:` progress line |
| `staleHexes` | explored but not visible now | absent |
| `enemyIntel[]` | last-known enemy positions, `intelState`, `lastSeenTurn`, `staleUntilTurn` | partial (`confidence` / `seen tN` in the unit table); the word `enemyIntel` is a forbidden tactical marker |
| `playerPerspective` | snapshot viewer | absent (correctly internal) |
| `fogOfWarEnabled` | fog rules on | yes (staleness sentence plus path-versus-Best-Options line when true; hop-honesty line when false at res1) |
| `gameSize` | small / medium / large | partial (caps are printed; the size name is not) |
| `scenarioId` | active scenario | present in the objective block |
| `humanHomeRegion`, `aiHomeRegion` | region names | present |
| `humanHomeRegionHexes`, `aiHomeRegionHexes` | region hex lists | present as exclusive lists |
| `intersectingHomeRegionHexes` | overlap | present via `computeHomeRegionHexPartitionsForPrompting` |
| `contestedHomeRegionHexes` | home hexes with both sides present | absent |
| `phase` | turn phase | present |
| `turnNumber` | strategic turn | present |
| `pendingOrders` | human queued movement | absent (correctly hidden) |
| `res1Control[]` | per-hex controller | present as progress lines and map case |
| `res1BuildQueueTotals[]` | `queuedUnits`, `nextUnitType`, `nextRemainingCount`, `storedPoints` | partial (`Current Queue` shows type/count; `storedPoints` is absent) |
| `res1Infrastructure[]` | `urbanHexCount`, `airportCount`, `seaportCount` | present |
| `gameOver`, `winner` | terminal state | absent (no consult occurs) |
| `tacticalBattleSession` | active battle | present as the tactical framing |

### 5.2 Precomputation (`src/main/precomputation.ts`)

| Symbol | Meaning | Prompt |
| --- | --- | --- |
| `unitAssessments[].result.unit.currentStandingOrder` | order on the unit | present strategic; forced `null` tactical |
| `nearbyEnemies[].hexDistance` | hop distance to enemy | present |
| `nearbyEnemies[].estimatedTurnsToReach` | ETA | partial (threat text) |
| `nearbyEnemies[].inRangedRange` / `inMeleeRange` | contact flags | partial (feeds narrative and Action needed) |
| `nearbyEnemies[].confidence` / `lastSeen` | intel quality | present in the nearest-enemy cell |
| `threats[]` | description, severity, source | present (`Threat severity`, Attention Flags) |
| `canAttackThisTurn` | legal attacks | partial (armed-units bullet; the per-unit list is not printed) |
| `hexAssessments[]` | terrain, `passableBy`, `strategicNotes` per human-occupied hex | present as Supplemental Hex Intelligence |
| radius 4 | assessment scan radius | absent |

### 5.3 Combat, movement, and caps

| Symbol | Value / meaning | Prompt |
| --- | --- | --- |
| `ATTACK` / `getAttack` | infantry 1, armor 3, naval 2, air 3 | present |
| `DEFENSE` / `getDefense` | infantry 2, armor 2, naval 2, air 1 | present |
| `strategicRangedRangeHexesForUnitType` | infantry 0, armor 1, naval 2, air 3 | present |
| `RANGED_RANGE_BY_UNIT_TYPE` | infantry 2, armor 5, naval 10, air 99 | present in tactical (air rendered as strike-anywhere) |
| `MOVEMENT_BUDGET` | infantry 1, armor 2, naval 2, air 0 | absent |
| `MOVEMENT_RANGE_BY_UNIT_TYPE` | infantry 2, armor 4, naval 3, air 0 | partial (implied by Best Options dests) |
| `effectiveTacticalMovementPointBudgetForMarchLeg` | urban/rubble cost, armor-in-forest penalty, floor of 1 | partial (MP mentioned, numbers not) |
| `AIR_STRIKE_RANGE_HEXES` = 3 | strategic strike radius | present |
| `AIR_FERRY_RANGE_HEXES` = 4 | ferry radius | present |
| `getMaxUnitsPerType` / `parseGameSize` | small 12/8/8/6, ×2 medium, ×4 large | present as the deployment-cap line |
| `UNIT_COST_BY_TYPE` | infantry 20, armor 40, naval 100, air 60 | present |
| `CASUALTY_PRIORITY_ORDER` | infantry, armor, naval, air | absent |
| lowest-defense-first victim sort | who dies first | absent |
| `casualtyPriorityIndex` | tie-break | absent |

### 5.4 Resolution order and tempo

| Symbol | Meaning | Prompt |
| --- | --- | --- |
| `executeReadyStrategicTurn` (`src/main/game-actions/readyStrategicResolutionPipeline.ts`) | embark → air strikes → ranged → movement → cargo sync → ferry → melee | partial (only "ranged uses pre-move positions") |
| `applyHumanTacticalDraftBeatInStrategicOrder` | same order per beat, no production | partial |
| `collectTempoRuleAttacks` (`src/main/tools/tempoRuleAttacks.ts`) | engine adds one attack for each unit that can legally fire and was not already ordered | absent by design (see `TEMPO_SWEEP_SILENCE`) |
| `holdFireUnitIdsForPlayer` | `hold_fire` units are skipped by the sweep | absent |
| `collectTacticalTempoAttacks` | tactical equivalent, keyed on parent id for `hold_fire` | absent |
| `mergeOpponentAttackOrders` | model orders beat standing orders beat sweep | absent |

### 5.5 Orders, production, memory, callbacks

| Symbol | Meaning | Prompt |
| --- | --- | --- |
| `assignOrder` types | `defend`, `march`, `pursue`, `patrol`, `hold_fire` | present, except `hold_fire` is listed in the JSON contract with no guidance on when to use it |
| march-to-current-hex drop | order becomes `arrived` and is not persisted | present (one bullet) |
| `AIR_INELIGIBLE_ORDER_TYPES` | air rejects `march`, `pursue`, `patrol` | present |
| `expireAndUpdateStatus` | dead-unit, air-movement, arrived, and lost-target cleanup | absent |
| `WARNING_STATUSES` | `blocked`, `target_lost`, `target_out_of_range`, `target_destroyed`, `arrived`, `contact` | present as the `Attention` column |
| `PERSISTENT_LIMIT` 5 / `STORED_LIMIT` 15 | memory slots | present |
| memory content 500 chars, key 64 chars, `[A-Za-z0-9_-]` | write limits | absent |
| `applyProduction` | urban count adds points per turn; spend in queue order | partial (resolution timing stated, income rule absent) |
| `BUILD_ENTRY_MIN_COUNT` / `MAX` | count 1..99 | present |
| `getMaxedUnitTypesForPlayer` | which types are at cap | present |
| `filterQueueableUnitTypes` / `ALL_AVAILABLE_TYPES_AT_CAP_NOTE` | `all at cap` marker | present |
| `shouldRejectCappedQueueType` | capped type rejected when an alternative exists | present |
| mandatory overrides | `first_consultation`, `first_combat`, `new_contact`, `unit_destroyed`, `unordered_unit`, `standing_order_blocked`, `attack_mix_changed`, `deadman` (5 turns) | absent |
| subscription events | `turns`, `unit_engaged`, `unit_destroyed`, `unit_arrived`, `threat_escalation`, `infrastructure_destroyed`, `territory_changed` (not implemented) | absent as a list; only whatever the model already subscribed to appears in Active Callbacks |
| `replaceSubscriptions` / `clearSubscriptions` | full-list replace per consult; cleared on battle end | present in tactical clause; strategic states replace only in the empty-state sentence |

### 5.6 Destinations, embark, fog, scenario, map legend

| Symbol | Meaning | Prompt |
| --- | --- | --- |
| `getValidDestinations` | reachable set by domain and range | partial |
| `getValidDestinationsUnoccupied` | same, minus every hex occupied by any unit | partial (Best Options is filtered; the rule is never stated) |
| `pickApproachHexesTowardNearestEnemy` | keeps candidates that strictly reduce hop distance | present indirectly through two tables |
| `suggestApproachDestinationsForOrderlessUnits` | Suggested Destination column | present |
| `canEmbarkAtHex` (`src/shared/sealiftEmbarkEligibility.ts`) | coastal or land seaport unconditionally; naval-transit + seaport only when controlled | partial (embark rules are prose; the control condition is not spelled out) |
| `computeVisibleHexesForSide` / `VISION_RANGE_BY_UNIT_TYPE` | infantry 1, armor 2, naval 2, air 3 | absent |
| `STALE_INTEL_TURNS` = 2 | stale intel lifetime | absent |
| `usesOmniscientGridProximity` | fog off and res1 | present through the hop-honesty line |
| `getForcedVisibleHomeRegionHexesForPlayer` | own home plus intersection always visible | present as one bullet in the objective block |
| `REGION_VS_REGION_SCENARIO_ID` | the only scenario id typed or persisted | present |
| `evaluateRegionControlWinnerAtEndOfTurn` | control win or urban-elimination win | present |
| `computeHomeRegionHexPartitionsForPrompting` | `aiExclusive`, `humanExclusive`, `intersection`, `equalAsSets` | present |
| strategic map legend | `x` land, `.` water, `*` yours, `!` enemy, `#` contested, `?` undiscovered, `A/a` airport, `S/s` seaport, `B/b` both, `U/u` urban, uppercase = your control | present |
| tactical map legend | same minus the `?` and feature tokens | present |
| `renderDisplacedFeaturesLine` | `Units at featured hexes: {code}({feature})` | present when non-empty |

## 6. Variant-gate catalog

| Gate symbol | Branches on | Prompt surfaces affected |
| --- | --- | --- |
| `state.fogOfWarEnabled` (via `usesOmniscientGridProximity`) | fog off + res1 | omniscient hop line in `briefingFormatter.ts`; enemy rows in every table via the filtered snapshot |
| `getToolFlags(enabledToolNames)` | `planningEnabled`, `assessmentEnabled`, `estimationEnabled`, `ordersEnabled`, `memoryEnabled`, `productionEnabled`, `fallbackMovementEnabled` | tools section, tool guidance, all injection blocks, movement clause, submit clauses, JSON tails, every initial-user branch |
| `hasAir` (`opponentUnits.some(u => u.unitType === 'air')`) | opponent air present | `combatTempoClause`, air ops block, `includeAirActions` in the JSON contract and example |
| `hasNaval` | opponent naval present | `navalCoaching`, `plan_route` prompt-line suffix, sealift block |
| `humanRoster.length === 0` | no observed enemy | scouting directive; narrative scouting sentence |
| Best Options row count | zero aggregated rows | `### Best Options This Turn` omitted; the copy-Best-Options coaching keeps pointing at an absent table |
| orderless units | units with no standing-order row | `## Units Without Standing Orders` rows and the assign_order coaching |
| `state.scenarioId` | `region_vs_region` vs absent | `# Scenario Objective (Required)`; `homePartitions` and every home-region bullet |
| `state.gameSize` via `parseGameSize` / `getMaxUnitsPerType` | small / medium / large | deployment-cap line, maxed-type list, `all at cap` markers |
| event-driven entry points `runEventDrivenAfterResolutionConsultation`, `runEventDrivenAfterTacticalBeatConsultation` | whether a consult happens at all | no text difference in the system prompt; changes only whether the model is asked |
| `coordinateContext.mode` | strategic vs tactical | every surface in section 3 |
| `briefingOverride` present vs absent | precomputed briefing | `mainBlock` shape, `ownUnitsLine`, tools intro, tool guidance, movement clause, initial-user branch |
| `getAndClearAiToolLimitExceededLastTurn()` | previous turn hit 50 rounds | preamble warning paragraph |

## 7. Coaching claim catalog

`engine-true` means a cited symbol confirms the claim. `engine-false` means a cited symbol contradicts it. `unverifiable` means the claim is doctrine or judgment with no symbol to check.

| Quoted claim (abbreviated where long) | Where | Verdict | Symbol checked |
| --- | --- | --- | --- |
| `At most one ranged_attack per unit from turn-start range` | system preamble | engine-true | `runRangedPhase`, `mergeOpponentAttackOrders` |
| `Ranged uses pre-move positions.` | system preamble | engine-true | phase order in `executeReadyStrategicTurn` (ranged before movement) |
| `Infantry has no strategic ranged_attack (melee only)` | system preamble (strategic) | engine-true | `strategicRangedRangeHexesForUnitType.infantry === 0` |
| `Infantry may use ranged_attack at tactical res4 range (baseline 2…)` | system preamble (tactical) | engine-true | `RANGED_RANGE_BY_UNIT_TYPE.infantry === 2` |
| `these attacks resolve from turn-start positions and do not prevent movement in the same turn` | system preamble | engine-true | ranged and air phases precede the movement phase |
| `Naval units can attack land units at 1 or 2 hexes (range 2).` | system preamble | engine-true | `strategicRangedRangeHexesForUnitType.naval === 2` |
| `Naval units move on water/coastal hexes.` | `NAVAL_MOVEMENT_PROMPT_RULE` | engine-true | `getNavalStrategicReachableHexes` |
| `To move a naval unit toward a land target… call plan_route with that land unit's briefing hex code` | `NAVAL_PLAN_ROUTE_LAND_TARGET_HINT` | engine-true | `plan_route` naval land-target handling |
| `strike range 3 from base, ferry range 4 airport-to-airport, one air action per unit per turn` | air ops block | engine-true | `AIR_STRIKE_RANGE_HEXES`, `AIR_FERRY_RANGE_HEXES`, ferry-vs-strike drop in the resolution pipeline |
| `An air unit cannot strike and ferry on the same turn` | `AIR_REPOSITIONING_LINE` | engine-true | ferry orders dropped for units that also have air strikes |
| `Air units never move hex by hex, so "march", "patrol", and "pursue" are rejected for them` | JSON contract | engine-true | `AIR_INELIGIBLE_ORDER_TYPES`, `canAssignStandingOrderType` |
| `Never march to the unit's current Hex; that order is dropped as already arrived` | tool guidance | engine-true | `assignOrder` march branch |
| `Best Options This Turn Target Hexes are already this-turn legal destinations.` | tool guidance | engine-true | `collectAggregatedPossibleActionRows` built from `getValidDestinationsUnoccupied` |
| `One row can list several unit ids in Unit IDs…` | tool guidance | engine-true | `groupThisTurnOptionRowsByTarget` |
| `That table's Suggested Destination column already holds a legal hex that closes on the nearest enemy` | tool guidance | engine-true | `suggestApproachDestinationsForOrderlessUnits` → `pickApproachHexesTowardNearestEnemy` |
| `Tempo rule: every unit that can legally attack this turn should be given a ranged_attack or air strike` | tool guidance | engine-true | attacks are free of movement cost; see `TEMPO_SWEEP_SILENCE` for what is deliberately not said |
| `every one you leave unfired is damage given up for free` | tool guidance | engine-false as literally written | `collectTempoRuleAttacks` fires for un-ordered units, so an omitted shot is taken by the engine except for units under `hold_fire` and units that already have an attack |
| `Nearest-enemy distances and threat ETAs are H3 grid hops (straight hex count), not march or sail paths.` | briefing | engine-true | `gridHopDistancesFrom` used by `assessUnitProximity` |
| `persistent entries appear in every briefing (limit 5); stored are retrieved via memory_read (limit 15)` | tool guidance | engine-true | `PERSISTENT_LIMIT`, `STORED_LIMIT` |
| `there are no memory_write or memory_delete tools` | submit clause | engine-true | `TOOL4_NAMES` contains only `memory_read` |
| `Production progress/spawn resolves after Ready, after combat and control resolution.` | production block | engine-true | production step position in the ready pipeline |
| `Do not queue types at maximum while other types can still be built…` | production copy | engine-true | `shouldRejectCappedQueueType`, `filterQueueableUnitTypes` |
| `Each set_build_queue item fully replaces the chosen hex queue with one unit type/count.` | submit clause | engine-true | `set_build_queue` in `tool6Production.ts` |
| `Both home-region outlines are always visible on the map.` | objective block | engine-true | `getForcedVisibleHomeRegionHexesForPlayer` |
| `Win at end of turn by either: (1) Controlling all hexes intersecting the enemy home region, OR (2) Eliminating all urban production…` | objective block | engine-true | `evaluateRegionControlWinnerAtEndOfTurn` |
| `Units with standing orders do not need explicit orders from you unless you want to override…` | tool guidance | engine-true | standing-order generation runs for units without model orders |
| `Standing orders do not move units in tactical battle.` | tactical guidance | engine-true | tactical beat resolution never reads standing-order movement |
| `Queue production aggressively: set_build_queue on every controlled hex that can build` | tool guidance | unverifiable | doctrine |
| `Disperse your units to maximize visibility` | coaching block | unverifiable | doctrine; interacts with fog-on vision radii |
| `Use speed, surprise, and initiative…` / `Attack the enemy's weaknesses (gaps)…` / `Create maximum disruption with minimum force` | coaching block | unverifiable | doctrine |
| `At least one enemy unit remains in play, and the human player is actively searching for your forces with intent to destroy them.` | coaching block | engine-false as an unconditional claim | emitted with no check against `humanUnits.length`; contradicts the scouting directive branch when the roster is empty |
| `Do not claim "no observed human units" when the briefing lists observed human units.` | tool guidance | unverifiable | memory-hygiene instruction |
| `Address the human player in character… Psychological warfare only` | coaching block | unverifiable | product intent |

## 8. Discrepancy log

Every row resolves the same way: the prompt spec follows the **engine**.

| Id | Claim | Engine | Spec doc | Prompt | Spec follows |
| --- | --- | --- | --- | --- | --- |
| `CAPS_V3_STALE` | Per-side unit caps | `getMaxUnitsPerType` × `GAME_SIZE_MULTIPLIER`: small 12/8/8/6, medium 24/16/16/12, large 48/32/32/24 | `combat-rules-v3.md` states a different, smaller fixed table; `game-size-unit-caps.md` matches the engine | prints engine caps | engine |
| `TACTICAL_STRUCTURE_V3` | Tactical turn structure | one consult per beat, `tacticalTurnNumber` increments, resolution mirrors the strategic phase order minus production | `combat-rules-v3.md` describes an older structure | prompt describes beats | engine |
| `WEGO_ORDER_UNSTATED` | Resolution phase order | embark, air strikes, ranged, movement, cargo sync, ferry, melee | `combat-rules-v3.md` lists a five-phase order without embark or cargo sync | prompt now states the engine order | engine |
| `CALLBACK_DETAILS_THIN` | Active Callbacks `Details` | paramless `infrastructure_destroyed` is stored without type or cell | none | Details describes an unfiltered watch and tells the model to re-subscribe with no params | engine |
| `TEMPO_SWEEP_SILENCE` | Unfired legal shots | `collectTempoRuleAttacks` adds one attack per eligible un-ordered unit; `hold_fire` units and units already attacking are skipped | `tempo-rule-enforcement.md` documents the sweep | prompt says an unfired shot is "damage given up for free" and never mentions the sweep | engine as the recorded fact; the prompt contract keeps the sweep unstated on purpose, and this file records that as a deliberate omission rather than an accident |
| `HOLD_FIRE_UNGUIDED` | `hold_fire` | suppresses both auto-engagement and the tempo sweep for that unit | none | listed as a legal order type with no stated effect | engine |
| `OCCUPANCY_UNSTATED` | Destination legality | `getValidDestinations` allows enemy-occupied dests as contact; approach uses unoccupied dests | `orderless-unit-destination-suggestions.md` describes the suggestion helper | prompt now states friendly stacks are illegal and enemy cells are move/melee | engine |
| `CASUALTY_ORDER_ABSENT` | Who dies first | lowest `getDefense`, then `CASUALTY_PRIORITY_ORDER` | none | absent | engine |
| `STRATEGIC_CONTEXT_OPENING_UNCONDITIONAL` | "At least one enemy unit remains in play" | no check against the live roster | none | stated unconditionally, including when zero human units are observed and the scouting directive fires | engine |
| `TEMPO_FREE_CLAIM` | "every one you leave unfired is damage given up for free" | false for `hold_fire` units and for units the sweep covers | `tempo-rule-enforcement.md` | stated as absolute | engine |
| `CALLBACK_VOCAB_ABSENT` | Callback event names | `callbackEvaluation.ts` defines the full subscription vocabulary; `territory_changed` is accepted but never fires | none | the model is invited to add callbacks with no list of valid events | engine |
| `EMBARK_CONTROL_CONDITION` | Embark legality | `canEmbarkAtHex`: coastal or land seaport unconditionally; naval-transit terrain with a seaport only when the hex is controlled by the embarking player | `naval-transport-briefing-embark-rules.md` | embark prose omits the control condition | engine |
| `OMNISCIENT_GATE_NARROW` | Hop-distance honesty line | gate requires `fogOfWarEnabled === false` **and** res1 for the hop-count line; fog-on at res1 emits a separate path-versus-Best-Options line | `assess-unit-omniscient-grid-proximity.md` | hop-count line under the omniscient gate; path line under fog-on at res1 | engine |
| `INFANTRY_RANGE_SPLIT` | Infantry ranged | strategic 0, tactical 2 | `combat-rules-v3.md` treats infantry as melee-only without the tactical split | prompt already splits by mode | engine |
| `FACE_CROSSING` | Hop distances near icosahedron faces and pentagons | grid-hop helpers fall back to BFS path distance when a hop count is unavailable, so a printed hop count can understate a real route | `h3-face-crossing-distances.md` | fog-off hop-versus-path line plus fog-on path-versus-Best-Options line | engine |
| `DUP_INJECTION` | Memory, standing-order, and production injection text | computed in both `buildSystemPromptForTools` and the `formatBriefing` call path; only one copy is emitted | none | single copy reaches the model | engine; recorded because two call sites is a churn source |
| `USER_RULE_DUPLICATION` | Rules in the initial user message | no engine opinion | none | production doctrine, Best Options copy rules, `plan_route` restriction, and memory instructions appear in both the system prompt and the user message | not an engine question; the assembly contract resolves it by moving every rule to the system prompt |
| `UNREACHABLE_USER_BRANCHES` | Two `getInitialUserMessage` branches | `fallbackMovementEnabled = !planningEnabled && !ordersEnabled` makes the memory-only and default branches unreachable | none | dead text | engine |
| `ENVELOPE_FIELD_ORDER_DRIFT` | Field order in the response envelope | parsing is order-independent, so the engine has no opinion | none | the submit header lists the air tails before `callbacks`, the illustrative JSON object is built with `callbacks` before the air tails, and the repair schema follows the header order | not an engine question; `assembly-contract.md` 5.1 fixes one order and every surface follows it |
| `TOOL_ROUND_CAP_LITERAL` | 50-round cap | literal `50` in the loop and literal `50 rounds` in the warning string, with no shared constant | none | warning quotes 50 | engine; recorded because the two literals can drift |
