# Source inventory and discrepancy log

Catalog of what the AI commander prompt **currently emits**, what the engine **currently provides**, and where they still disagree. This is not a backlog. Requirements for *game* rules live in the engine; wording lives in the builders cited below.

Every row cites a symbol or file so a later reader can re-verify. Paths are repo-relative from the workspace root.

## 1. Authority reminder

1. **Live engine behavior is first authority** for facts, stats, ranges, caps, phase order, and legality.
2. **Builders under `src/main/openRouter/` are first authority for wording.** This file describes those emissions.
3. `debug-last-strategic-prompt.txt` and `debug-last-user-prompt.txt` cross-check emitted **shape** for one consultation. They are not a contract.
4. `debug-last-tactical-prompt.txt` **is not used as a source.** Tactical catalogs below are derived from code.
5. `docs/devleopment-plan-v3.3.md` is historical architecture and is not prompt authority.

## 2. Strategic section catalog

Assembled by `buildSystemPromptForTools` in `src/main/openRouter/openRouterBuildSystemPrompt.ts`. The briefing body is produced by `formatBriefing` in `src/main/briefingFormatter.ts` and passed in as `briefingOverride`. Combat sentences come from `buildCombatRulesParagraph` in `src/main/openRouter/promptSpec/gameRuleText.ts`. Coaching bullets come from `buildCoachingBullets` → `buildStrategicCoachingBullets`. Envelope text comes from `buildFinalJsonContractInstruction` / `getFinalJsonOrdersExampleBlock`.

### 2.1 Preamble (no headings)

Emitted before `mainBlock`, in this order.

| Content | Builder | Include condition | Empty-state |
| --- | --- | --- | --- |
| `You are the enemy commander in a WEGO (simultaneous movement) hex wargame. Current turn: {turnNumber}, phase: {phase}.` | `turnPhaseHeader` | always | n/a |
| Win-condition reminder | `buildWinConditionReminderClause` (`scenarioGoals.ts`) | `coordinateContext.mode !== 'tactical'` | generic sentence when `scenarioId` is not `region_vs_region` |
| Scouting directive | `scoutingDirective` | `humanRoster.length === 0` (strategic only) | omitted |
| Tool-limit warning | `buildToolBudgetExceededWarning` | `getAndClearAiToolLimitExceededLastTurn()` **and** (`planningEnabled` or `ordersEnabled`) | omitted |
| Coordinate preamble (two paragraphs) | `buildLatLngPreamble` (`promptText.ts`) | always (strategic) | n/a |
| Combat rules paragraph | `buildCombatRulesParagraph` | always; air, naval, and hold-fire clauses independently gated | n/a |
| Naval land-target routing hint | `NAVAL_PLAN_ROUTE_LAND_TARGET_HINT` | `hasNaval && planningEnabled` | omitted |
| Assessment / estimate hints | `combatTargetHint`, `combatAssessHint` | assessment or estimation on **and** no precomputed briefing | omitted when a briefing is attached |

`buildCombatRulesParagraph` joins, in order: dice + per-type stats from `getAttack` / `getDefense` / `getRange`; `buildCasualtySortRule`; `buildResolutionOrderRule` (embark, air strikes, ranged fire, movement, cargo sync, ferry, melee); `Ranged uses pre-move positions.`; one-attack-per-unit plus `buildRangedReachRule` plus the tempo sentence; `buildMovementBudgetRule`; `buildDestinationOccupancyRule`; naval clause when `hasNavalUnits`; `buildAirEmploymentRule` when `hasAirUnits`; `buildHoldFireRule` when `ordersEnabled`.

Present stats: `infantry: 1 attack / 2 defense, melee only; armor: 3 attack / 2 defense, range 1; naval: 2 attack / 2 defense, range 2; air: 3 attack / 1 defense, range 3` (air omitted from the stats line when the roster has no air).

### 2.2 Briefing body (`formatBriefing`)

Emit order as coded. All headings quoted exactly (`promptSpec/sectionHeadings.ts`).

| Heading | Builder | Include condition | Empty-state |
| --- | --- | --- | --- |
| `# Commander's Briefing` | `formatBriefing` | always when a briefing is supplied | n/a |
| (narrative, no heading) | `buildStrategicNarrative` | always | never empty; capped at 5 sentences |
| `## Unit Status and Threats` | `formatBriefing` | always | header plus `(No AI units)` |
| (omniscient hop line) | `OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE` | fog off and res1 | omitted |
| (fog intel-staleness + path-distance lines) | `buildIntelStalenessRule` then `FOG_PATH_DISTANCE_BRIEFING_LINE` | fog on at res1 | omitted when fog is off or in battle |
| (unit status table) | `buildUnitStatusTable` | always | header plus `(No AI units)` |
| `## Attention Flags` | `formatBriefing` | always | `None.` |
| `# Operational Map` | `buildStrategicOperationalMapSectionMarkdown` | `operational.trim().length > 0` | heading plus `(No units — map not rendered.)` when neither side has units |
| `### Best Options This Turn` | `formatBestOptionsThisTurnSubsection` | at least one aggregated row | heading and table omitted |
| `## Supplemental Hex Intelligence` | `buildSupplementalHexIntelligenceBlock` | `precomputed.hexAssessments.length > 0` | omitted |
| `## Recent Turn Notes` | `buildRecentTurnNotesSection` | at least one of the previous 3 turns has a message, strategy, or loss | omitted |
| `# Production Status` | `buildProductionBriefingBlock` | `flags.productionEnabled` | omitted |
| `## Controlled Hex Queues` | same | `queues.length > 0` | `No currently controlled hexes with editable production queues.` |
| `# Your Strategic Memory` | `getInjectionText` (`memory.ts`) | `flags.memoryEnabled` | omitted |
| `## Persistent (Active Strategic Context)` | same | whenever the memory block is present | one row of `—` |
| `## Reminders Triggered This Turn` | same | whenever the memory block is present | one row of `—` |
| `# Standing Order Status` | `getInjectionText` (`standingOrdersCore.ts`) | `flags.ordersEnabled`; returns `''` in tactical | omitted |
| `## Units Without Standing Orders` | same | whenever the standing-order block is present | one row of `—` |
| `## Active Callbacks` | `buildActiveCallbacksSection` | always | one `—` row plus the empty-list sentence |

Table columns as coded:

- Unit status: `Unit ID` | `Type` | `Hex` | `Nearest enemy + distance` | `Threat severity` | `Action needed`. **No row cap.**
- Best Options: `Unit IDs` | `Action` | `Target Hexes` | `Target Units` | `Target Infrastructure`. At most 5 rows per unit before merge; identical action/hex/target rows merge.
- Controlled Hex Queues: `Hex` | `Urban Hexes` | `Airports` | `Seaports` | `Available Unit Types` | `Current Queue`. Top 10 plus any further hex with queued entries.
- Memory persistent: `Key` | `Updated Turn` | `Content`. Reminders: `Key` | `Tier` | `Recurring` | `Content`.
- Standing Order Status: `Unit ID` | `Unit Type` | `Order Type` | `Destination / Target` | `Status` | `Next Move` | `Turns Remaining` | `Attention`.
- Units Without Standing Orders: `Unit ID` | `Unit Type` | `Suggested Destination`.
- Active Callbacks: `Event` | `Details` (parameters, not just the event name).

Attention Flags is a bullet list: rank-sorted, capped at 5, armed-units bullet names at most `ATTENTION_ARMED_UNITS_LISTED` (12) ids plus overflow.

Production status interpolates `buildProductionIncomeRule` and `buildProductionCostRulesLine` (costs and prerequisites from engine tables).

### 2.3 Sections after the briefing body

| Heading | Builder | Include condition | Empty-state |
| --- | --- | --- | --- |
| `# Scenario Objective (Required)` | `buildRegionVsRegionScenarioObjectiveBlock` | `state.scenarioId === 'region_vs_region'` and not tactical | omitted |
| `Strategic context:` block | `buildContextCoaching` plus progress lines | always (strategic) | n/a |
| `# Air Operations Status` | `buildAirOperationsBriefingBlock` | opponent has at least one air unit | **section omitted** (empty string, no dash row) |
| `# Naval Transport Status` | `buildSealiftBriefingBlock` | opponent has at least one naval unit | **section omitted** |
| `# Available Tools` | `toolsSection` + `buildAvailableToolsIntro` + numbered `promptLine`s + `buildToolUsageGuidance` | always | heading plus `No tools available.` |
| `Human units (currently observed): …` | `buildHumanUnitsPromptLine` | always | empty-roster phrasing from the same helper |
| Final JSON contract | `buildFinalJsonContractInstruction` | always | n/a |
| Final JSON example | `getFinalJsonOrdersExampleBlock` | always | n/a |

`Strategic context:` contents, in order: goals (three, plus home-region goals 4–5 when `includeScenarioWinPaths`), `STRATEGY_BLOCK`, `MESSAGE_BLOCK`, `Explored:` land-hex progress, `Controlled:` land-hex progress, then `regionHomeProgressAndHexBullets` when `homePartitions` is non-null. There is **no** unconditional enemy-intent opening sentence.

Air Operations columns (strategic): `Unit ID` | `Base Hex` | `Base Intact` | `Base Controlled` | `Enemy Unit Targets` | `Strikeable Urban` | `Strikeable Airports` | `Strikeable Seaports` | `Ferry Destinations`. Naval Transport columns: `Unit ID` | `Hex` | `Your control` | `Seaport Here` | `Aboard` | `Capacity Used` | `Nearest Embark Hex`. Embark prose states coastal or land seaport without control, or a water seaport the opponent controls.

When a briefing override is present, `buildSystemPromptForTools` still computes memory, standing-order, and production injection but does not emit them in the shell; the same text is inside `formatBriefing`. Two call sites, one output. See `DUP_INJECTION`.

`### Unit Roster` exists in neither code nor dumps. It must not be reintroduced.

### 2.4 Coaching bullets (`HOW TO USE THESE TOOLS EFFECTIVELY`)

After the numbered tool lines, `buildToolUsageGuidance` emits mechanic bullets (briefing-already-contains, memory tiers, production query/set), then `buildStrategicCoachingBullets`. Membership is gated by `CoachingGates`. Tempo wording is "you choose each target" and does **not** contain `damage given up for free`.

## 3. Tactical section catalog

Derived from `formatTacticalBriefing`, `tacticalBriefingAssessments.ts`, the tactical branches of `buildSystemPromptForTools`, `gameRuleText.ts`, `coachingTextTactical.ts`, and `envelopeContract.ts`.

### 3.1 Tactical briefing body

| Heading | Builder | Include condition | Empty-state |
| --- | --- | --- | --- |
| `# Commander's Briefing` | `formatTacticalBriefing` | always when the map block is non-empty | caller treats a blank map as briefing-absent |
| (narrative) | `buildTacticalBriefingNarrative` | always | opens with beat number, own sub-unit count, human sub-unit count, full visibility |
| `## Unit Status and Threats` | `buildUnitStatusTable(..., false)` | always | `(No AI units)` |
| `## Attention Flags` | `buildAttentionFlags(..., 'tactical', false)` | always | `None.` |
| `# Operational Map` | `buildTacticalOperationalMapSectionMarkdown` | always when briefing is built | `_No tactical cells — map not rendered._` |
| `### Best Options This Turn` | same as strategic | at least one aggregated row | omitted |
| `## Recent Turn Notes` | `scope: 'tactical'` | at least one qualifying prior row | omitted |
| `## Active Callbacks` | `buildActiveCallbacksSection` | always | same empty row as strategic |

Tactical unit status uses the same six columns and has **no** standing-order column. Best Options actions in battle: `air strike`, `ranged`, `approach`, `ferry`, `move/melee`.

### 3.2 Tactical system-prompt shell

| Surface | Tactical value |
| --- | --- |
| Turn header | `Strategic turn: {turnNumber}, tactical beat: {tacticalTurnNumber}, phase: {phase}.` |
| Goal clause | `buildTacticalBattleGoalClause` |
| Coordinate preamble | `buildTacticalLatLngPreamble` |
| Combat paragraph | same composer; tactical reach, MP, first-leg truncation, resolution order **embark, air strikes, ranged fire, movement, ferry, cargo sync, melee, no production**; no hold-fire (standing orders are not issuable) |
| Coaching | `buildTacticalCoachingBullets` plus `Strategic context:` with engage-priority, doctrine, message |
| Scenario objective | omitted |
| Scouting directive | omitted |
| Envelope | no `assign_order` / `cancel_order`; no `memoryUpdates` / `productionOrders`; `airStrikes` / `ferryOrders` listed when the roster has air; Best Options may list airport ferry dests |
| Tools | planning tools when enabled; assessment, estimation, memory, orders, production stripped (`requestOrdersFlow`) |

Always omitted: `# Standing Order Status`, orderless table, Supplemental Hex Intelligence, Production Status, Strategic Memory, Scenario Objective, Unit Roster, hop-honesty line, Explored/Controlled bullets, `assess_unit` / `estimate_combat` hints.

Forbidden substrings (`TACTICAL_AI_PROMPT_STRATEGIC_SECTION_MARKERS`): `memoryupdates`, `productionorders`, `query_production`, `enemyintel`, `set_build_queue`.

## 4. Consultation-message catalog

Built in `requestOrdersFlow.ts`. The system prompt is constructed once and is never replaced mid-consultation. The tool-limit warning reaches the model on the **next** consultation's system prompt.

Loop: at most `REQUEST_ORDERS_MAX_TOOL_ROUNDS` (50) rounds (`requestOrdersToolLoop.ts`) and `REQUEST_ORDERS_MAX_WALL_CLOCK_MS` (90000) (`requestOrdersFlowSupport.ts`). The warning quotes `String(REQUEST_ORDERS_MAX_TOOL_ROUNDS)`.

| Message kind | Source | When appended | Tools on that call | States a rule? |
| --- | --- | --- | --- | --- |
| Initial user | `getInitialUserMessage` → `buildOpeningUserMessage` | once | yes (`tool_choice: 'auto'`) | no, except the tactical standing-order prohibition |
| Tool result | `encodeOpenRouterToolResultForLlm` | one per tool call | yes | no (facts and engine error strings) |
| Malformed-completion corrective | `buildMalformedCompletionCorrectiveMessage` | before the final retry (`MALFORMED_COMPLETION_RETRY_LIMIT` = 2) | yes | no (submit-shape only) |
| Parse-repair user | `buildRepairRequestMessage` | at most once | **no** | no (schema only) |

The repair call uses a copy of the message array; neither the unparseable assistant text nor the repair exchange is merged back.

### 4.1 Opening user message

`buildOpeningUserMessage` (`promptSpec/consultationText.ts`). Three parts: situation pointer, one action clause, quoted envelope field list. Branches:

| Gate | Action clause (abbreviated) |
| --- | --- |
| Planning on, briefing, tactical, options present | Copy one move or approach row and one ranged row per sub-unit; route only for unlisted dests. Appends `TACTICAL_STANDING_ORDER_PROHIBITION`. |
| Same, no options table | No options listed; use the routing tool. |
| Planning on, briefing, strategic, options present | Copy one option row per unit per action; orderless pointer when `ordersEnabled`. |
| Planning on, no briefing | Use listed tools; no options table. |
| Planning off, orders on | Issue missions as standing orders; leave movement empty. |
| Planning off, orders off, fallback on | Use the adjacent-cell listing. |
| Remainder | Point at the briefing; empty `orders` is acceptable. |

`getToolFlags` sets `fallbackMovementEnabled = !planningEnabled && !ordersEnabled`, so the last two branches are the fallback listing versus empty-orders. Production doctrine, cap rules, and option-copy mapping are **not** in the user message.

### 4.2 Tool-result encoding

Unchanged from the previous catalog: failures pass through; successes rewrite geography to briefing codes (`encodeOpenRouterToolResultForLlm`). Model-visible errors: tool disabled, invalid briefing hex code, unknown tool.

### 4.3 Retry and repair

- Corrective message: neither tool call nor text; answer with one tool call or the JSON object matching the system schema; never empty.
- Repair: compact JSON only; schema from `buildRepairSchemaText` using `ENVELOPE_FIELD_ORDER`; `productionOrders` only when production is on and mode is strategic.
- Loop exhaustion records a successful-but-empty consult and sets the next-prompt warning.

## 5. Engine information versus prompt

`prompt` column: `present` = stated; `partial` = related fact only, or only in one mode; `absent` = never stated; `absent-by-design` = known engine behavior the prompt omits on purpose.

### 5.1 Combat, movement, caps (now stated)

| Symbol | Prompt |
| --- | --- |
| `ATTACK` / `DEFENSE` / `getRange` | present |
| `RANGED_RANGE_BY_UNIT_TYPE` | present in tactical |
| `getMovementBudget` | present in strategic combat paragraph |
| `MOVEMENT_RANGE_BY_UNIT_TYPE` plus origin urban/rubble, armor-in-forest, road/rail multipliers | present in tactical combat paragraph |
| `CASUALTY_PRIORITY_ORDER` / lowest-defense-first | present (`buildCasualtySortRule`) |
| `executeReadyStrategicTurn` phase order | present (`buildResolutionOrderRule`) |
| `AIR_STRIKE_RANGE_HEXES` / `AIR_FERRY_RANGE_HEXES` | present when air is on the roster |
| `getMaxUnitsPerType` | present as the deployment-cap line |
| `UNIT_COST_BY_TYPE` / `BUILD_PREREQUISITES_BY_TYPE` | present (`buildProductionCostRulesLine`) |
| `buildProductionIncomeRule` | present in production status |
| `STALE_INTEL_TURNS` | present when fog is on (`buildIntelStalenessRule`) |
| `KEY_MAX_LENGTH` / `CONTENT_MAX_LENGTH` | present when memory updates are offered |
| `CALLBACK_EVENT_VOCAB` taught subset | present (`buildCallbackVocabularyClause`); `territory_changed` is **not** taught |
| `hold_fire` semantics | present when standing-order tools are on |
| `canEmbarkAtHex` control condition | present in naval transport prose and the sealift coaching bullet |
| `GENERIC_OBJECTIVE_SENTENCE` | present when `scenarioId` is not `region_vs_region` |

### 5.2 Still absent or partial

| Symbol | Prompt |
| --- | --- |
| `VISION_RANGE_BY_UNIT_TYPE` | absent (correctly hidden) |
| `collectTempoRuleAttacks` / `collectTacticalTempoAttacks` | **absent-by-design** (`TEMPO_SWEEP_SILENCE`) |
| Mandatory override names (`first_consultation`, `deadman`, …) | partial — coaching says the model is consulted when a subscribed event fires or the engine forces a consult; it does not list override ids |
| `territory_changed` | accepted by the parser, never fires, not taught |
| `storedPoints` on queues | absent |
| `contestedHomeRegionHexes` | absent |
| `pendingOrders` | absent (correctly hidden) |

## 6. Variant-gate catalog

Unchanged in spirit from the assembler flags: fog, `getToolFlags`, `hasAir` / `hasNaval`, empty observed roster, Best Options row count, orderless units, `scenarioId`, `gameSize`, `coordinateContext.mode`, briefing present, previous-consult tool-round exhaustion. Air and naval **sections** now omit entirely when that arm is absent (not a dash row). Envelope air tails omit when `hasAir` is false; sealift actions omit when `hasNaval` is false.

Tactical `requestOrdersFlow` always strips assessment, estimation, memory, orders, and production tools.

## 7. Coaching claim catalog

| Quoted claim (abbreviated) | Verdict | Symbol |
| --- | --- | --- |
| Dice, stats, ranges, one attack per unit, ranged uses pre-move positions | engine-true | combat constants, resolution pipeline |
| Full WEGO order including cargo sync / ferry swap | engine-true | `executeReadyStrategicTurn`, tactical beat order |
| Hits land on lowest defense then infantry, armor, naval, air | engine-true | casualty sort |
| Friendly stacks illegal; enemy cells are move/melee | engine-true | `getValidDestinations` / unoccupied approach |
| `hold_fire` suppresses automatic engagement | engine-true | `holdFireUnitIdsForPlayer` |
| Tempo: every unit with a legal shot should be given one; you choose each target | engine-true as instruction; sweep still fills omitted shots (`TEMPO_SWEEP_SILENCE`) | `collectTempoRuleAttacks` |
| `damage given up for free` | **not emitted** | matrix tests forbid the substring |
| Unconditional "enemy remains in play and is hunting you" | **not emitted** | matrix tests forbid the substring |
| Embark: coastal or land seaport, or a controlled water seaport | engine-true | `canEmbarkAtHex` |
| Production income = urban count per turn | engine-true | production rules |
| Callback vocabulary excluding `territory_changed` | engine-true for taught events; parser still accepts the unfired name | `callbackEvaluation.ts` |
| Doctrine (speed, gaps, disruption, taunt) | unverifiable | none |
| Tactical unconsulted beat: "consulted only when a subscribed event fires" | partial — mandatory overrides also force consults | `evaluateMandatoryOverrides` |

## 8. Discrepancy log

Every row still resolves the same way: **the engine wins** for mechanics. Wording rows record whether the builders already match.

| Id | Status |
| --- | --- |
| `CAPS_V3_STALE` | Resolved in `docs/combat-rules-v3.md` |
| `TACTICAL_STRUCTURE_V3` | Resolved in combat-rules §12.6 |
| `WEGO_ORDER_UNSTATED` | Resolved: combat paragraph states the engine order |
| `INFANTRY_RANGE_SPLIT` | Resolved: combat paragraph splits by mode |
| `CALLBACK_DETAILS_THIN` | Details names parameters; unfiltered `infrastructure_destroyed` describes the unfiltered watch |
| `TEMPO_SWEEP_SILENCE` | **Open by design.** The sweep exists; the prompt does not describe it. |
| `HOLD_FIRE_UNGUIDED` | Resolved: combat paragraph and coaching state the order |
| `OCCUPANCY_UNSTATED` | Resolved: `buildDestinationOccupancyRule` |
| `CASUALTY_ORDER_ABSENT` | Resolved: `buildCasualtySortRule` |
| `STRATEGIC_CONTEXT_OPENING_UNCONDITIONAL` | Resolved: sentence removed; tests forbid it |
| `TEMPO_FREE_CLAIM` | Resolved: sentence removed; tests forbid it |
| `CALLBACK_VOCAB_ABSENT` | Resolved: `buildCallbackVocabularyClause`; `territory_changed` still untaught |
| `EMBARK_CONTROL_CONDITION` | Resolved: naval block and sealift bullet |
| `OMNISCIENT_GATE_NARROW` | Resolved: hop line fog-off; path line fog-on |
| `FACE_CROSSING` | Resolved: both honesty lines |
| `DUP_INJECTION` | **Open as code hygiene.** Two call sites still compute injection text; one copy reaches the model. |
| `USER_RULE_DUPLICATION` | Resolved: opening message is submit-only (`consultationText.ts`) |
| `UNREACHABLE_USER_BRANCHES` | Softened: opening-message remainder branch is the empty-orders case; fallback listing is the `fallbackMovementEnabled` branch |
| `ENVELOPE_FIELD_ORDER_DRIFT` | Resolved: `ENVELOPE_FIELD_ORDER` is shared by header, example, and repair schema |
| `TOOL_ROUND_CAP_LITERAL` | Resolved: `REQUEST_ORDERS_MAX_TOOL_ROUNDS` |
| `AIR_NAVAL_DASH_ROWS` | Resolved: builders return `''` when that arm is absent |
| `GENERIC_GOAL_ABSENT` | Resolved: `GENERIC_OBJECTIVE_SENTENCE` |
| `CONSULT_POLICY_PARTIAL` | Partial: unconsulted-period bullets exist; mandatory override ids are not listed |
| `TACTICAL_FERRY_ENVELOPE` | Envelope lists `ferryOrders` when air is present in battle; Best Options lists intact airport dests in the footprint; strike-or-ferry exclusivity still drops ferry when a strike is listed |
