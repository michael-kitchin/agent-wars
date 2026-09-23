# Shared assembly contract

Rules that hold for both coordinate modes: how positions and units are named, the order the system prompt is assembled in, which sections appear when, how tool reads relate to envelope writes, and the response envelope itself.

Mode-specific detail lives in `strategic-prompt.md` and `tactical-prompt.md`. Messages after the system prompt live in `consultation-flow.md`. Gate-by-gate behaviour lives in `variants.md`.

**The system prompt owns every rule and every heuristic.** No other message may add a rule, weaken one, or restate one in different words.

## 1. Identity and coordinates

1. **Cells are briefing hex codes.** Every cell the model reads or writes is a two-character code from the alphabet `A–Z` and `0–9`, produced by `h3ToCode` under the active `CoordinateContext`. Strategic prompts use the res1 registry; tactical prompts use the res4 registry for the battle footprint.
2. **Codes are drawn, never invented.** A code the model emits must have appeared in the operational map or in a table of the same prompt. The prompt must say so.
3. **Raw geometry is never an order value.** H3 index strings and latitude/longitude pairs must not appear in any order field. The prompt must say so in both modes.
4. **Registries do not mix.** A tactical prompt must not contain res1 codes and a strategic prompt must not contain res4 codes. Home-region hex lists are res1 by definition (`HOME_REGION_HEX_COORD_CTX`) and therefore appear only in strategic prompts.
5. **Units are addressed by snapshot id.** Strategic ids come from `GameStateSnapshot.units[].id`. Tactical ids are `parent:slot` from `TacticalSubUnitSnapshot.id`. A prompt must never present `displayName` as an addressable handle.
6. **Enemy units are legal target values.** `targetUnitId` takes an enemy unit id at strategic level and an enemy sub-unit id in battle.
7. **Tool results obey the same rules.** Every geographic value returned to the model is rewritten to briefing codes before the model sees it (`openRouterToolResultHex.ts`). A tool result that leaks a raw tuple is a defect, not an exception the model must tolerate.

## 2. Shared system-prompt skeleton

Logical assembly order. Exact heading strings are quoted; unquoted rows are prose blocks with no heading. Mode differences are resolved in the mode files, and every row below has a value in both.

| # | Block | Nature |
| --- | --- | --- |
| 1 | Role and clock line | prose, one line |
| 2 | Goal statement | prose |
| 3 | Situational directives (scouting, previous-consult tool-budget warning) | prose, gated |
| 4 | Coordinate preamble | prose, two paragraphs |
| 5 | Combat and attack rules | prose |
| 6 | `# Commander's Briefing` and its subsections | briefing body |
| 7 | `# Scenario Objective (Required)` | gated section |
| 8 | `Strategic context:` coaching block | prose bullets |
| 9 | `# Air Operations Status` | gated section |
| 10 | `# Naval Transport Status` | gated section |
| 11 | `# Available Tools` | section with numbered tool lines and guidance bullets |
| 12 | Observed enemy roster line | prose, one line |
| 13 | Response envelope contract | prose |
| 14 | Response envelope example | compact JSON, no fence |

Ordering rules that must not be relaxed:

- Rules precede data. Blocks 2 and 5 come before the briefing so the model reads the constraints before the tables it will act on.
- Data precedes instructions to act. The briefing and the gated status sections come before `# Available Tools` and the envelope contract.
- The envelope contract is last, immediately followed by its example, because that is what the model must produce.
- Only one `# Commander's Briefing` block exists per prompt. When a precomputed briefing is supplied it carries the memory, standing-order, and production sections; when it is absent those sections are emitted directly and there is no briefing heading. The two paths must never both emit the same section.

## 3. Include and omit matrix

Every cell is binary. `always` means unconditional in that mode; `never` means the section must not appear in that mode; anything else is a named condition. Empty-state column states what appears when the section is present but has no content.

| Block | Strategic | Tactical | Empty-state |
| --- | --- | --- | --- |
| Role and clock line | always | always | n/a |
| Goal statement | always (win conditions) | always (battle-local goal) | strategic with no scenario set falls back to the generic objective in `strategic-prompt.md` 1.2; never reuse scenario wording |
| Scouting directive | when no enemy unit is observed | never | omit |
| Tool-budget warning | when the previous consultation exhausted its tool budget and planning or orders tools are enabled | when the same condition holds | omit |
| Coordinate preamble | always (res1 wording) | always (res4 wording) | n/a |
| Combat and attack rules | always | always | n/a |
| `# Commander's Briefing` | when a briefing body is supplied | when a briefing body is supplied | omit the heading and emit the standalone sections instead |
| Narrative paragraph | always inside the briefing | always inside the briefing | never empty |
| `## Unit Status and Threats` | always inside the briefing | always inside the briefing | header row plus `(No AI units)` |
| Distance-basis caveat line | fog-off res1: hop-count honesty line; fog-on res1: path-vs-Best-Options line (after the staleness sentence) | never | omit |
| `## Attention Flags` | always inside the briefing | always inside the briefing | `None.` |
| `# Operational Map` | always inside the briefing | always inside the briefing | `(No units — map not rendered.)` strategic; `_No tactical cells — map not rendered._` tactical |
| `### Best Options This Turn` | when at least one option row exists | when at least one option row exists | omit heading and table |
| `## Supplemental Hex Intelligence` | when at least one hex assessment exists | never | omit |
| `## Recent Turn Notes` | when at least one of the previous three periods has a message, strategy, or loss | when the same condition holds for this battle | omit |
| `# Production Status` | when production tools are enabled | never | omit |
| `## Controlled Hex Queues` | when production is present and at least one controlled cell has an editable queue | never | replace the table with `No currently controlled hexes with editable production queues.` |
| `# Your Strategic Memory` | when memory tools are enabled | never | omit |
| `# Standing Order Status` | when standing-order tools are enabled | never | omit |
| `## Units Without Standing Orders` | when the standing-order block is present | never | one row of `—` |
| `## Active Callbacks` | always inside the briefing | always inside the briefing | one row: `—` and the empty-list sentence that omitting callbacks or sending `[]` leaves no self-chosen triggers, so under event-driven policy only engine-forced consultations remain unless the model subscribes now |
| `# Scenario Objective (Required)` | when `scenarioId === 'region_vs_region'` | never | omit |
| `Strategic context:` block | always | always (tactical variant) | n/a |
| `# Air Operations Status` | when the opponent has at least one air unit | when the opponent has at least one air sub-unit in this battle | omit the section |
| `# Naval Transport Status` | when the opponent has at least one naval unit | when the opponent has at least one naval sub-unit in this battle | omit the section |
| `# Available Tools` | always | always | `No tools available.` |
| Observed enemy roster line | always | always | the helper's empty-roster phrasing |
| Response envelope contract | always | always | n/a |
| Response envelope example | always | always | n/a |

Live assembler notes that match the matrix above:

- Air and naval status sections are **omitted** when the opponent has none of that arm (`buildAirOperationsBriefingBlock` / `buildSealiftBriefingBlock` return `''`). A dash table is not emitted.
- The distance-basis caveat follows **what the numbers mean**, not the fog flag alone. Fog-off at res1 prints hop counts, so the hop-versus-path line is emitted. Fog-on at res1 prints march or sail path lengths (falling back to hops when no path exists), so the path-versus-Best-Options line is emitted. Neither line appears in a battle prompt.

## 4. Tools versus envelope writes

1. **Reads may be tools. Writes are envelope-only.** Every state change the model wants travels in the response envelope. The only tool that writes is the production queue setter, and the envelope offers the same action, so the model is never forced into a tool call to act.
2. **The prompt lists only callable tools.** The numbered list in `# Available Tools` is exactly the enabled set for this consultation. A tool absent from that list must not be named anywhere in the prompt as something to call, including as a prohibition. When a precomputed briefing is attached, assessment and estimate tools are not callable and their names must not appear.
3. **Never in tactical.** The assessment tools and the combat-estimate tool are stripped in battle, along with the memory, standing-order, and production tool groups. A tactical prompt must not tell the model to call any of them.
4. **Copy, do not re-derive.** When the options table is present, a destination listed there is already legal for the unit or units named on that row. The prompt must instruct the model to copy such a target directly into the matching envelope field and to call the routing tool only for a destination the table does not list for that unit.
5. **Action type decides the field.** An option row's action determines where its target goes: approach and move rows into the move field, ferry rows into the ferry list, air strike rows into the strike list when air is present, ranged rows into a ranged action. The prompt must state this mapping once, in `# Available Tools`, and the envelope contract must not contradict it. When one option row lists several unit ids, that mapping is one envelope entry with `unitIds` copied from the row, not one entry per id. A unit listed on several overlapping rows still gets at most one move and one shot: pick one row per action type; do not copy overlapping rows that relist the same unit. A Target Hex listed only for other units is never a legal copy for this unit; if this unit has no row, route or leave it idle.
6. **Stop condition.** Once destinations are chosen the model submits. The prompt must say that re-assessing or re-routing after a destination is chosen is wasted budget, because the round limit is finite and exhausting it produces no orders at all.
7. **Empty tool set.** When no tool is enabled, `# Available Tools` still appears with `No tools available.` so the model cannot conclude that unlisted tools might work.

Tool inventory and per-consult availability:

| Tool | Group | Strategic | Tactical |
| --- | --- | --- | --- |
| `plan_route` | planning | when planning tools are enabled | when planning tools are enabled |
| `check_distance` | planning | when planning tools are enabled | when planning tools are enabled |
| `assess_unit` | assessment | when assessment tools are enabled and no precomputed briefing is attached | never |
| `assess_hex` | assessment | when assessment tools are enabled and no precomputed briefing is attached | never |
| `estimate_combat` | estimation | when estimation tools are enabled and no precomputed briefing is attached | never |
| `memory_read` | memory | when memory tools are enabled | never |
| `query_orders` | orders | when standing-order tools are enabled | never |
| `query_production` | production | when production tools are enabled | never |
| `set_build_queue` | production | when production tools are enabled | never |

`assign_order`, `cancel_order`, `memory_write`, and `memory_delete` are **not** tools. They are envelope actions. The prompt must never present them as callable.

## 5. Shared response envelope

The envelope is one JSON object. Field order, optional tails, and legal actions are implemented by `promptSpec/envelopeContract.ts` and `promptContracts.ts`. If this section disagrees with those builders, the builders win.

### 5.1 Field contract

| Field | Type | Presence | Meaning |
| --- | --- | --- | --- |
| `message` | string | required, first | One in-character line addressed to the human player |
| `strategy` | string | required, second | One line summarising this period's plan |
| `orders` | array | required, third | Per-unit actions, processed in list order |
| `airStrikes` | array | present when the opponent has air units | Strike actions |
| `ferryOrders` | array | present when the opponent has air units | Rebase actions. In battle, dests are intact airport cells in the footprint; strike-or-ferry exclusivity still applies. |
| `callbacks` | array | always offered | Re-consultation subscriptions; the whole list is replaced each response |
| `memoryUpdates` | array | present when memory tools are enabled | Memory writes and deletes |
| `productionOrders` | array | present when production tools are enabled | Queue actions |

Envelope-wide rules the prompt must state:

1. The top level is an object. A top-level array is invalid.
2. `message`, `strategy`, and `orders` are mandatory even when `orders` is empty.
3. Optional arrays may be omitted or empty. An omitted or empty `callbacks` field clears all subscriptions.
4. Legacy top-level `movementOrders` and `rangedAttacks` are invalid.
5. Every `orders` entry carries an `action`; all but the order-cancelling action also carry a `unitId` or a `unitIds` array. `unitIds` is the compact form for several actors sharing the same action and destination or target, copied from a Best Options `Unit IDs` cell. A non-empty `unitIds` list is the actor set; otherwise `unitId` is. The engine expands the list into per-unit orders. The prompt must tell the model to prefer `unitIds` whenever a row lists more than one id, because one JSON object per unit will not fit a large roster inside the completion budget.
6. An entry missing a required field for its action is dropped silently, so the model must not rely on partial entries.
7. Output is compact JSON only: no prose, no commentary, no markdown fence, and no extra whitespace around the submitted object.

### 5.2 Action legality by mode

| Action | Strategic | Tactical |
| --- | --- | --- |
| `explicit_move` | legal | legal |
| `ranged_attack` | legal for units with a strategic ranged reach of at least one | legal for every type with a res4 reach, infantry included |
| `assign_order` | legal when standing-order tools are enabled | **forbidden** |
| `cancel_order` | legal when standing-order tools are enabled | **forbidden** |
| `embark`, `transport_move`, `disembark` | legal when the opponent has naval units | legal when the opponent has naval sub-units |
| `airStrikes` entries | legal when the opponent has air units | legal when the opponent has air sub-units, targeting anywhere in the footprint |
| `ferryOrders` entries | legal when the opponent has air units | legal when the opponent has air sub-units; dests are intact airport cells in the footprint |
| `memoryUpdates` entries | legal when memory tools are enabled | **forbidden** |
| `productionOrders` entries | legal when production tools are enabled | **forbidden** |

The repair schema in `consultation-flow.md` must offer exactly the fields this table permits for the active mode, with the same field order as 5.1. A field forbidden here must not appear there.

## 6. Shared coaching

System-prompt content, both modes. Each item states the rule and why the model needs it; the mode files fix the wording and placement, and the strategic and tactical variants of each must not disagree.

1. **Period-start resolution.** Attacks resolve from positions held at the start of the period, before movement is applied. A unit may therefore fire and move in the same period, and firing costs it nothing. Carries `WEGO_PHASE_ORDER`, `TEMPO_RANGED_SHOT`, `ATTACK_ONE_PER_UNIT`.
2. **Resolution order.** The strategic period resolves as embark, air strikes, ranged fire, movement, cargo sync, ferry, then melee. A tactical beat resolves the same list with cargo sync after ferry. The model needs this to understand that a unit it moves into contact will fight in melee this same period, that embarked cargo stays with the transport until sync, and that a ferried air unit arrives after ground movement. Carries `WEGO_PHASE_ORDER`.
3. **One action per unit.** At most one ranged action per unit per period, and at most one air action when air is present; an air unit that strikes cannot also rebase. The air half of this sentence is omitted when the opponent has no air units. Carries `ATTACK_ONE_PER_UNIT`, `AIR_ORDER_RESTRICTIONS`.
4. **Target selection.** Hits fall on the lowest-defense defender first, then in the fixed type order. Firing into a stack therefore removes its weakest unit, which is what makes stacked targets attractive. Carries `CASUALTY_PRIORITY`.
5. **Friendly stacking is legal; enemy-occupied cells are move/melee contact.** Friendly units may stack on the same cell. A cell holding an enemy is legal as a move/melee option — copy that Target Hex into the move field to make contact. Approach Target Hexes omit stay-put friendlies; a cell a friendly is leaving this period is a legal dest. Carries `LEGAL_DEST_OCCUPANCY`.
6. **Copy the listed option.** Targets in the options table are already legal for the units named on that row, and one row may name several units. Copy a ranged row into a ranged action, a move or approach row into the move field, and an air or ferry row into those tails when they are present. Copy them into one envelope entry using `unitIds` when the row lists more than one id; pick one row per unit per action; never copy a Target Hex from a row that does not list that unit; route only for something unlisted. Carries `BEST_OPTIONS_ROWS`.
7. **Codes are copied exactly.** Two characters, taken from this prompt. Carries `HEX_IDENTITY`.
8. **Callbacks are a full replacement.** The response's callback list becomes the entire subscription set, so a subscription the model still wants must be repeated. Omitting the array or sending `[]` clears every subscription. An empty Active Callbacks table means there are no self-chosen triggers; under event-driven policy only engine-forced consultations remain unless the model subscribes now. Carries `CALLBACK_REPLACE_SEMANTICS`.
9. **`strategy` is for continuity.** One line naming what this period is trying to achieve, so the next consultation inherits intent rather than re-deriving it. Carries `JSON_ENVELOPE`.
10. **`message` is for the player.** One in-character taunt or threat, and nothing operational: no cells, no unit ids, no intent. Carries `MESSAGE_DISCIPLINE`.
11. **Doctrine.** Use speed, surprise, and initiative to break enemy cohesion; attack gaps and avoid strengths; create maximum disruption with minimum force. These are judgment aids with no engine symbol behind them and must be presented as doctrine, not as rules.

Two claims the builders **omit** (matrix tests forbid the substrings):

- Any assertion that an unfired legal shot is damage given up for free. Tempo copy says the model chooses each target; firing does not consume the move. The engine sweep is not described (`TEMPO_SWEEP_SILENCE`).
- Any unconditional assertion that enemy units remain in play and are hunting the model's forces.

## 7. Carrier assignment for required items

Every item marked `required` in `information-decision-model.md` names its carrier block here. Conditional items are carried by the same block when their gate is true. Full section-level detail is in the mode files.

| Item | Carrier block |
| --- | --- |
| `HEX_IDENTITY` | Coordinate preamble; restated in `# Available Tools` |
| `UNIT_IDENTITY`, `OWN_UNIT_TABLE`, `ACTION_NEEDED_FLAG`, `NEAREST_ENEMY_DISTANCE`, `CONTACT_FLAGS`, `THREAT_SEVERITY` | `## Unit Status and Threats` |
| `SUBUNIT_IDENTITY`, `BATTLE_FRAME` | Role and clock line; coordinate preamble |
| `TURN_CLOCK` | Role and clock line |
| `FOG_MODE` | Narrative paragraph |
| `MAP_GRID`, `TERRAIN_CLASS`, `INFRA_PRESENCE`, `CONTROL_STATE`, `DISPLACED_FEATURES` | `# Operational Map` |
| `BEST_OPTIONS_ROWS`, `RANGED_LEGAL_TARGETS`, `LEGAL_DEST_OCCUPANCY` | `### Best Options This Turn` plus the options bullet in `# Available Tools` |
| `ENEMY_ROSTER_OBSERVED` | Observed enemy roster line and `## Unit Status and Threats` |
| `ATTENTION_FLAGS` | `## Attention Flags` |
| `COMBAT_STATS`, `STRATEGIC_RANGE_TABLE`, `TACTICAL_RANGE_TABLE`, `ATTACK_ONE_PER_UNIT`, `WEGO_PHASE_ORDER`, `TEMPO_RANGED_SHOT`, `CASUALTY_PRIORITY` | Combat and attack rules |
| `MOVE_BUDGET`, `TACTICAL_MP_RULES`, `FIRST_LEG_TRUNCATION` | Combat and attack rules, and the envelope movement clause |
| `HOLD_FIRE_SEMANTICS`, `ORDER_TYPE_LEGALITY`, `MARCH_CURRENT_HEX_RULE`, `STANDING_ORDER_STATE`, `ORDERLESS_UNITS`, `SUGGESTED_DESTINATION` | `# Standing Order Status` and the standing-order guidance bullet |
| `AIR_STRIKE_ENVELOPE`, `FERRY_DESTINATIONS`, `AIR_ORDER_RESTRICTIONS` | `# Air Operations Status` |
| `EMBARK_STATE`, `EMBARK_HEX`, `EMBARK_LEGALITY`, `NAVAL_MOVEMENT_DOMAIN` | `# Naval Transport Status` and the combat rules paragraph |
| `PRODUCTION_*` | `# Production Status` |
| `MEMORY_*` | `# Your Strategic Memory` |
| `CALLBACK_ACTIVE_LIST` | `## Active Callbacks` |
| `CALLBACK_EVENT_VOCABULARY`, `CALLBACK_REPLACE_SEMANTICS`, `CALLBACK_TACTICAL_SCOPE` | Response envelope contract |
| `SCENARIO_ID`, `WIN_CONDITIONS`, `HOME_REGION_*`, `HOME_CONTROL_PROGRESS` | `# Scenario Objective (Required)` and the `Strategic context:` block |
| `EXPLORED_CONTROLLED_PROGRESS` | `Strategic context:` block |
| `RECENT_TURN_NOTES` | `## Recent Turn Notes` |
| `TERRAIN_KIND_NOTES` | `## Supplemental Hex Intelligence` |
| `STANDING_ORDERS_INERT_IN_BATTLE` | Tactical guidance bullets |
| `TOOL_CATALOG`, `TOOL_BUDGET_WARNING` | `# Available Tools`; the warning sits in the situational directives |
| `JSON_ENVELOPE`, `MESSAGE_DISCIPLINE` | Response envelope contract and example |
| `CONSULT_POLICY` | Response envelope contract, beside the callback clause |
| `HOP_VS_PATH_CAVEAT` | Distance-basis caveat line |
| `INTEL_FRESHNESS`, `INTEL_STALENESS_WINDOW` | `## Unit Status and Threats` |
| `SUBMIT_INSTRUCTION`, `REPAIR_SCHEMA` | Not system-prompt content; see `consultation-flow.md` |
