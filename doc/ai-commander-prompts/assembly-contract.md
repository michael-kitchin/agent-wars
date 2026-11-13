# Shared assembly contract

Rules that hold for both coordinate modes: how positions and units are named, the order the system prompt is assembled in, which sections appear when, how tool reads relate to envelope writes, and the response envelope itself.

Mode-specific detail lives in [`strategic-prompt.md`](strategic-prompt.md) and [`tactical-prompt.md`](tactical-prompt.md). Messages after the system prompt live in [`consultation-flow.md`](consultation-flow.md). Gate-by-gate behaviour lives in [`variants.md`](variants.md).

**The system prompt owns every rule and every heuristic.** No other message may add a rule, weaken one, or restate one in different words.

## 1. Identity and coordinates

1. **Cells are briefing hex codes.** Every cell the model reads or writes is a two-character code from the alphabet `A–Z` and `0–9`, produced by `h3ToCode` under the active `CoordinateContext`. Strategic prompts use the strategic registry for the match that is loaded: the world grid on Global, that region's footprint on Regional. Loading another map replaces that registry before the next briefing. Tactical prompts use the tactical registry for that battle's footprint. Loading another map drops those battle tables.
2. **Codes are drawn, never invented.** A code the model emits must have appeared in the operational map or in a table of the same prompt. The prompt must say so.
3. **Raw geometry is never an order value.** H3 index strings and latitude/longitude pairs must not appear in any order field. The prompt must say so in both modes.
4. **Registries do not mix.** A tactical prompt must not contain strategic codes and a strategic prompt must not contain tactical codes. Home-region hex lists use `HOME_REGION_HEX_COORD_CTX` (`mode: 'strategic'`) and therefore appear only in strategic prompts.
5. **Units are addressed by snapshot id.** Strategic ids come from `GameStateSnapshot.units[].id`. Tactical ids are `parent:slot` from `TacticalSubUnitSnapshot.id`. A prompt must never present `displayName` as an addressable handle.
6. **Enemy units are legal target values.** `targetUnitId` takes an enemy unit id at strategic level and an enemy sub-unit id in battle.
7. **Tool results obey the same rules.** Every geographic value returned to the model is rewritten to briefing codes before the model sees it (`openRouterToolResultHex.ts`). A tool result that leaks a raw tuple is a defect, not an exception the model must tolerate.

## 2. Shared system-prompt skeleton

Logical assembly order. Exact heading strings are quoted; unquoted rows are prose blocks with no heading. Mode differences are resolved in the mode files, and every row below has a value in both.

| # | Block | Nature |
| --- | --- | --- |
| 1 | `# Your Command` — role, win reminder. No clock | system message |
| 2 | `# Scenario Objective (Required)`, the home-region hex lists, and `## Sides` | system message, strategic. The objective block is `region_vs_region` only. Sides is every strategic prompt |
| 3 | `# Coordinates` | system message |
| 4 | `# Rules` and its subsections (`## Combat`, and the gated subsections through `## Rule Lookup`) | system message |
| 5 | `# Strategic Context`, or `# Battle Context` in a battle. `## Campaign` when the campaign gate is on | system message |
| 6 | `# Reading the Briefing` and the subsections whose gates hold | system message, omitted when none hold |
| 7 | `# Available Tools`, then `## How to Use These Tools Effectively` — tool lines only | system message |
| 8 | `# Orders Guidance` and its subsections | system message, omitted when there are no coaching bullets |
| 9 | `# Response Format`, then `## Example Response`. The action list is one bullet per action | system message, last |
| 10 | A fixed user message: `The current situation is in the next message.` | between the two |
| 11 | `# Current Situation` — clock, the beats left when an AI-only battle has a beat limit, and the previous-consult tool-budget warning | situation message |
| 12 | `# Commander's Briefing` and its subsections, or the standalone production, memory, and standing-order sections when no briefing is attached | situation message |
| 13 | Scenario Progress, the status sections, and Unit Roster | situation message. H2 when a briefing is attached, H1 when it is not |

Headings nest: the first is H1, and no heading is more than one level deeper than the one before it. Section builders keep the level they use when they stand alone. `formatBriefing` passes production, memory, and standing-order text through `shiftMarkdownHeadings(markdown, 1)`, so those H1 sections become H2 inside the briefing and their H2 subsections become H3. The operational map is H2 in both briefings. Scenario Progress, Air Operations Status, Missile Forces, Mercenaries, Naval Transport Status, and Unit Roster are shifted the same way when a briefing is attached, and stay H1 when it is not. `## Sides` is always H2, under the Scenario section in the system message. A line of three backticks toggles a fence, and headings inside a fence are not shifted.

Ordering rules that must not be relaxed:

- Rules precede data. The system message holds every turn-invariant sentence: the scenario rules, the rules subsections, the reading guide, the tool lines, and the orders guidance. The situation message is the clock, the briefing, and the counts that change this turn.
- The envelope contract is last in the system message, immediately followed by its example, because that is what the model must produce.
- Only one `# Commander's Briefing` block exists per prompt. When a precomputed briefing is supplied it carries the memory, standing-order, and production sections; when it is absent those sections are emitted directly and there is no briefing heading. The two paths must never both emit the same section.

## 3. Include and omit matrix

Every cell is binary. `always` means unconditional in that mode; `never` means the section must not appear in that mode; anything else is a named condition. Empty-state column states what appears when the section is present but has no content.

| Block | Strategic | Tactical | Empty-state |
| --- | --- | --- | --- |
| Role line | always | always | n/a. The clock is `# Current Situation`, not this line |
| Goal statement | always (win conditions) | always (battle-local goal) | strategic with no scenario set falls back to the generic objective in [`strategic-prompt.md`](strategic-prompt.md) 1.2; never reuse scenario wording |
| Scouting directive | always, as a bullet under `## Using the Briefing` in `# Orders Guidance`. Not in the situation message | never | n/a |
| Tool-budget warning | when the previous consultation reached the tool-round limit before it submitted orders, and planning or orders tools are enabled | when the same condition holds | omit |
| Coordinate preamble | always (strategic wording) | always (tactical wording) | n/a |
| `# Rules` | always. Subsections with no paragraph are omitted. `## Naval Units` when the seat has naval units, and on a strategic prompt also when `canBuildNaval` is true. `## Missiles` when the seat has a missile, and on a strategic prompt also when `canBuildMissile` is true. A battle keeps the ownership gate for both. `## Production` is strategic and production-on. `## Rule Lookup` is when the `rules` tool is on | always, with the battle substitutions. Naval and Missiles stay ownership-gated | n/a |
| `# Commander's Briefing` | when a briefing body is supplied | when a briefing body is supplied | omit the heading and emit the standalone sections instead |
| Narrative paragraph | always inside the briefing | always inside the briefing | never empty; own count 0 omits the scout clause and adds the still-in-match sentence ([`strategic-prompt.md`](strategic-prompt.md)) |
| `## Unit Status and Threats` | always inside the briefing | always inside the briefing | header row plus `(No AI units)` |
| `# Reading the Briefing` | when any subsection applies. Distances, the map legend, and the odds key require a precomputed briefing. Memory, air, missiles, and transport follow their own gates and print without a briefing | map legend and odds key when a briefing is attached; air and transport when the battle roster has them. No distances | omit the heading |
| `## Attention Flags` | always inside the briefing. Five unit bullets, then at most one production bullet from `findIdleProductionHexes` when production is on and a hex is idle, then at most one paused-queue pointer from `formatPausedProductionPointer`, then at most one campaign bullet from `formatCampaignAttentionBullet` when Campaign Orders has a row. The production bullet replaces `None.` when it is the only bullet and does not count against the five-bullet cap. It names at most `PRODUCTION_ATTENTION_LISTED_HEXES` (60) hexes, grouped by queue state and buildable types. Past that it counts the rest and asks for a `set_build_queue` row only for the listed hexes. The pointer and the campaign bullet do not count against the cap either. | always inside the briefing, without the production bullet or the campaign bullet | `None.` |
| `## Operational Map` | always inside the briefing. Strategic: one fenced block per connected patch of the window around own units, visible enemies, controlled cities, and listed targets. An empty window draws the loaded set. A Shown line appears when the window is smaller than that set, and when `get_map` is enabled it also says to call `get_map` for cells outside the window | always inside the briefing | `(No units — map not rendered.)` strategic; `_No tactical cells — map not rendered._` tactical |
| `### Best Options This Turn` | when at least one option row exists | when at least one option row exists | omit heading and table |
| `## Supplemental Hex Intelligence` | when at least one hex assessment exists | never | omit |
| `## Recent Turn Notes` | when at least one of the previous ten periods has a message, strategy, or loss | when the same condition holds for this battle | omit |
| `## Production Status` | when production tools are enabled. H1 when the briefing is absent. `Production Priorities` follows Paused Queues when `buildProductionPriorityLines` returns a line, and precedes Controlled Hex Queues | never | omit |
| `### Paused Queues` | in the situation message when production is on and a queue is paused for occupation or a full city. `## Paused Queues` when that section stands alone. The paragraphs are the body from `formatPausedQueuesSection` | never | omit |
| `## Controlled Hex Queues` | when production is present and at least one controlled cell has an editable queue | never | replace the table with `No currently controlled hexes with editable production queues.` |
| `## Your Strategic Memory` | when memory tools are enabled. H1 when the briefing is absent | never | omit |
| `## Campaign Objective` | when a campaign plan exists. H2 inside the briefing; H1 immediately before Standing Order Status when the briefing is absent | never | omit |
| `## Standing Order Status` | when standing-order tools are enabled. H1 when the briefing is absent | never | omit |
| `### Campaign Orders` | inside Standing Order Status when a campaign plan exists | never | omit |
| `## Units Without Standing Orders` | when the standing-order block is present | never | one row of `—` |
| `## Active Callbacks` | always inside the briefing | always inside the briefing | one row: `—` and `None.` The callbacks coaching bullet states the empty-list rule |
| `# Scenario Objective (Required)` | system message, when `scenarioId === 'region_vs_region'`. Home hex lists, the shared-hex line, and the territory sentence are in that section. `## Sides` follows them | never | omit |
| `# Strategic Context` | always. Goals, then strategy, then `Your tools are:` when a missile, naval, air, or mercenary gate holds, then doctrine, then the message. `## Campaign` follows the message guidance when the consult is strategic `region_vs_region` and standing orders are on | `# Battle Context`. No tools list and no production-denial doctrine line | n/a |
| `# Scenario Progress` | situation message, when `scenarioId === 'region_vs_region'`. H2 inside a briefing, H1 without one. Explored, controlled, home-control, and urban-share counts | never | omit |
| `# Mercenaries` | when the snapshot has an economy and production is on, or the seat has a mercenary. The envelope-rows sentence stays in the response format | never | omit. Production off keeps the upkeep-only form when the seat has a mercenary |
| `# Air Operations Status` | when the opponent has at least one air unit. Counts and the table only; the air rules and the callback sentence are `## Air Operations Table` | when the opponent has at least one air sub-unit in this battle | omit the section |
| `# Missile Forces` | when the opponent has at least one missile. The range line and the tables stay here. `Best missile targets are explored enemy hexes` is `## Missile Targets` | never | omit the section |
| `# Naval Transport Status` | when the opponent has at least one naval unit. The table only. Embark and airlift are `## Transport` | when the opponent has at least one naval sub-unit in this battle | omit the section. Air without ships does not print an empty heading |
| `# Available Tools` | always. `## How to Use These Tools Effectively` holds the tool lines only | always | `No tools available.` |
| `# Orders Guidance` | when any coaching section has a bullet. Subsections are Winning, Using the Briefing, Standing Orders, Air and Naval Units, Production Queues, Memory and Callbacks, Messages and Rounds | Using the Briefing, Air and Naval Units when the roster has them, Callbacks and Messages | omit the heading |
| Observed enemy roster line | always | always | the helper's empty-roster phrasing |
| Response envelope contract | always. The orders action list is `Actions:` and one bullet per action | always | n/a |
| Response envelope example | always | always | n/a |

Live assembler notes that match the matrix above:

- The system prompt holds every turn-invariant sentence. A count, a table, the Shown line, and the roster stay in the situation message.
- Air and naval status sections are **omitted** when the opponent has none of that arm (`buildAirOperationsBriefingBlock` / `buildSealiftBriefingBlock` return `''`). A dash table is not emitted. Air without ships does not print a Naval Transport heading; the airlift sentence is `## Transport`.
- Distance caveats are `briefingDistanceCaveatLines` in `## Distances and Intel Age`, not under the unit table. Fog off on the strategic map prints the hop-count line. Fog on prints the staleness sentence, then the path-versus-Best-Options line when that line applies. Neither line appears in a battle prompt. The odds key prints in both modes when a briefing is attached.

## 4. Tools versus envelope writes

1. **Reads may be tools. Writes are envelope-only.** Every state change the model wants travels in the response envelope. The only tool that writes is the production queue setter, and the envelope offers the same action, so the model is never forced into a tool call to act.
2. **The prompt lists only callable tools.** The numbered list in `# Available Tools` is exactly the enabled set for this consultation. A tool absent from that list must not be named anywhere in the prompt as something to call, including as a prohibition. When a strategic consultation has a precomputed briefing attached, assessment and estimate tools are not callable and their names must not appear.
3. **Battle tool set.** A battle offers the routing and distance tools, `assess_unit`, and `estimate_combat`, each following the user's tool-group toggles. `assess_hex` and the memory, standing-order, and production tool groups are stripped in battle, and a tactical prompt must not tell the model to call any of them. Battle `assess_unit` and `estimate_combat` use battle range, terrain, line-of-sight, and march rules, and `estimate_combat` also applies the target cell's cover; battle `estimate_combat` does not cover air strikes.
4. **Copy, do not re-derive.** When the options table is present, a destination listed there is already legal for the unit or units named on that row. The prompt must instruct the model to copy such a target directly into the matching envelope field and to call the routing tool only for a destination the table does not list for that unit.
5. **Action type decides the field.** An option row's action determines where its target goes: approach and move rows into the move field, ferry rows into the ferry list, air strike rows into the strike list when air is present, air drop rows into `airDrops` when air is present, ranged rows into a ranged action. The prompt must state this mapping once, in `# Available Tools`, and the envelope contract must not contradict it. When one option row lists several unit ids, that mapping is one envelope entry with `unitIds` copied from the row, not one entry per id. A unit listed on several overlapping rows still gets at most one move and one shot: pick one row per action type; do not copy overlapping rows that relist the same unit. An air unit picks only one of air strike, air drop, and ferry. When its Aboard column is none, the same orders list embarks one infantry unit, or one infantry sub-unit in a battle, from its hex. A Target Hex listed only for other units is never a legal copy for this unit; if this unit has no row, route or leave it idle. On a strategic consult with air, `plan_route`'s `orderToHexCode` for an air unit is a `ferryOrders` destination, not an `explicit_move`. That sentence is omitted in a battle and when the roster has no air.
6. **Stop condition.** Once destinations are chosen the model submits. Strategic coaching says rounds are limited, and that after the last round tools are withdrawn for one reply in which to submit orders.
7. **Empty tool set.** When no tool is enabled, `# Available Tools` still appears with `No tools available.` so the model cannot conclude that unlisted tools might work.
8. **Batch independent calls.** Both modes must tell the model to request independent calls to the same tool together in one reply as parallel tool calls, and to wait for a result only when the next call's arguments depend on it. One call per reply spends a tool round on each call and exhausts the round limit on large rosters.

Tool inventory and per-consult availability:

| Tool | Group | Strategic | Tactical |
| --- | --- | --- | --- |
| `plan_route` | planning | when planning tools are enabled | when planning tools are enabled |
| `check_distance` | planning | when planning tools are enabled | when planning tools are enabled |
| `get_map` | planning | never | when planning tools are enabled |
| `rules` | planning | when planning tools are enabled | when planning tools are enabled |
| `assess_unit` | assessment | when assessment tools are enabled and no precomputed briefing is attached | when assessment tools are enabled |
| `assess_hex` | assessment | when assessment tools are enabled and no precomputed briefing is attached | never |
| `estimate_combat` | estimation | when estimation tools are enabled and no precomputed briefing is attached | when estimation tools are enabled |
| `memory_read` | memory | when memory tools are enabled | never |
| `query_orders` | orders | when standing-order tools are enabled | never |
| `query_production` | production | when production tools are enabled | never |
| `set_build_queue` | production | when production tools are enabled | never |
| `query_mercenaries` | production | when production tools are enabled | never |
| `hire_mercenaries` | production | when production tools are enabled | never |

`assign_order`, `cancel_order`, `memory_write`, and `memory_delete` are **not** tools. They are envelope actions. The prompt must never present them as callable.

## 5. Shared response envelope

The envelope is one JSON object. Field order, optional tails, and legal actions are implemented by `promptSpec/envelopeContract.ts` and `promptContracts.ts`. If this section disagrees with those builders, the builders win. One captured strategic reply is in [`example-strategic-response.md`](example-strategic-response.md).

### 5.1 Field contract

| Field | Type | Presence | Meaning |
| --- | --- | --- | --- |
| `message` | string | required, first | One in-character line addressed to your enemies |
| `strategy` | string | required, second | One line summarising this period's plan |
| `orders` | array | required, third | Per-unit actions, processed in list order |
| `exitBattle` | boolean | present only when the battle is between two AI commanders | Required when present. True asks to leave after this beat's orders resolve. A human-versus-AI battle and every strategic consult omit the key. The repair example sets it to false. |
| `airStrikes` | array | present when the opponent has air units | Strike actions |
| `ferryOrders` | array | present when the opponent has air units | Rebase actions. In battle, dests are intact airport cells in the footprint; strike-or-ferry exclusivity still applies. |
| `airDrops` | array | present when the opponent has air units | Drop actions. Each entry uses `unitId` or `unitIds` and `destination`. An air unit picks only one of strike, drop, and ferry. |
| `missileLaunches` | array | present when the opponent has a missile and the consult is strategic | One launch per missile. Each entry uses `unitId` or `unitIds` and `targetHexCode`. A battle consult does not offer the field. |
| `callbacks` | array | always offered | Re-consultation subscriptions; the whole list is replaced each response |
| `memoryUpdates` | array | present when memory tools are enabled | Write or delete. A write requires `content` and `tier`. A strategic consult applies the rows through `executeMemory` when memory tools are enabled. A valid persistent write at capacity deletes the oldest persistent note for that seat and then stores the write. A stored write at capacity, and any invalid row, is a drop reason. A battle consult does not apply them. A list sent while the group is off is not stored. |
| `productionOrders` | array | present when production tools are enabled | Queue actions |
| `campaignTarget` | string | present on a strategic `region_vs_region` consult with standing orders on | Optional hex code of an enemy city. Omit it to keep the target. Sending the current target changes nothing. The engine keeps the target until it is taken, it stops being an enemy city, or no ground unit can reach it by land. An unknown or unreachable city is dropped. |

Envelope-wide rules the prompt must state:

1. The top level is an object. A top-level array is invalid.
2. `message`, `strategy`, and `orders` are mandatory even when `orders` is empty.
3. Optional arrays may be omitted or empty. An omitted or empty `callbacks` field clears all subscriptions.
4. Legacy top-level `movementOrders` and `rangedAttacks` are invalid.
5. Every `orders` entry carries an `action` and a `unitId` or a `unitIds` array. `unitIds` is the compact form for several actors sharing the same action and destination or target, copied from a Best Options `Unit IDs` cell. A non-empty `unitIds` list is the actor set; otherwise `unitId` is. The engine expands the list into per-unit orders. The prompt must tell the model to prefer `unitIds` whenever a row lists more than one id, because one JSON object per unit will not fit a large roster inside the completion budget.
6. An entry missing a required field for its action is dropped silently, so the model must not rely on partial entries. The engine logs a drop reason for incomplete `orders`, `airStrikes`, `ferryOrders`, `airDrops`, `missileLaunches`, `productionOrders`, and `memoryUpdates` entries, but nothing about a drop reaches the model. When one unit has more than one movement, ranged, air, ferry, embark, or missile-launch row, the last row is kept and each discarded earlier row logs a drop reason.
7. Output is compact JSON only: no prose, no commentary, no markdown fence, and no extra whitespace around the submitted object.

### 5.2 Action legality by mode

| Action | Strategic | Tactical |
| --- | --- | --- |
| `explicit_move` | legal | legal |
| `ranged_attack` | legal for units with a strategic ranged reach of at least one | legal for every type with a tactical reach, infantry included |
| `assign_order` | legal when standing-order tools are enabled | **forbidden** |
| `cancel_order` | legal when standing-order tools are enabled | **forbidden** |
| `embark`, `transport_move`, `disembark` | legal when the opponent has naval units | legal when the opponent has naval sub-units |
| `airStrikes` entries | legal when the opponent has air units | legal when the opponent has air sub-units, targeting anywhere in the footprint |
| `ferryOrders` entries | legal when the opponent has air units | legal when the opponent has air sub-units; dests are intact airport cells in the footprint |
| `airDrops` entries | legal when the opponent has air units | legal when the opponent has air sub-units; dests are footprint cells that can receive infantry |
| `missileLaunches` entries | legal when the opponent has a missile | **forbidden** |
| `memoryUpdates` entries | legal when memory tools are enabled | **forbidden** |
| `productionOrders` entries | legal when production tools are enabled | **forbidden** |

The repair schema in [`consultation-flow.md`](consultation-flow.md) must offer exactly the fields this table permits for the active mode, with the same field order as 5.1. A field forbidden here must not appear there.

## 6. Shared coaching

System-prompt content, both modes. Each item states the rule and why the model needs it; the mode files fix the wording and placement, and the strategic and tactical variants of each must not disagree.

1. **Period-start resolution.** Attacks resolve from positions held at the start of the period, before movement is applied. A unit may therefore fire and move in the same period, and firing costs it nothing. A listed ranged or move/melee row whose Odds show Kill below 50% and Loss at least 50% is a row the prompt says to skip. An em dash is not that case. Carries `WEGO_PHASE_ORDER`, `TEMPO_RANGED_SHOT`, `ATTACK_ONE_PER_UNIT`.
2. **Firing still leaves the move.** Coaching states that a unit that fires can still move, and that a ferried air unit arrives after ground movement. The full resolution order is a rules-block item: the strategic period resolves as embark, missile launches, air strikes, air drops, ranged fire, movement, ferry, cargo sync, then melee, and a tactical beat omits missile launches, adds air drops after air strikes, and puts cargo sync after ferry. Carries `WEGO_PHASE_ORDER`.
3. **One action per unit.** At most one ranged action per unit per period, and at most one air action when air is present; an air unit picks only one of strike, drop, and ferry. The air half of this sentence is omitted when the opponent has no air units. Carries `ATTACK_ONE_PER_UNIT`, `AIR_ORDER_RESTRICTIONS`.
4. **Copy the listed option.** Targets in the options table are already legal for the units named on that row, and one row may name several units. Copy a ranged row into a ranged action, a move or approach row into the move field, and an air strike, air drop, or ferry row into those tails when they are present. Copy them into one envelope entry using `unitIds` when the row lists more than one id; pick one row per unit per action; an air unit picks only one of those three air actions; never copy a Target Hex from a row that does not list that unit; route only for something unlisted. On the strategic map only, an explored enemy fortified hex with no units is the one ranged target that may be ordered without a Best Options row. A battle does not add that target. Carries `BEST_OPTIONS_ROWS`.
5. **Codes are copied exactly.** Two characters, taken from this prompt. Carries `HEX_IDENTITY`.
6. **Callbacks are a full replacement.** The response's callback list becomes the entire subscription set, so a subscription the model still wants must be repeated. Omitting the array or sending `[]` clears every subscription. An empty Active Callbacks table means there are no self-chosen triggers; under event-driven policy only engine-forced consultations remain unless the model subscribes now. Carries `CALLBACK_REPLACE_SEMANTICS`.
7. **`strategy` is for continuity.** One line naming what this period is trying to achieve, so the next consultation inherits intent rather than re-deriving it. Carries `JSON_ENVELOPE`.
8. **`message` is for the player.** One in-character taunt or threat, and nothing operational: no cells, no unit ids, no intent. Carries `MESSAGE_DISCIPLINE`.
9. **Doctrine.** Attack where you outnumber the defenders and avoid fights where you do not; strike gaps the enemy cannot reinforce quickly; keep the initiative and move toward the objective every period. Balanced adds its own block after that list: advance on the objective while home cities are safe, and trade a unit for a city when the odds favor you. On a strategic prompt, balanced also tells the commander to strike cities, airports, and seaports the ground units cannot reach, and cautious tells it to strike those from range before committing ground units. The tactical prompt does not add those lines. These are judgment aids with no engine symbol behind them and must be presented as doctrine, not as rules.

Casualty order and friendly stacking are rules-block items, not coaching items. The combat rules paragraph states both. Hits fall on the lowest-defense defender first, then infantry, armor, naval, air, and a missile is hit last. Friendly units may stack on the same cell, and a cell holding an enemy is legal as move/melee contact. Hold fire is in that same paragraph, and only when standing-order tools are on.

Two claims the builders **omit** (matrix tests forbid the substrings):

- Any assertion that an unfired legal shot is damage given up for free. Tempo copy says the model chooses each target; firing does not use the move. The engine sweep is not described (`TEMPO_SWEEP_SILENCE`).
- Any unconditional assertion that enemy units remain in play and are hunting the model's forces.

## 7. Carrier assignment for required items

Every item marked `required` in [`information-decision-model.md`](information-decision-model.md) names its carrier block here. Conditional items are carried by the same block when their gate is true. Full section-level detail is in the mode files.

| Item | Carrier block |
| --- | --- |
| `HEX_IDENTITY` | Coordinate preamble; restated in `# Available Tools` |
| `UNIT_IDENTITY`, `OWN_UNIT_TABLE`, `ACTION_NEEDED_FLAG`, `NEAREST_ENEMY_DISTANCE`, `CONTACT_FLAGS`, `THREAT_SEVERITY` | `## Unit Status and Threats` |
| `SUBUNIT_IDENTITY`, `BATTLE_FRAME` | Role line; coordinate preamble |
| `TURN_CLOCK` | `# Current Situation`, including the beats-left paragraph when an AI-only battle has a numeric limit |
| `FOG_MODE` | Narrative paragraph |
| `MAP_GRID`, `TERRAIN_CLASS`, `INFRA_PRESENCE`, `CONTROL_STATE`, `DISPLACED_FEATURES` | `## Operational Map` |
| `BEST_OPTIONS_ROWS`, `BEST_OPTIONS_ODDS`, `RANGED_LEGAL_TARGETS`, `LEGAL_DEST_OCCUPANCY` | `### Best Options This Turn` plus the options bullet in `# Available Tools`. `BEST_OPTIONS_ODDS` is the Odds column |
| `ENEMY_ROSTER_OBSERVED` | Observed enemy roster line and `## Unit Status and Threats` |
| `ATTENTION_FLAGS` | `## Attention Flags` |
| `COMBAT_STATS`, `STRATEGIC_RANGE_TABLE`, `TACTICAL_RANGE_TABLE`, `ATTACK_ONE_PER_UNIT`, `WEGO_PHASE_ORDER`, `TEMPO_RANGED_SHOT`, `CASUALTY_PRIORITY`, `ORIGIN_BONUS`, `TECH_BONUS`, `TERRAIN_COVER` | Combat and attack rules |
| `MOVE_BUDGET`, `TACTICAL_MP_RULES`, `FIRST_LEG_TRUNCATION` | Combat and attack rules, and the envelope movement clause |
| `HOLD_FIRE_SEMANTICS`, `ORDER_TYPE_LEGALITY`, `STANDING_ORDER_STATE`, `ORDERLESS_UNITS`, `SUGGESTED_DESTINATION` | `## Standing Order Status` and the standing-order guidance bullet |
| `MARCH_CURRENT_HEX_RULE` | The standing-order guidance bullet and the invalid-output clause of the response envelope |
| `AIR_STRIKE_ENVELOPE`, `FERRY_DESTINATIONS`, `AIR_ORDER_RESTRICTIONS` | `# Air Operations Status` |
| `EMBARK_STATE`, `EMBARK_HEX`, `EMBARK_LEGALITY`, `NAVAL_MOVEMENT_DOMAIN` | `# Naval Transport Status` and the combat rules paragraph |
| `PRODUCTION_*` | `## Production Status` |
| `MEMORY_*` | `## Your Strategic Memory` |
| `CALLBACK_ACTIVE_LIST` | `## Active Callbacks` |
| `CALLBACK_EVENT_VOCABULARY`, `CALLBACK_REPLACE_SEMANTICS`, `CALLBACK_TACTICAL_SCOPE` | Response envelope contract |
| `SCENARIO_ID`, `WIN_CONDITIONS`, `HOME_REGION_NAMES`, `HOME_REGION_VISIBILITY` | `# Scenario Objective (Required)` and the goal statement |
| `EXPLORED_CONTROLLED_PROGRESS`, `HOME_CONTROL_PROGRESS`, `HOME_REGION_HEXES`, `HOME_REGION_OVERLAP` | Situation message, after the scenario objective |
| `RECENT_TURN_NOTES` | `## Recent Turn Notes` |
| `TERRAIN_KIND_NOTES` | `## Supplemental Hex Intelligence` |
| `STANDING_ORDERS_INERT_IN_BATTLE` | Tactical guidance bullets |
| `TOOL_CATALOG`, `TOOL_BUDGET_WARNING` | `# Available Tools` in the system message; the warning sits in the next situation message |
| `JSON_ENVELOPE`, `MESSAGE_DISCIPLINE` | Response envelope contract and example |
| `CONSULT_POLICY` | Response envelope contract, beside the callback clause |
| `HOP_VS_PATH_CAVEAT` | Distance-basis caveat line |
| `INTEL_FRESHNESS`, `INTEL_STALENESS_WINDOW` | `## Unit Status and Threats` |
| `SUBMIT_INSTRUCTION`, `REPAIR_SCHEMA` | Not system-prompt content; see [`consultation-flow.md`](consultation-flow.md) |
