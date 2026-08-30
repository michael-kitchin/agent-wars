# Crosswalk

Traceability between the inventory, the information model, and the emitted assembly. Use it to answer where a fact is carried, where an existing section lives, and which engine-versus-copy rows remain.

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
| `HOP_VS_PATH_CAVEAT` | `variants.md` | Fog on and fog off, strategic |
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
| `Strategic context:` opening sentence about the enemy hunting the model | **Not emitted** — removed from `buildStrategicContextCoaching`; matrix tests forbid the substring |
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
| Free-damage claim in the tempo bullet | **Not emitted** — tempo bullets say the model chooses each target; matrix tests forbid `damage given up for free` |
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
| `### Best Options This Turn` | Kept, including airport ferry dests — 2.6 |
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
| Free-damage claim in the beat tempo bullet | **Not emitted** — same as strategic |
| Everything in the always-omitted table | Kept as omissions with stated reasons — 2.7 |

## 4. Consultation messages to their contract

| Message | Contract |
| --- | --- |
| Opening user message, every branch | `consultation-flow.md` 2.1 and 2.2 |
| Opening message is submit-only | `consultation-flow.md` 2.3 |
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

## 6. Facts the builders now carry (formerly listed as gaps)

These were absent or partial in an earlier assembler. The builders in `promptSpec/` emit them.

| Item | Where it appears | Builder |
| --- | --- | --- |
| `WEGO_PHASE_ORDER` | Combat paragraph, both modes | `buildResolutionOrderRule` |
| `CASUALTY_PRIORITY` | Combat paragraph and coaching | `buildCasualtySortRule` |
| `LEGAL_DEST_OCCUPANCY` | Combat paragraph and coaching | `buildDestinationOccupancyRule` |
| `MOVE_BUDGET` | Strategic combat paragraph | `buildMovementBudgetRule` |
| `TACTICAL_MP_RULES` | Tactical combat paragraph | `buildMovementBudgetRule('tactical')` |
| `HOLD_FIRE_SEMANTICS` | Combat paragraph and coaching when standing orders are on | `buildHoldFireRule` |
| `CALLBACK_EVENT_VOCABULARY` | Envelope callback clause | `buildCallbackVocabularyClause` |
| `PRODUCTION_INCOME` | Production status | `buildProductionIncomeRule` |
| `INTEL_STALENESS_WINDOW` | Unit status, fog on | `buildIntelStalenessRule` |
| `MEMORY_WRITE_LIMITS` | Envelope when memory updates are offered | `buildMemoryWriteLimitsClause` |
| `CONSULT_POLICY` | Coaching unconsulted-period bullets | `UNCONSULTED_TURN_BULLET` / `UNCONSULTED_BEAT_BULLET` (override ids not listed) |
| Air and naval sections omitted when that arm is absent | Both modes | `buildAirOperationsBriefingBlock` / `buildSealiftBriefingBlock` return `''` |
| Callback detail cell | Active callbacks | `formatCallbackLine` |
| Generic goal when scenario id is missing | Goal statement | `GENERIC_OBJECTIVE_SENTENCE` |

## 7. Remaining engine-versus-copy rows

From `source-inventory.md` section 8. Mechanics follow the engine. Wording follows the builders.

| Id | Status |
| --- | --- |
| `CAPS_V3_STALE` | Resolved in docs |
| `TACTICAL_STRUCTURE_V3` | Resolved in docs |
| `WEGO_ORDER_UNSTATED` | Resolved in combat paragraph |
| `INFANTRY_RANGE_SPLIT` | Resolved in combat paragraph |
| `TEMPO_SWEEP_SILENCE` | Deliberate omission; the prompt does not describe the engine fallback |
| `TEMPO_FREE_CLAIM` | Resolved: not emitted; tests forbid the substring |
| `STRATEGIC_CONTEXT_OPENING_UNCONDITIONAL` | Resolved: not emitted; tests forbid the substring |
| `HOLD_FIRE_UNGUIDED` | Resolved in combat paragraph and coaching |
| `OCCUPANCY_UNSTATED` | Resolved |
| `CASUALTY_ORDER_ABSENT` | Resolved |
| `CALLBACK_VOCAB_ABSENT` | Resolved for taught events; `territory_changed` remains untaught |
| `CALLBACK_DETAILS_THIN` | Details names parameters |
| `EMBARK_CONTROL_CONDITION` | Resolved in naval block and sealift bullet |
| `OMNISCIENT_GATE_NARROW` | Resolved |
| `FACE_CROSSING` | Resolved |
| `DUP_INJECTION` | Open as code hygiene (two call sites, one emission) |
| `USER_RULE_DUPLICATION` | Resolved: opening message is submit-only |
| `UNREACHABLE_USER_BRANCHES` | Opening remainder is empty-orders; fallback listing is the derived-flag branch |
| `TOOL_ROUND_CAP_LITERAL` | Resolved: named constant |
| `ENVELOPE_FIELD_ORDER_DRIFT` | Resolved: `ENVELOPE_FIELD_ORDER` |
| `AIR_NAVAL_DASH_ROWS` | Resolved: sections omitted |
| `GENERIC_GOAL_ABSENT` | Resolved |
| `CONSULT_POLICY_PARTIAL` | Unconsulted-period bullets exist; mandatory override ids are not listed |
| `TACTICAL_FERRY_ENVELOPE` | Envelope lists `ferryOrders` in battle when air is present; Best Options lists intact airport dests in the footprint |
