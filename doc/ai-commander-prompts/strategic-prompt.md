# Strategic prompt

The strategic (res1) system prompt as `buildSystemPromptForTools` emits it. Shared assembly comes from `assembly-contract.md`. Messages after the system prompt are in `consultation-flow.md`; gates are in `variants.md`. If this file disagrees with the builders, the builders win.

Heading strings in backticks are exact and must match the generated prompt character for character.

## 1. Section-by-section layout

Emit order. Each entry states purpose, the information items it carries, include and omit, empty-state, and what the model is expected to do with it.

### 1.1 Role and clock line

- **Shape:** one line naming the model as the enemy commander in a simultaneous-movement hex wargame, then the current turn number and phase.
- **Items:** `TURN_CLOCK`.
- **Include:** always. **Empty-state:** not possible.
- **Model use:** anchors every "this turn" reference that follows.

### 1.2 Goal statement

- **Shape:** the victory conditions in plain language, followed by how they are achieved: units die to ranged and melee combat, production capacity dies to air strikes.
- **Items:** `WIN_CONDITIONS`.
- **Include:** always. **Empty-state:** when no scenario is set, state the generic objective of destroying enemy forces and taking territory, and do not name home regions. See `variants.md`.
- **Model use:** decides whether this turn's effort goes to territory, production, or attrition.

### 1.3 Situational directives

- **Scouting directive.** Include when no enemy unit is observed. The preamble sentence is `No human units are currently observed. Enemy forces may be out of view.` Coaching adds the move-to-regain-contact bullet. **Omit** the preamble sentence otherwise.
- **Tool-budget warning.** Include when the previous consultation exhausted its tool-call budget and submitted nothing, and planning or standing-order tools are enabled. State the round limit, that no orders were submitted last turn, and that the model must submit promptly after gathering what it needs. **Omit** otherwise.
- **Items:** `ENEMY_ROSTER_OBSERVED`, `TOOL_BUDGET_WARNING`.
- **Model use:** overrides the default of standing still, and caps tool spending.

### 1.4 Coordinate preamble

- **Shape:** two paragraphs. First: global map at res1, positions are two-character briefing codes taken from the operational map and unit table, copied exactly and never invented, distances are hex counts. Second: in the response, cells are briefing codes and a pursue target is an enemy unit id; raw H3 strings and latitude/longitude pairs are never emitted.
- **Items:** `HEX_IDENTITY`, `UNIT_IDENTITY`.
- **Include:** always. **Empty-state:** not possible.

### 1.5 Combat and attack rules

One paragraph, in this order. Every clause is required unless marked.

1. Dice model: one d6 per shot; an attack hits on a roll at or below the attacking stat, a defensive hit on a roll at or below the defending stat.
2. Per-type stats and reach: attack, defense, and strategic ranged reach for each of infantry, armor, naval, and air. Reach values come from `strategicRangedRangeHexesForUnitType`; a reach of zero is stated as melee only.
3. Casualty rule: hits land on the lowest-defense unit in the target stack first, then in the fixed type order infantry, armor, naval, air (`buildCasualtySortRule`).
4. Resolution order for the turn: embark, then air strikes, then ranged fire, then movement, then cargo sync, then ferry, then melee (`buildResolutionOrderRule`).
5. Attacks resolve from turn-start positions, so a unit may fire and move in the same turn and firing never costs a move.
6. At most one ranged action per unit per turn, using exactly one of a target cell code or a target unit id, and never the unit's own move destination.
7. Infantry has no strategic ranged action and closes to melee instead.
8. Movement budgets: one cell for infantry, two for armor and naval, and air never marches (`buildMovementBudgetRule`).
9. Friendly units may stack on the same cell. A cell holding an enemy is legal as a move/melee Target Hex. Approach Target Hexes omit stay-put friendlies; a cell a friendly is leaving this period is a legal dest (`buildDestinationOccupancyRule`).
10. Invalid attacks are dropped before submission.
11. Naval clause, included only when the opponent has naval units: naval units fire on land targets at one or two cells, move on water and coastal cells, and reach a land target by routing to the nearest water or coastal cell.
12. Air clause, included only when the opponent has air units: the tempo sentence names air strikes alongside ranged attacks, and `buildAirEmploymentRule` states strike radius 3, ferry range 4, and that strike and ferry cannot share a turn.
13. Hold-fire sentence, included only when standing-order tools are enabled: a fire-withholding standing order suppresses automatic engagement until replaced; omitting an attack is not the same (`buildHoldFireRule`).

- **Items:** `COMBAT_STATS`, `STRATEGIC_RANGE_TABLE`, `ATTACK_ONE_PER_UNIT`, `WEGO_PHASE_ORDER`, `TEMPO_RANGED_SHOT`, `CASUALTY_PRIORITY`, `MOVE_BUDGET`, `LEGAL_DEST_OCCUPANCY`, `NAVAL_MOVEMENT_DOMAIN`.
- **Include:** always; clauses 11 and 12 are roster-gated. **Empty-state:** not possible.
- **Model use:** every firing and movement decision in the turn.

Assessment-tool and combat-estimate hints must **not** appear when a precomputed briefing is attached, because those tools are not callable in that configuration.

### 1.6 `# Commander's Briefing`

- **Include:** when a briefing body is supplied. When it is absent, the memory, standing-order, and production sections are emitted standalone and this heading does not appear.
- **Model use:** the single place to read the current situation.

#### Narrative paragraph

- **Shape:** at most five sentences. Sentence one is always the turn number, own unit count, and observed enemy count; when the observed count is zero it also states that enemy forces may be out of view and that contact must be regained. Optional middle sentences report units in or near contact, units lacking a standing order when those tools are enabled, and units under critical threat. The closing sentence directs the model to the unit table, attention flags, and map, and names the order kinds available this turn.
- **Items:** `TURN_CLOCK`, `ENEMY_ROSTER_OBSERVED`, `FOG_MODE`, `ACTION_NEEDED_FLAG`.
- **Include:** always inside the briefing. **Empty-state:** not possible; the first and last sentences are unconditional.
- **Model use:** a five-second orientation before the tables.

#### `## Unit Status and Threats`

- **Include:** always inside the briefing.
- **Distance-basis caveat line:** immediately after the heading and before the table. Under fog off at res1, include one line stating that nearest-enemy distances and threat estimates are straight hop counts rather than march or sail paths, and that option-table targets are already this-turn legal destinations. Under fog on at res1, include the intel-staleness sentence and one line stating that nearest-enemy distances are march or sail path lengths when a path exists (otherwise a hop count), and that Best Options Target Hexes are already this-turn legal destinations — copy them even when the printed path is longer than one movement budget. Omit both caveat lines in battle. `variants.md` fixes the gates.
- **Rows:** one per own unit. **No cap.** The table lists every unit the snapshot includes, at every game size.
- **Items:** `OWN_UNIT_TABLE`, `UNIT_IDENTITY`, `NEAREST_ENEMY_DISTANCE`, `CONTACT_FLAGS`, `THREAT_SEVERITY`, `ACTION_NEEDED_FLAG`, `INTEL_FRESHNESS`, `INTEL_STALENESS_WINDOW`, `HOP_VS_PATH_CAVEAT`.
- **Empty-state:** header row plus the line `(No AI units)`.
- **Model use:** the roster to work through; the action-needed column is the worklist.

#### `## Attention Flags`

- **Shape:** a bullet list, not a table.
- **Sort and cap:** ranked with critical threats first (including this-turn closers that already have a healthy standing order), then moderate, then standing-order warnings, then receding marches, then the aggregate armed-units bullet; capped at five bullets. When the armed-units bullet is present it always occupies one of those five slots so per-unit critical closers cannot hide the legal-attack worklist. A unit that already has a legal attack is named only in that armed-units bullet, not also as a per-unit closer, so closers without shots are not crowded out by shooters.
- **Overflow contract:** units past the cap are **not** dropped from the model's view; they remain in the unit table with their action-needed value. The armed-units bullet names at most twelve unit ids and then states how many further units are marked as needing action. Any future cap change must keep both halves of this contract.
- **Items:** `ATTENTION_FLAGS`, `ACTION_NEEDED_FLAG`.
- **Include:** always inside the briefing. **Empty-state:** `None.`
- **Model use:** the shortlist to act on first when the roster is too large to read row by row.

#### `# Operational Map`

- **Shape:** a legend, then a fenced ASCII grid, then a displaced-features footnote when needed, then the options subsection.
- **Legend contract:** each cell shows its code on the top line and terrain plus overlay on the bottom line; `x` is land and `.` is water; `*` marks own units, `!` enemy units, `#` contested, `?` undiscovered intel; feature letters mark airport, seaport, both, and urban, with uppercase meaning own control; odd rows are indented one space; only codes from this map or the tables may be used.
- **Displaced-features footnote:** include when a unit overlay hides a feature marker, listing each affected cell and its feature. Omit when empty.
- **Items:** `MAP_GRID`, `TERRAIN_CLASS`, `INFRA_PRESENCE`, `CONTROL_STATE`, `DISPLACED_FEATURES`.
- **Include:** always inside the briefing. **Empty-state:** the heading plus `(No units — map not rendered.)` when neither side has units.
- **Model use:** the source of legal cell codes and the only spatial picture.
- **Must not contain:** a unit-roster subsection. Own and enemy rosters live in the unit table and the observed-enemy line; a third listing is a contradiction risk.

#### `### Best Options This Turn`

- **Include:** when at least one option row exists. **Omit** heading and table otherwise.
- **Items:** `BEST_OPTIONS_ROWS`, `LEGAL_DEST_OCCUPANCY`, `RANGED_LEGAL_TARGETS`, `AIR_STRIKE_ENVELOPE`.
- **Model use:** the primary source of destinations and targets; copying a row is always preferred to routing. A unit listed on an `air strike` row this turn must not also appear on a `ferry` row; strike-or-ferry exclusivity is already decided by the table, not left as a join.
- **Empty-state consequence:** when the table is absent, destinations must come from the routing tool. The prompt must say this rather than leaving the copy instruction pointing at nothing. See `variants.md`.

#### `## Supplemental Hex Intelligence`

- **Shape:** one bullet per assessed cell: code, terrain, which unit kinds may pass, and any notes.
- **Items:** `TERRAIN_KIND_NOTES`.
- **Include:** when at least one hex assessment exists. **Omit** otherwise.
- **Model use:** deciding whether a cell an enemy holds is approachable by the unit kind being sent.

#### `## Recent Turn Notes`

- **Shape:** up to three prior turns in ascending order; each block gives that turn's message, strategy, and losses on each side. Loss lines name units by snapshot id, never by display name.
- **Items:** `RECENT_TURN_NOTES`.
- **Include:** when at least one of those turns has a message, strategy, or loss. **Omit** otherwise.
- **Model use:** continuity, so a plan begun two turns ago is not silently abandoned.

#### `# Production Status`

- **Include:** when production tools are enabled. **Omit** otherwise, and omit every production clause elsewhere in the prompt.
- **Content order:** cost and infrastructure minimum per type; the per-side deployment cap per type at this game size; own current counts against those caps; income and spending rule; the maxed-type list and the blocked-queue rule when any type is at cap; resolution timing; then the queue table.
- **Items:** `PRODUCTION_RULES_COSTS`, `PRODUCTION_CAPS`, `PRODUCTION_INCOME`, `PRODUCTION_CAP_QUEUE_RULE`, `PRODUCTION_TIMING`, `PRODUCTION_QUEUES`.
- **Empty-state:** when no controlled cell has an editable queue, replace the table with a single sentence saying so. When the production subsystem is unavailable, state the engine's reason rather than inventing one.
- **Model use:** decides which cells queue which type this turn.

#### `# Your Strategic Memory`

- **Include:** when memory tools are enabled. **Omit** otherwise.
- **Content:** the persistent table, the triggered-reminder table, slot usage against both limits, a count of stored notes not shown, the read path, and the write path.
- **Items:** `MEMORY_PERSISTENT`, `MEMORY_TRIGGERED`, `MEMORY_LIMITS`, `MEMORY_WRITE_PATH`, `MEMORY_WRITE_LIMITS`.
- **Empty-state:** each table shows one row of `—`; the slot-usage line still appears.
- **Model use:** recovers intent from previous turns and decides what to persist now.

#### `# Standing Order Status`

- **Include:** when standing-order tools are enabled. **Omit** otherwise, along with `## Units Without Standing Orders` and every standing-order clause.
- **Items:** `STANDING_ORDER_STATE`, `ORDER_TYPE_LEGALITY`.
- **Empty-state:** one row of `—`.
- **Model use:** decides which existing missions to leave alone and which to override.

#### `## Units Without Standing Orders`

- **Include:** whenever the standing-order block is present, even when every unit has an order.
- **Items:** `ORDERLESS_UNITS`, `SUGGESTED_DESTINATION`.
- **Empty-state:** one row of `—`.
- **Model use:** the exact worklist for new standing orders; each row's suggested destination is a ready-made march target.

#### `## Active Callbacks`

- **Include:** always inside the briefing.
- **Items:** `CALLBACK_ACTIVE_LIST`.
- **Empty-state:** one row whose event cell is `—` and whose detail cell states that omitting callbacks or sending `[]` leaves no self-chosen triggers, so under event-driven policy only engine-forced consultations remain unless the model subscribes now.
- **Detail-cell contract:** the detail cell must describe the subscription in terms the model can act on — the event and its parameters, such as the unit id or the cell code it watches. Repeating the event name in both cells carries no information and does not satisfy this contract. An unfiltered `infrastructure_destroyed` watch (no `targetType`, no hex) must say that it is unfiltered and that re-subscribing uses the event with no params — not `infrastructure_destroyed(any)`.
- **Model use:** decides which subscriptions to keep, since the response replaces the whole list. Omitting `callbacks` or sending `[]` clears every subscription.

### 1.7 `# Scenario Objective (Required)`

- **Include:** when the scenario is the region-versus-region scenario. **Omit** for a missing or unrecognised scenario, and do not substitute region wording.
- **Content:** the scenario id; own home region name when present; enemy home region name when present; the two win paths, control of every enemy home cell or elimination of all enemy home urban production; and the statement that both home outlines are always visible.
- **Items:** `SCENARIO_ID`, `HOME_REGION_NAMES`, `WIN_CONDITIONS`, `HOME_REGION_VISIBILITY`.
- **Model use:** identifies which cells are worth taking and which must be held.

### 1.8 `Strategic context:` block

Bullets in this order.

1. **Goals**, five numbered lines: engage enemy forces to reduce their effectiveness; disperse to maximise visibility; maximise own production; protect own home production capacity; degrade or eliminate enemy home urban production.
2. **Strategy**, three numbered lines of doctrine (speed and initiative; gaps not surfaces; maximum disruption with minimum force).
3. **Message guidance**: one in-character line at the human player, psychological warfare only, revealing no orders, cells, ids, or intent.
4. **Explored** progress: own explored land cells against total land cells.
5. **Controlled** progress: own controlled land cells against total land cells.
6. **Home-region bullets**, when the scenario supplies home regions: own home control, own home cells when the two regions are not the same set, control of the enemy home region, enemy home cells when the sets differ, and the shared-cell line when the regions intersect.

- **Items:** `EXPLORED_CONTROLLED_PROGRESS`, `HOME_CONTROL_PROGRESS`, `HOME_REGION_HEXES`, `HOME_REGION_OVERLAP`, `MESSAGE_DISCIPLINE`.
- **Include:** always; bullets 4 through 6 are gated as stated.
- **Must not contain:** the standing assertion that enemy units remain in play and are actively hunting the model. It is unverifiable, and it directly contradicts the scouting directive whenever the observed roster is empty. Situational awareness of that kind belongs in the narrative paragraph, which is computed from the roster.

### 1.9 `# Air Operations Status`

- **Include:** when the opponent has at least one air unit. **Omit** the whole section otherwise, along with the air JSON fields and every air clause.
- **Content:** the air rules line (strike radius from base, ferry radius airport to airport, one air action per unit per turn), own and enemy air counts, the per-unit table, then the strike-envelope summary of enemy infrastructure currently reachable.
- **Items:** `AIR_STRIKE_ENVELOPE`, `FERRY_DESTINATIONS`, `AIR_ORDER_RESTRICTIONS`.
- **Model use:** for each air unit, decide strike or rebase; never both.

### 1.10 `# Naval Transport Status`

- **Include:** when the opponent has at least one naval unit. **Omit** the whole section otherwise, along with the sealift actions, the routing-tool land-target clause, and the naval combat clause.
- **Content:** the embark rules including the control condition, capacity, the per-unit table, and the nearest embark cell per unit.
- **Items:** `EMBARK_STATE`, `EMBARK_HEX`, `EMBARK_LEGALITY`, `NAVAL_MOVEMENT_DOMAIN`.
- **Model use:** decides whether land force crosses water this turn and from where.

### 1.11 `# Available Tools`

- **Content order:** intro paragraph, numbered lines for exactly the enabled tools, then the guidance bullets from section 4.
- **Items:** `TOOL_CATALOG`.
- **Include:** always. **Empty-state:** the heading plus `No tools available.`
- **Tool line contract:** each line names the tool, its parameters, and what it returns. The routing tool's line states that it should be skipped when the destination already appears as an option row for that unit. The routing tool's naval land-target clause is included only when the opponent has naval units.

### 1.12 Observed enemy roster line

- **Shape:** one line listing each observed enemy unit with its type and cell, or the empty-roster phrasing.
- **Items:** `ENEMY_ROSTER_OBSERVED`.
- **Include:** always.
- **Model use:** a compact target list that does not require re-reading the unit table.

### 1.13 Response envelope contract and example

Contract text in section 3; the example immediately follows it and must be consistent with it. Both are always included. The example unit ids must use an `example-` prefix so they cannot collide with live snapshot ids. The parse-repair schema uses the same prefix. The production example must not queue a type that is commonly at cap (prefer air over infantry). The example is compact JSON with no markdown fence.

## 2. Table column contracts

Columns are exact and ordered. A later contract test should assert header cells verbatim.

| Table | Columns |
| --- | --- |
| Unit status | `Unit ID`, `Type`, `Hex`, `Nearest enemy + distance`, `Threat severity`, `Action needed` |
| Best Options | `Unit IDs`, `Action`, `Target Hexes`, `Target Units`, `Target Infrastructure` |
| Controlled hex queues | `Hex`, `Urban Hexes`, `Airports`, `Seaports`, `Available Unit Types`, `Current Queue` |
| Memory persistent | `Key`, `Updated Turn`, `Content` |
| Memory reminders | `Key`, `Tier`, `Recurring`, `Content` |
| Standing order status | `Unit ID`, `Unit Type`, `Order Type`, `Destination / Target`, `Status`, `Next Move`, `Turns Remaining`, `Attention` |
| Units without standing orders | `Unit ID`, `Unit Type`, `Suggested Destination` |
| Air operations | `Unit ID`, `Base Hex`, `Base Intact`, `Base Controlled`, `Enemy Unit Targets`, `Strikeable Urban`, `Strikeable Airports`, `Strikeable Seaports`, `Ferry Destinations` |
| Naval transport | `Unit ID`, `Hex`, `Your control`, `Seaport Here`, `Aboard`, `Capacity Used`, `Nearest Embark Hex` |
| Active callbacks | `Event`, `Details` |

Cell contracts that carry meaning beyond the column name:

1. **Unit status `Hex`** is a briefing code, or an em dash when the unit has no mapped position.
2. **Unit status `Nearest enemy + distance`** names the enemy unit id and the distance, followed by intel quality and, under fog, the turn it was last seen. Under fog off the distance is a hop count; under fog on it is a march or sail path length when a path exists (otherwise a hop count). When no enemy is observed the cell is an em dash, and the scouting directive is what tells the model to act on that.
3. **Unit status `Threat severity`** is one of critical, moderate, low, or an em dash.
4. **Unit status `Action needed`** is yes or no. It is yes when the unit has a legal shot this turn, or can close to the nearest enemy this turn (hop count at most the unit's movement budget, or `estimatedTurnsToReach` at most one when hops are unavailable) under a moderate or critical threat, or is on a standing march whose destination recedes from that enemy — even if the standing-order status is otherwise healthy. An air unit holding on defend with no legal shot is not marked yes solely because coaching tells it to ferry. A quiet rear-area unit may be annotated as quiet; the annotation never replaces the yes or no value.
5. **Best Options `Unit IDs`** may list several unit ids. Every id on the row may use that row's targets. This must be stated in the guidance bullets, not left to inference.
6. **Best Options `Action`** takes exactly one of: `air strike`, `ranged`, `approach`, `ferry`, `move/melee`. Each maps to one envelope destination, per section 3.3.
7. **Best Options `Target Hexes`** are already legal this turn for every unit on the row. Approach targets omit stay-put friendlies; a cell a friendly is leaving this period is listed. move/melee targets may be enemy-occupied (that is contact). Per-unit rows are capped at five before identical rows are merged; the cap is a presentation limit and the routing tool remains available for anything not listed. An air unit with an `air strike` row is not also listed on a `ferry` row this turn.
8. **Controlled hex queues `Available Unit Types`** lists only types that can still be built, except when every available type is at cap, in which case the full list is shown with the at-cap marker. The marker string in this column and the marker quoted in the cap rule must be the same string; they come from one constant.
9. **Controlled hex queues `Current Queue`** marks a queued type that cannot currently spawn as blocked at cap. The queue table shows the ten cells with the most urban capacity, plus every further cell that has something queued, so no active queue is hidden.
10. **Units without standing orders `Suggested Destination`** is a legal cell that strictly reduces distance to the nearest enemy, or an em dash when no closing cell exists. It comes from the same approach helper that produces Best Options approach targets, so the two must never disagree; see section 5.
11. **Air operations `Base Intact` and `Base Controlled`** are yes or no. A unit whose base is not intact or not controlled cannot ferry from it, and the prompt's air coaching must not tell it to.
12. **Naval transport `Nearest Embark Hex`** is the nearest cell where that unit may legally load, evaluated with the embark rule including the control condition.
13. **Active callbacks `Details`** describes the subscription's parameters, per section 1.6. Unfiltered infrastructure watches use the unfiltered wording in that section, never `infrastructure_destroyed(any)`.
14. **Standing order status `Attention`** is yes or no. It is yes when the order is in a warning status, or when a march or pursue next step recedes from the nearest observed enemy.

## 3. Strategic response envelope

### 3.1 Field contract

Fields, order, and presence follow `assembly-contract.md` section 5.1. Strategic prompts offer the standing-order actions, memory updates when memory tools are enabled, and production orders when production tools are enabled.

### 3.2 Legal actions and their required fields

| Action | Required fields | Legality rules the prompt must state |
| --- | --- | --- |
| `assign_order` | `unitId`, `order.type` plus that type's fields | `march` needs one destination code; `defend` needs one defend cell code; `patrol` needs two or more waypoint codes visited in order then looped, and a single destination is not a valid patrol; `pursue` needs an enemy unit id; a fire-withholding order needs no further fields. Air units reject march, patrol, and pursue. A march to the unit's own cell is discarded as already arrived, leaving the unit idle. Order destinations may be multi-turn goals, unlike option-table targets. |
| `cancel_order` | `unitId` | Clears the unit's standing order. |
| `explicit_move` | `unitId` or `unitIds`, `destination` | One cell for this turn only. The destination must be an option-table target for those units or a routing-tool result. When the option row lists several ids, emit one entry with `unitIds`. It must not be the unit's current cell and must not be occupied. Embarked cargo debarks automatically before marching. |
| `ranged_attack` | `unitId` or `unitIds`, exactly one of a target cell code or a target unit id | Only for units with a strategic reach of at least one, so never infantry. Not "ranged-only": a unit that can fire may also move in the same turn. One per unit per turn, measured from turn-start positions. The target must not be the unit's own move destination. |
| `embark` | `unitId`, `navalUnitId` | The land unit must be at a cell where loading is legal. |
| `transport_move` | `navalUnitId`, `destination` | Moves the transport and its cargo together. |
| `disembark` | `unitId`, `destination` | Clears the cargo assignment and marches in one action. |
| `airStrikes` entry | `unitId` or `unitIds`, exactly one of a target cell code or a target unit id, `targetType` of units, urban, airport, or seaport | Within the strike radius of an intact, controlled base. One air action per unit per turn. |
| `ferryOrders` entry | `unitId` or `unitIds`, `destination` | Airport to airport within the ferry radius. A unit that strikes this turn must not also ferry; a ferry order for a striking unit is discarded. |
| `memoryUpdates` entry | write or delete with a key, and content plus tier for a write | Keys are short and restricted to letters, digits, hyphen, and underscore; content is length-limited. There is no memory write tool. |
| `productionOrders` entry | `action`, `hex`, `unitType`, `count` | Count is a whole number from one to ninety-nine. Each entry replaces that cell's whole queue with one type and count. An entry missing `action` or a required field is dropped. At least one `set_build_queue` is required this turn when any controlled hex has an empty queue, or a queue blocked at cap while another type can still be built. |

### 3.3 Option row to envelope field mapping

| Option row action | Envelope destination |
| --- | --- |
| `approach` | `explicit_move.destination`, or a march destination on a new standing order |
| `move/melee` | `explicit_move.destination` |
| `ranged` | a `ranged_attack` entry's target |
| `air strike` | an `airStrikes` entry's target |
| `ferry` | a `ferryOrders` entry's destination |

### 3.4 Invalid output rules the prompt must state

1. The top level is an object; a top-level array is invalid.
2. Legacy top-level movement and ranged-attack arrays are invalid.
3. An entry missing a required field is dropped without comment.
4. A march to the unit's current cell is dropped as already arrived.
5. Air units cannot be given march, patrol, or pursue orders. Omit when the opponent has no air units.
6. Infantry cannot be given a strategic ranged attack.
7. A ranged action's target must not be the acting unit's own move destination.
8. Friendly stacking is legal; a cell holding an enemy is legal as move/melee contact.
9. More than one ranged action for the same unit in the same turn is not honoured. When air is present, the same one-action limit applies to air strikes.
10. Raw H3 strings and coordinate pairs are never valid field values.

## 4. Required strategic coaching

System-prompt content only. Each item is a rule the model must be told, with the reason it is needed. Wording is left to the implementer; the content is not.

1. **Win paths.** Name the two ways the game ends and which cells matter for each, so territorial effort has a target. Carries `WIN_CONDITIONS`, `HOME_REGION_HEXES`.
2. **Resolution order.** State the full turn order, including cargo sync between movement and ferry, so the model can reason about firing then closing, cargo riding the transport, and ferry arriving after ground movement.
3. **Fire before moving costs nothing.** Every unit with a legal shot should be given a ranged action, and an air strike when air is present, and the model chooses each target, because the shot resolves from the turn-start position and does not consume the move. The air half of this sentence is omitted when the opponent has no air units. Carries `TEMPO_RANGED_SHOT`, `ATTACK_ONE_PER_UNIT`.
4. **Withholding fire is an explicit order.** A unit that should not engage is given a fire-withholding standing order, which suppresses automatic engagement for that unit until replaced. Leaving a unit without an attack is not the same as ordering it to hold fire. Include only when standing-order tools are enabled, since that is the only way to issue it. Carries `HOLD_FIRE_SEMANTICS`.
5. **Target the weakest defender.** Hits land on the lowest-defense unit in a stack first, then in the fixed type order, so firing into a mixed stack removes its most fragile unit. Carries `CASUALTY_PRIORITY`.
6. **Copy option rows by action type.** Use the mapping in section 3.3, and route only for a destination the table does not list for that unit. Never copy a Target Hex from a row that does not list that unit; if the unit has no row, call the routing tool or leave it idle. One row may name several units; copy those ids into one `unitIds` array on a single envelope entry. Each unit gets at most one move and one shot: pick one row per action type; do not copy overlapping rows that relist the same unit. Carries `BEST_OPTIONS_ROWS`.
7. **Friendly stacking is legal; enemy cells are move/melee contact.** Copy a move/melee Target Hex even when it holds an enemy. Approach Target Hexes omit stay-put friendlies; a cell a friendly is leaving this period is a legal dest.
8. **Give every orderless unit a mission.** For each row of the orderless table, issue a standing order: march or pursue to close, defend to hold. The suggested destination is a ready-made legal march target. Never march a unit to its own cell. Carries `ORDERLESS_UNITS`, `SUGGESTED_DESTINATION`, `MARCH_CURRENT_HEX_RULE`.
9. **Leave working missions alone, except this-turn contact and receding marches.** A unit with a healthy standing order needs no new order unless the model wants to override it; the attention column marks the ones that have stalled and the marches whose next move recedes from the nearest enemy. A this-turn move/melee Target Hex is such an override — copy it even when the unit is already marching. After a unit fires, do not leave it on a standing march that recedes from that enemy: assign defend to hold contact, cancel the march, or remarch toward the enemy. Carries `STANDING_ORDER_STATE`.
10. **Move idle air toward the fight.** An air unit only contributes when something is inside its strike radius, and rebasing costs it nothing else that turn. Any air unit with no strike available should ferry toward the fighting even when it is holding on defend, and no air unit should both strike and ferry. Carries `FERRY_DESTINATIONS`, `AIR_ORDER_RESTRICTIONS`.
11. **Route naval units to reach land targets.** Naval units cannot enter land cells; to engage a land target, move to the nearest water or coastal cell within range. Carries `NAVAL_MOVEMENT_DOMAIN`.
12. **Use sealift deliberately.** When land force must cross water, embark at a legal cell, move the transport, then disembark; loading requires a coastal cell, a land seaport, or a controlled seaport on transit water. Carries `EMBARK_LEGALITY`, `EMBARK_HEX`.
13. **Scout when blind.** With no enemy observed, move to regain contact rather than hold. Carries `ENEMY_ROSTER_OBSERVED`.
14. **Keep production queued.** When a controlled cell can build and its queue is empty, queue something. Replace a queue blocked by a cap with an available type this turn; when every available type for that cell is capped, leave the queue alone so it resumes when the cap frees. The response must include at least one `set_build_queue` when any controlled hex has an empty queue or a blocked-at-cap queue that still has an alternative type. Carries `PRODUCTION_QUEUES`, `PRODUCTION_CAP_QUEUE_RULE`.
15. **Shared home cells count for both sides.** When the home regions intersect, the listed shared cells count toward both win conditions, so holding them serves defence and attack at once. Include only when an intersection exists. Carries `HOME_REGION_OVERLAP`.
16. **Persist intent, not data.** Write a short persistent note naming this turn's objectives and the units assigned to them. Always include a `memoryUpdates` write this turn when persistent slots are unused. Do not persist enemy positions or rosters, which the briefing already supplies fresh each turn. Carries `MEMORY_PERSISTENT`, `MEMORY_WRITE_PATH`.
17. **Subscribe to what would change the plan.** Callbacks are chosen from the engine's event vocabulary and the response replaces the entire subscription list. Omitting `callbacks` or sending `[]` clears every subscription. An empty Active Callbacks table means there are no self-chosen triggers; under event-driven policy only engine-forced consultations remain unless the model subscribes now. Carries `CALLBACK_EVENT_VOCABULARY`, `CALLBACK_REPLACE_SEMANTICS`.
18. **Keep the player-facing line clean.** The message field is a taunt or threat and must not reveal orders, cells, unit ids, or intent. Carries `MESSAGE_DISCIPLINE`.
19. **Spend the tool budget on unknowns only.** Rounds are limited and exhausting them submits nothing at all; once destinations are chosen, submit. Carries `TOOL_CATALOG`, `TOOL_BUDGET_WARNING`.

Claims the builders **omit** from strategic coaching (tests forbid the substrings):

- That every unfired legal shot is damage given up for free. Item 3 states that a shot is free of movement cost and that the model chooses each target. The engine sweep is not described; that omission is deliberate (`TEMPO_SWEEP_SILENCE`).
- That the engine will fire, move, or otherwise act for any unit the model leaves unordered.
- Any unconditional claim about what the human player is currently doing or intending.
- Any instruction to call a tool that is not in this consultation's tool list.

## 5. Weak-model join rules

1. **No cross-table arithmetic.** Every action the model must take is fully specified on one row of one table. It must never need to combine a distance from the unit table with a cell from the map to compute a destination.
2. **One helper per shared meaning.** The orderless table's suggested destination and the option table's approach targets are both closing moves toward the nearest enemy and both come from `pickApproachHexesTowardNearestEnemy` over `getValidDestinationsUnoccupied`. If either surface changes its source, both change together or the prompt starts contradicting itself.
3. **Every worklist is enumerated.** The action-needed column, the orderless table, and the option rows are the three worklists. Each lists its members explicitly; none requires the model to derive membership from a rule.
4. **A capped list says what it caps.** Attention flags cap at five bullets and name at most twelve ids in the aggregate bullet, and in both cases the remainder is still reachable in the unit table. The unit table itself is never capped.
5. **Empty is stated, not implied.** Every table has a defined empty form, so an absent row is never ambiguous between "none" and "omitted".
6. **One name per thing.** A unit is its id, a cell is its code, and neither has a second label anywhere in the prompt.
