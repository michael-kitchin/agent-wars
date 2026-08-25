# Crosswalk

Traceability between the inventory, the information model, and the contracts. Use it to answer three questions: where is this fact specified, where did this existing prompt section go, and what does today's prompt still lack.

## 1. Information items to their contract

Every item defined in `information-decision-model.md` section 3, with the file and section that specifies how it is carried. "Both" means the item has a contract in each mode file and the two must not disagree.

| Item | Primary file | Section |
| --- | --- | --- |
| `HEX_IDENTITY` | `assembly-contract.md` | Identity and coordinates |
| `UNIT_IDENTITY` | `assembly-contract.md` | Identity and coordinates |
| `SUBUNIT_IDENTITY` | `tactical-prompt.md` | Battle framing |
| `TURN_CLOCK` | both mode files | Role and clock line |
| `BATTLE_FRAME` | `tactical-prompt.md` | Battle framing |
| `FOG_MODE` | `variants.md` | Fog of war |
| `MAP_GRID` | both mode files | Operational map |
| `TERRAIN_CLASS` | both mode files | Operational map |
| `TERRAIN_KIND_NOTES` | `strategic-prompt.md` | Supplemental hex intelligence |
| `INFRA_PRESENCE` | `strategic-prompt.md` | Operational map |
| `CONTROL_STATE` | `strategic-prompt.md` | Operational map |
| `DISPLACED_FEATURES` | both mode files | Operational map |
| `EXPLORED_CONTROLLED_PROGRESS` | `strategic-prompt.md` | Strategic context block |
| `ENEMY_ROSTER_OBSERVED` | both mode files | Observed enemy roster line |
| `NEAREST_ENEMY_DISTANCE` | both mode files | Unit status table |
| `CONTACT_FLAGS` | both mode files | Unit status table |
| `THREAT_SEVERITY` | both mode files | Unit status table |
| `INTEL_FRESHNESS` | `variants.md` | Fog on, strategic |
| `INTEL_STALENESS_WINDOW` | `variants.md` | Fog on, strategic |
| `HOP_VS_PATH_CAVEAT` | `variants.md` | Fog off, strategic |
| `OWN_UNIT_TABLE` | both mode files | Unit status table |
| `ACTION_NEEDED_FLAG` | `strategic-prompt.md` | Table column contracts |
| `ATTENTION_FLAGS` | both mode files | Attention flags |
| `STANDING_ORDER_STATE` | `strategic-prompt.md` | Standing order status |
| `ORDERLESS_UNITS` | `strategic-prompt.md` | Units without standing orders |
| `SUGGESTED_DESTINATION` | `strategic-prompt.md` | Table column contracts; weak-model join rules |
| `EMBARK_STATE` | both mode files | Naval transport status |
| `STANDING_ORDERS_INERT_IN_BATTLE` | `tactical-prompt.md` | Battle framing; required coaching |
| `BEST_OPTIONS_ROWS` | both mode files | Best options subsection |
| `LEGAL_DEST_OCCUPANCY` | `assembly-contract.md` | Shared coaching |
| `RANGED_LEGAL_TARGETS` | both mode files | Best options subsection |
| `AIR_STRIKE_ENVELOPE` | both mode files | Air operations status |
| `FERRY_DESTINATIONS` | `strategic-prompt.md` | Air operations status |
| `EMBARK_HEX` | `strategic-prompt.md` | Naval transport status |
| `COMBAT_STATS` | both mode files | Combat and attack rules |
| `STRATEGIC_RANGE_TABLE` | `strategic-prompt.md` | Combat and attack rules |
| `TACTICAL_RANGE_TABLE` | `tactical-prompt.md` | Combat and attack rules |
| `ATTACK_ONE_PER_UNIT` | `assembly-contract.md` | Shared coaching |
| `WEGO_PHASE_ORDER` | `assembly-contract.md` | Shared coaching |
| `TEMPO_RANGED_SHOT` | `assembly-contract.md` | Shared coaching |
| `CASUALTY_PRIORITY` | `assembly-contract.md` | Shared coaching |
| `HOLD_FIRE_SEMANTICS` | `strategic-prompt.md` | Required coaching item 4 |
| `MOVE_BUDGET` | `strategic-prompt.md` | Combat and attack rules |
| `TACTICAL_MP_RULES` | `tactical-prompt.md` | Battle framing; combat rules |
| `FIRST_LEG_TRUNCATION` | `tactical-prompt.md` | Combat rules; required coaching |
| `NAVAL_MOVEMENT_DOMAIN` | `strategic-prompt.md` | Combat rules; required coaching |
| `ORDER_TYPE_LEGALITY` | `strategic-prompt.md` | Legal actions table |
| `MARCH_CURRENT_HEX_RULE` | `strategic-prompt.md` | Legal actions table; coaching item 8 |
| `AIR_ORDER_RESTRICTIONS` | both mode files | Air operations status; legal actions |
| `EMBARK_LEGALITY` | both mode files | Naval transport status |
| `PRODUCTION_QUEUES` | `strategic-prompt.md` | Production status |
| `PRODUCTION_RULES_COSTS` | `strategic-prompt.md` | Production status |
| `PRODUCTION_CAPS` | `variants.md` | Game size and large rosters |
| `PRODUCTION_CAP_QUEUE_RULE` | `strategic-prompt.md` | Production status; coaching item 14 |
| `PRODUCTION_INCOME` | `strategic-prompt.md` | Production status |
| `PRODUCTION_TIMING` | `strategic-prompt.md` | Production status |
| `MEMORY_PERSISTENT` | `strategic-prompt.md` | Strategic memory |
| `MEMORY_TRIGGERED` | `strategic-prompt.md` | Strategic memory |
| `MEMORY_LIMITS` | `strategic-prompt.md` | Strategic memory |
| `MEMORY_WRITE_PATH` | `strategic-prompt.md` | Strategic memory; legal actions |
| `MEMORY_WRITE_LIMITS` | `strategic-prompt.md` | Legal actions table |
| `CALLBACK_ACTIVE_LIST` | both mode files | Active callbacks |
| `CALLBACK_EVENT_VOCABULARY` | `assembly-contract.md` | Response envelope |
| `CALLBACK_REPLACE_SEMANTICS` | `assembly-contract.md` | Shared coaching |
| `CALLBACK_TACTICAL_SCOPE` | `tactical-prompt.md` | Active callbacks; required coaching |
| `RECENT_TURN_NOTES` | both mode files | Recent turn notes |
| `CONSULT_POLICY` | `variants.md` | Consultation policy |
| `SCENARIO_ID` | `variants.md` | Scenarios |
| `WIN_CONDITIONS` | `strategic-prompt.md` | Goal statement; scenario objective |
| `HOME_REGION_NAMES` | `strategic-prompt.md` | Scenario objective |
| `HOME_REGION_HEXES` | `strategic-prompt.md` | Strategic context block |
| `HOME_REGION_OVERLAP` | `variants.md` | Scenarios; combinations |
| `HOME_CONTROL_PROGRESS` | `strategic-prompt.md` | Strategic context block |
| `HOME_REGION_VISIBILITY` | `strategic-prompt.md` | Scenario objective |
| `TOOL_CATALOG` | `assembly-contract.md` | Tools versus envelope writes |
| `TOOL_BUDGET_WARNING` | `variants.md` | Consultation policy |
| `JSON_ENVELOPE` | `assembly-contract.md` | Shared response envelope |
| `SUBMIT_INSTRUCTION` | `consultation-flow.md` | Opening user message |
| `MESSAGE_DISCIPLINE` | `assembly-contract.md` | Shared coaching |
| `REPAIR_SCHEMA` | `consultation-flow.md` | Repair schema contract |

No item is unmatched.

## 2. Existing strategic sections to their contract

Every heading the strategic prompt emits today, from `source-inventory.md` section 2.

| Existing heading or block | Disposition |
| --- | --- |
| Role and clock line | Kept — `strategic-prompt.md` 1.1 |
| Win-condition reminder | Kept — 1.2, with an added generic form for a missing scenario |
| Scouting directive | Kept — 1.3 |
| Tool-limit warning | Kept — 1.3 |
| Coordinate preamble | Kept — 1.4 |
| Combat stats paragraph | Kept and extended — 1.5 adds casualty priority, resolution order, movement budgets, and occupancy |
| `# Commander's Briefing` | Kept — 1.6 |
| Narrative paragraph | Kept — 1.6 |
| `## Unit Status and Threats` | Kept — 1.6, uncapped |
| Omniscient hop line | Kept, re-gated on the meaning of the distances — 1.6 and `variants.md` 1.2 |
| `## Attention Flags` | Kept with an explicit overflow contract — 1.6 |
| `# Operational Map` | Kept — 1.6 |
| `### Best Options This Turn` | Kept — 1.6, with a contracted absent case |
| `## Supplemental Hex Intelligence` | Kept — 1.6 |
| `## Recent Turn Notes` | Kept — 1.6 |
| `# Production Status` | Kept and extended — 1.6 adds the income rule |
| `## Controlled Hex Queues` | Kept — 1.6 and 2 |
| `# Your Strategic Memory` | Kept and extended — 1.6 adds write limits |
| `## Persistent (Active Strategic Context)` | Kept — 1.6 |
| `## Reminders Triggered This Turn` | Kept — 1.6 |
| `# Standing Order Status` | Kept — 1.6 |
| `## Units Without Standing Orders` | Kept — 1.6 |
| `## Active Callbacks` | Kept, with a detail-cell contract — 1.6 |
| `# Scenario Objective (Required)` | Kept — 1.7 |
| `Strategic context:` goals bullets | Kept — 1.8 |
| `Strategic context:` strategy bullets | Kept as doctrine — 1.8 |
| `Strategic context:` message bullet | Kept — 1.8 |
| `Strategic context:` opening sentence about the enemy hunting the model | **Dropped** — unverifiable and self-contradictory when the observed roster is empty; `source-inventory.md` records it as `STRATEGIC_CONTEXT_OPENING_UNCONDITIONAL` |
| `Explored:` and `Controlled:` bullets | Kept — 1.8 |
| Home-region bullets | Kept — 1.8 |
| `# Air Operations Status` | Kept, gated on roster instead of emitting a dash row — 1.9 and `variants.md` 3.1 |
| `# Naval Transport Status` | Kept, same gating change — 1.10 and `variants.md` 3.2 |
| `# Available Tools` | Kept — 1.11 |
| Tool guidance bullets | Kept, minus the free-damage claim — 1.11 and 4 |
| Observed enemy roster line | Kept — 1.12 |
| Final JSON contract | Kept — 3 |
| Final JSON example | Kept — 3 |
| Own-unit listing (briefing-absent path) | Kept — `variants.md` combinations |
| Adjacent-cells fallback block | Kept — `variants.md` 2.4 |
| Assessment and estimate coaching hints | Kept, gated to the no-briefing configuration only — 1.5 |
| Free-damage claim in the tempo bullet | **Dropped** — false for a unit under a fire-withholding order; replaced by coaching items 3 and 4 |
| `### Unit Roster` | Absent from code and dump; explicitly forbidden — 1.6 |

## 3. Existing tactical sections to their contract

From `source-inventory.md` section 3, derived from code only.

| Existing heading or block | Disposition |
| --- | --- |
| Role and clock line with the beat number | Kept — `tactical-prompt.md` 2.1 |
| Battle goal clause | Kept — 2.2 |
| Tactical coordinate preamble | Kept — 2.4 |
| Combat paragraph with res4 ranges | Kept and extended — 2.5 adds casualty priority and the resolution order |
| Infantry res4 clause | Kept — 1.7 and 2.5 |
| Air strike-anywhere clause | Kept — 1.8 and 2.9 |
| `# Commander's Briefing` | Kept — 2.6 |
| Tactical narrative | Kept — 2.6 |
| `## Unit Status and Threats` | Kept without a standing-order column — 2.6 |
| `## Attention Flags` | Kept without standing-order bullets — 2.6 |
| `# Operational Map` with the tactical legend | Kept — 2.6 |
| `### Best Options This Turn` | Kept, no ferry rows — 2.6 |
| `## Recent Turn Notes` | Kept, battle-scoped — 2.6 |
| `## Active Callbacks` | Kept with sub-unit ids — 2.6 |
| `Strategic context:` tactical variant | Kept — 2.8 |
| `# Air Operations Status`, tactical form | Kept, roster-gated — 2.9 |
| `# Naval Transport Status`, tactical form | Kept, roster-gated — 2.10 |
| `# Available Tools`, tactical form | Kept — 2.11 |
| Tactical tool guidance bullets | Kept — 2.11 |
| Tactical orders clause | Kept — 3.2 |
| Movement truncation clause | Kept — 2.5 and coaching item 4 |
| Tactical callbacks clause | Kept — 4 item 10 |
| Forbidden strategic markers | Kept as a must-not-appear list — 2.7 |
| Free-damage claim in the beat tempo bullet | **Dropped** — same reason as strategic |
| Everything in the always-omitted table | Kept as omissions with stated reasons — 2.7 |

## 4. Consultation messages to their contract

| Message | Contract |
| --- | --- |
| Opening user message, every branch | `consultation-flow.md` 2.1 and 2.2 |
| Rules currently carried by that message | 2.3, each moved into the system prompt or dropped |
| Tool result, success | 3, items 3 and 4 |
| Tool result, failure | 3, item 5 |
| Corrective message after an unusable reply | 4 |
| Repair request after unparseable output | 5 |
| Repair schema | 5.1 |
| Outcomes with no further prompt | 6 |

## 5. Variant gates to their contract

| Gate | Contract |
| --- | --- |
| Fog flag | `variants.md` 1 |
| Tool flags, each group | 2 |
| Tactical mode overriding tool flags | 2.5 |
| Opponent air presence | 3.1 |
| Opponent naval presence | 3.2 |
| Observed enemy roster empty | 3.3 |
| Option rows empty | 3.4 |
| Orderless units present or absent | 3.5 |
| Scenario id | 4 |
| Game size | 5 |
| Consultation policy | 6.1 and 6.2 |
| Tactical beat consulted or skipped | 6.3 |
| Previous consultation exhausted its tool budget | 6.4 |
| Briefing present or absent | 7, combinations |

## 6. Gaps: required facts today's prompt omits

Each of these is specified as required and is `absent` or `partial` in current output. They are the work list for the follow-on implementation.

| Item | Where it must appear | Current state |
| --- | --- | --- |
| `WEGO_PHASE_ORDER` | Combat and attack rules, both modes | partial — only "ranged uses pre-move positions" |
| `CASUALTY_PRIORITY` | Combat and attack rules, both modes | absent |
| `LEGAL_DEST_OCCUPANCY` | Combat rules and shared coaching | absent as a stated rule |
| `MOVE_BUDGET` | Strategic combat rules | absent |
| `TACTICAL_MP_RULES` numbers | Tactical combat rules | partial — weighting mentioned, budgets not |
| `HOLD_FIRE_SEMANTICS` | Strategic coaching item 4 | absent |
| `CALLBACK_EVENT_VOCABULARY` | Response envelope contract | absent |
| `PRODUCTION_INCOME` | Production status | absent |
| `INTEL_STALENESS_WINDOW` | Unit status, fog on | absent |
| `MEMORY_WRITE_LIMITS` | Legal actions table | absent |
| `CONSULT_POLICY` | Envelope contract and tactical coaching | absent |
| Air and naval sections omitted rather than dashed | Both mode files, roster gates | currently emitted as a dash row |
| Callback detail cell describing parameters | Active callbacks, both modes | present — unfiltered infrastructure watches render as `infrastructure_destroyed(any)` |
| Generic goal statement for a missing scenario | Goal statement | absent — today the region wording is emitted unconditionally |

## 7. Open engine-versus-rules defects

Carried from `source-inventory.md` section 8. Each is resolved in favour of the engine by this package; the row records what still needs a code or document change outside it.

| Id | Still open |
| --- | --- |
| `CAPS_V3_STALE` | The older combat-rules document contradicts the live caps; it should be corrected or marked superseded on the caps question |
| `TACTICAL_STRUCTURE_V3` | Same document describes a superseded tactical turn structure |
| `WEGO_ORDER_UNSTATED` | The prompt now states the engine order; the older combat-rules document's five-phase list still omits embark and cargo sync |
| `TEMPO_SWEEP_SILENCE` | Deliberate omission, documented in both mode files; must not be "fixed" by adding a sentence about the engine fallback |
| `TEMPO_FREE_CLAIM` | The false absolute must be removed from tool guidance in both modes |
| `STRATEGIC_CONTEXT_OPENING_UNCONDITIONAL` | The unconditional enemy-intent sentence must be removed |
| `HOLD_FIRE_UNGUIDED` | The withholding order needs stated semantics |
| `OCCUPANCY_UNSTATED` | The prompt now states friendly stacks are illegal and enemy cells are move/melee contact |
| `CASUALTY_ORDER_ABSENT` | The victim-sort rule needs stating |
| `CALLBACK_VOCAB_ABSENT` | The event list needs stating; the never-firing event should be removed from the vocabulary or implemented |
| `CALLBACK_DETAILS_THIN` | Details now names parameters, including `infrastructure_destroyed(any)` when the watch is unfiltered |
| `EMBARK_CONTROL_CONDITION` | The embark prose needs the control condition |
| `OMNISCIENT_GATE_NARROW` | Re-gate the caveat line on the meaning of the distances rather than on the fog flag alone |
| `INFANTRY_RANGE_SPLIT` | Already correct in the prompt; the older document is the stale side |
| `FACE_CROSSING` | Hop counts can understate real routes; under fog no caveat is emitted at all, which this package leaves as a known limitation rather than inventing a second caveat |
| `DUP_INJECTION` | Two call sites compute the same injection text; consolidating is a code change |
| `USER_RULE_DUPLICATION` | Resolved by this package's contract; implementing it is a code change |
| `UNREACHABLE_USER_BRANCHES` | Two dead branches; the contract covers them so a flag-derivation change cannot produce uncontracted text |
| `TOOL_ROUND_CAP_LITERAL` | The loop bound and the warning text hold independent literals |
| `ENVELOPE_FIELD_ORDER_DRIFT` | The submit header, the illustrative object, and the repair schema must all be brought to the single order in `assembly-contract.md` 5.1 |
