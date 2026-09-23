# Tactical prompt

The tactical (res4) beat system prompt as the builders emit it. The captured tactical prompt dump in the repository root is stale and is not a source. If this file disagrees with the builders, the builders win.

Shared rules come from `assembly-contract.md`. Differences from the strategic contract are stated as differences; everything not called out here follows `strategic-prompt.md` only where `assembly-contract.md` marks the section as shared.

## 1. Battle framing

1. **Two clocks.** The prompt states the strategic turn number, the tactical beat number, and the phase. A beat is a period inside one strategic turn, and the beat number is what "this beat" refers to everywhere else in the prompt. Carries `TURN_CLOCK`, `BATTLE_FRAME`.
2. **One footprint.** The battle occupies the res4 child cells of a single contested res1 cell. Every cell code in the prompt belongs to that footprint. Carries `BATTLE_FRAME`, `HEX_IDENTITY`.
3. **Local goal only.** The goal statement is to engage and defeat the enemy forces present in this battle. The regional win conditions, home regions, and territorial progress must not appear. A model told to win the region during a beat will disengage to chase territory it cannot reach from inside the footprint. Carries `BATTLE_FRAME`.
4. **Sub-unit addressing.** Units in battle are sub-units, addressed as the parent unit id followed by a colon and a two-digit slot. Enemy sub-unit ids are legal target values. The parent strategic id is never a valid order target in a beat. Carries `SUBUNIT_IDENTITY`.
5. **Full visibility.** Both sides see every sub-unit in the footprint, and the narrative states this. Fog affects the strategic snapshot, not the battle. The straight-hop distance caveat is not emitted in battle, because its gate requires the strategic resolution. Carries `BATTLE_FRAME`.
6. **Movement is a point budget.** A sub-unit moves on a terrain-weighted movement-point budget per beat: two points for infantry, four for armor, three for naval, and air does not march. Infantry or armor whose **current** cell is urban or rubble has a one-point budget this beat, not the type baseline. Armor in forest is penalised to the infantry baseline. Road and rail edges multiply remaining points. A non-air sub-unit always retains at least one point. Carries `TACTICAL_MP_RULES`.
7. **Infantry has reach here.** At res4 every ground and naval type has a ranged reach: infantry two, armor five, naval ten, before terrain reduces it. Forest, urban, rubble, or a road/rail corridor on the attacker's cell caps infantry and armor to range 1. Mountain along the line of sight blocks armor, naval, and air (infantry is exempt). This is the opposite of the strategic rule and the prompt must state it explicitly rather than leaving the strategic melee-only sentence in place. Carries `TACTICAL_RANGE_TABLE`.
8. **Air strikes anywhere in the battle.** An air sub-unit may strike any cell in the footprint; the strategic three-cell strike radius does not apply. Striking still costs the unit its one air action for the beat. Strike options are offered only while the enclosing cell's airport is intact, so an air sub-unit whose parent airport has been destroyed has no strike rows to copy. Carries `AIR_STRIKE_ENVELOPE`, `TACTICAL_RANGE_TABLE`, `AIR_ORDER_RESTRICTIONS`.
9. **Standing orders are inert.** No standing order moves a sub-unit during a beat. A sub-unit the model does not order is a sub-unit that does not move. Carries `STANDING_ORDERS_INERT_IN_BATTLE`.

## 2. Section-by-section layout

Emit order. Sections shared with strategic keep the same heading strings; the differences are in the content.

### 2.1 Role and clock line

Same shape as strategic, with the beat clock: strategic turn, tactical beat, phase.

### 2.2 Goal statement

The battle-local goal from section 1.3, followed by a pointer to the rules below. **Must not** contain win conditions, home regions, or scenario text.

### 2.3 Situational directives

- **Scouting directive:** never. Visibility inside the footprint is complete, so there is nothing to scout.
- **Tool-budget warning:** included on the same condition as strategic.

### 2.4 Coordinate preamble

Two paragraphs. First: the battle map is the res4 children of the enclosing res1 cell, positions are two-character tactical codes taken from the map and the unit table, copied exactly and never invented, distances are res4 steps. Second: in the response, cells are tactical codes and target-unit values are enemy sub-unit ids; raw H3 strings and coordinate pairs are never emitted. Carries `HEX_IDENTITY`, `SUBUNIT_IDENTITY`.

### 2.5 Combat and attack rules

Same clause order as strategic section 1.5, with these substitutions:

| Clause | Tactical value |
| --- | --- |
| Per-type reach | Res4 reaches from `RANGED_RANGE_BY_UNIT_TYPE`; air is stated as striking anywhere in the battle rather than as a numeric reach |
| Infantry clause | Infantry and armor fire at res4 baselines; forest, urban, rubble, or a road/rail corridor on the attacker caps them to range 1; mountain LOS blocks armor, naval, and air; close to melee when out of reach |
| Movement budgets | The point budget from section 1.6: type baselines, origin urban/rubble collapsing infantry and armor to one point, forest penalty for armor, and road/rail remaining-point multipliers; not the strategic per-turn cell counts |
| Resolution order | Embark, air strikes, ranged fire, movement, ferry, cargo sync, melee, applied per beat with no production step (`buildResolutionOrderRule`) |
| Truncation clause | A destination beyond this beat's budget is clamped to the first reachable leg rather than rejected; when the planner cannot use the destination at all but a neighbouring footprint cell still closes on it, the engine may take that single step instead. Friendly stacking on that cell is legal. |

Carries `COMBAT_STATS`, `TACTICAL_RANGE_TABLE`, `ATTACK_ONE_PER_UNIT`, `WEGO_PHASE_ORDER`, `TEMPO_RANGED_SHOT`, `CASUALTY_PRIORITY`, `TACTICAL_MP_RULES`, `FIRST_LEG_TRUNCATION`, `LEGAL_DEST_OCCUPANCY`.

### 2.6 `# Commander's Briefing`

Include when a briefing body is supplied. If the briefing body cannot be built — which in current code means the map block came back empty — there is no tactical briefing at all and the consultation proceeds on the no-briefing path.

#### Narrative paragraph

At most five sentences. The first is always the beat number, own sub-unit count, and enemy sub-unit count with the note that visibility is full. The closing sentence directs the model to the tables and map and names only the actions available this beat: `explicit_move` and `ranged_attack` always; air strikes only when the opponent has air sub-units. Middle sentences report contact and critical threats. **Must not** mention standing orders or orderless units.

#### `## Unit Status and Threats`

Same six columns as strategic: `Unit ID`, `Type`, `Hex`, `Nearest enemy + distance`, `Threat severity`, `Action needed`.

- **No standing-order column.** Standing orders do not act in a beat, so a column for them would invite the model to rely on one. The row's current-order value is null by construction even when the parent unit has a standing order at strategic level.
- **No quiet annotation.** Every sub-unit in the footprint is in the battle; there is no rear area.
- **No distance-basis caveat line.** Distances here are res4 steps inside a small footprint.
- **Rows:** one per own sub-unit, uncapped.
- **Empty-state:** header row plus `(No AI units)`.

#### `## Attention Flags`

Bullet list, ranked, capped at five, empty form `None.` Tactical emits threat bullets and the aggregate armed-units bullet only. **Must not** emit standing-order warning bullets.

#### `# Operational Map`

- **Legend contract:** each cell shows its tactical code on the top line and terrain plus overlay on the bottom; `x` is land and `.` is water, taken from that res4 child's kind (not the enclosing res1 ocean); `*` marks own sub-units, `!` enemy sub-units, `#` contested; `A/a` airport, `S/s` seaport, `B/b` both, `U/u` urban; uppercase means the enclosing cell is AI-controlled; odd rows are indented one space; only codes from this map or the tables may be used. The undiscovered-intel marker is not part of the tactical legend.
- **Displaced-features footnote:** included when a unit overlay hides a feature marker; omitted when empty.
- **Empty footprint:** the map body states that there are no tactical cells to render.
- **Must not contain:** a unit-roster subsection.

#### `### Best Options This Turn`

- **Include:** when at least one option row exists; omit heading and table otherwise.
- **Columns:** identical to strategic.
- **Action values in battle:** `air strike`, `ranged`, `approach`, `ferry`, `move/melee`. A unit listed on an `air strike` row is not also listed on a `ferry` row this beat.
- **"This beat" legality:** move and approach targets are cells reachable this beat under the terrain-weighted budget, computed with the same planner the engine uses when it applies the order. Approach targets omit stay-put friendlies; a cell a friendly is leaving this period is listed. move/melee targets may be enemy-occupied. Ranged targets are enemy-occupied cells within reach. Air strike targets are enemy-occupied footprint cells, and are produced only when the parent cell's airport is intact. Ferry targets are other intact airport cells in the footprint.
- **Per-unit cap:** five rows per sub-unit before identical rows are merged; identical rows are merged and their sub-unit ids listed together.

#### `## Recent Turn Notes`

Include when at least one prior period in this battle has a message, strategy, or loss; omit otherwise. Scoped to this battle, not to the strategic timeline.

#### `## Active Callbacks`

- **Columns:** `Event`, `Details`.
- **Ids:** unit-scoped subscriptions use sub-unit ids. Subscriptions naming a unit that is not in this battle's roster are filtered out before the table is built, so every row the model sees is actionable.
- **Empty-state:** one row whose event cell is `—` and whose detail cell states that omitting callbacks or sending `[]` leaves no self-chosen triggers, so under event-driven policy only engine-forced consultations remain unless the model subscribes now.
- **Detail-cell contract:** as strategic — the parameters, not just the event name.

### 2.7 Always omitted in battle

Each row states what is omitted and why the model must not be given it.

| Omitted | Reason |
| --- | --- |
| `# Scenario Objective (Required)` | Regional victory is unreachable from inside a beat and would redirect the model away from the fight |
| Home-region bullets and explored/controlled progress | Same reason; also res1 data in a res4 prompt |
| `# Standing Order Status` and `## Units Without Standing Orders` | Standing orders do not act in a beat |
| `# Production Status` and every production clause | No production resolves during a beat |
| `# Your Strategic Memory` and every memory clause | Memory tools are not callable in battle and memory updates are not accepted |
| `## Supplemental Hex Intelligence` | Terrain in the footprint is already on the map and in the option rows |
| Straight-hop distance caveat | Its gate requires the strategic resolution |
| Unit-roster subsection | Duplicate of the unit table |
| Air-repositioning coaching | Strategic idle-air “ferry toward the fighting” coaching; battle lists airport ferry dests and strike-or-ferry exclusivity instead |
| Assessment and combat-estimate guidance | Those tools are stripped in battle |
| Scouting directive | Visibility in the footprint is complete |

**Forbidden strings.** A tactical prompt must not contain any of these, in any casing: `memoryUpdates`, `productionOrders`, `query_production`, `enemyIntel`, `set_build_queue`. These are the markers a strategic surface leaves behind when it leaks into a battle prompt, and their presence is a defect regardless of how the surrounding sentence reads.

### 2.8 `Strategic context:` block

Tactical variant, bullets in this order:

1. **Priority**, one line: engage enemy forces and inflict losses when advantageous.
2. **Strategy**, the same three doctrine lines as strategic.
3. **Message guidance**, identical to strategic.

**Must not** contain the goals list, the explored or controlled progress lines, the home-region bullets, or any claim about what the human player is doing.

### 2.9 `# Air Operations Status`

- **Include:** when the opponent has at least one air sub-unit in this battle. **Omit** the section otherwise, along with the strike list and every air clause.
- **Content:** the tactical air rules line — strikes may target enemy sub-units anywhere in this battle footprint, one air action per unit per beat — and a per-unit table of strike targets.
- **Omitted columns relative to strategic:** the strikeable-infrastructure columns. Infrastructure is not a strike target class inside a beat. Ferry dests appear on Best Options, not as extra Air Operations columns.

### 2.10 `# Naval Transport Status`

- **Include:** when the opponent has at least one naval sub-unit in this battle. **Omit** otherwise, along with the sealift actions.
- **Content:** embark rules, capacity, and a per-sub-unit table of what is aboard.
- **Omitted column relative to strategic:** the nearest embark cell. In a footprint the whole map is visible on one screen of text and the option rows already carry reachable cells.

### 2.11 `# Available Tools`

- **Enabled set in battle:** the routing tool and the distance tool, when planning tools are enabled. Everything else is stripped.
- **Intro:** points at the briefing for assessments and options, and states the copy-then-submit rule with the tactical field mapping.
- **Guidance bullets, in this order:**
  1. The briefing already contains unit status, attention flags, and this beat's options; the assessment and estimate tools must not be called because they are not available.
  2. Option targets are already this-beat legal; one row may name several sub-units; copy those ids into one `unitIds` array on a single envelope entry; a move or approach target into the move field; a ranged target into a `ranged_attack` entry; an air strike target into the strike list when air is present; and a ferry target into `ferryOrders`; each sub-unit gets at most one move and one shot, so pick one row per action type and do not copy overlapping rows; never copy a Target Hex from a row that does not list that sub-unit; route only for something unlisted; once destinations are chosen, submit.
  3. Standing-order actions are not accepted for sub-unit ids this beat, and standing orders do not move sub-units. A sub-unit with a move option and no order is idle for the beat.
  4. The tempo rule for the beat, per section 4 item 2.
  5. The sealift bullet, included only when the naval status section is present.
- **Empty-state:** the heading plus `No tools available.`

### 2.12 Observed enemy roster line

One line listing the enemy sub-units in the battle with their types and cells. Always included; in battle it is never empty while the battle is live.

### 2.13 Response envelope contract and example

Section 3. Always included; the example must match the contract. Example unit ids use the `example-` prefix with a `:slot` suffix so they cannot collide with live sub-unit ids. The strategy field is a plan for this **beat**, not this turn. The example is compact JSON with no markdown fence.

## 3. Tactical response envelope

### 3.1 Fields

`message`, `strategy`, `orders`, `airStrikes` when the opponent has air sub-units, `ferryOrders` when the opponent has air sub-units, and `callbacks`. **No `memoryUpdates` and no `productionOrders`**, in the contract, in the example, and in the repair schema.

### 3.2 Legal actions this beat

| Action | Required fields | Legality rules the prompt must state |
| --- | --- | --- |
| `explicit_move` | `unitId` or `unitIds`, `destination` | One tactical cell for this beat. Prefer an option-row target for those sub-units, or a routing-tool result. When the option row lists several ids, emit one entry with `unitIds`. A destination beyond the beat budget is clamped to the first reachable leg. Friendly stacking is legal; a cell holding an enemy is legal as move/melee contact. Embarked cargo debarks automatically before marching. |
| `ranged_attack` | `unitId` or `unitIds`, exactly one of a target cell code or a target sub-unit id | Legal for every type with a res4 reach, infantry included — not "ranged-only" units. One per sub-unit per beat, resolved from beat-start positions. |
| `airStrikes` entry | `unitId` or `unitIds`, exactly one of a target cell code or a target sub-unit id, `targetType` | Any footprint cell, subject to the parent airport being intact. One air action per sub-unit per beat. |
| `embark` | `unitId`, `navalUnitId` | Cargo assignment inside the footprint. |
| `transport_move` | `navalUnitId`, `destination` | Moves the transport and its cargo. |
| `disembark` | `unitId`, `destination` | Clears cargo and marches in one action. |
| `ferryOrders` entry | `unitId`, `destination` | Intact airport cells in the footprint. A sub-unit that strikes this beat must not also ferry; a ferry order for a striking sub-unit is discarded. |

**Forbidden:** the standing-order assignment and cancellation actions for sub-unit ids, memory updates, and production orders. The prompt states the standing-order prohibition explicitly, because the strategic habit of assigning missions is exactly what a model carries into a beat.

### 3.3 Option row to envelope field mapping

| Option row action | Envelope destination |
| --- | --- |
| `approach` | `explicit_move.destination` |
| `move/melee` | `explicit_move.destination` |
| `ranged` | a `ranged_attack` entry's target |
| `air strike` | an `airStrikes` entry's target |
| `ferry` | a `ferryOrders` entry's destination |

### 3.4 Invalid output rules the prompt must state

1. The top level is an object; a top-level array is invalid.
2. Standing-order assignment and cancellation for sub-unit ids are rejected this beat.
3. Memory updates and production orders are not accepted.
4. An entry missing a required field is dropped without comment.
5. More than one ranged action for the same sub-unit in the same beat is not honoured. When air is present, the same one-action limit applies to air strikes and ferry.
6. Strategic res1 codes, raw H3 strings, and coordinate pairs are never valid field values.
7. A ranged target must not be the acting sub-unit's own move destination.
8. Friendly stacking is legal; a cell holding an enemy is legal as move/melee contact.

## 4. Required tactical coaching

1. **Fire every beat.** Every sub-unit with a legal shot should be given a ranged action, and an air strike when air is present, with the model choosing each target, because attacks resolve from beat-start positions and never cost the move. The air half of this sentence is omitted when the opponent has no air sub-units. Carries `TEMPO_RANGED_SHOT`, `ATTACK_ONE_PER_UNIT`.
2. **Nothing moves unless ordered.** Standing orders do not move sub-units in battle, so a sub-unit with a move option and no order is idle for the beat. Carries `STANDING_ORDERS_INERT_IN_BATTLE`.
3. **Copy option rows.** Use the mapping in section 3.3, and route only for a destination the table does not list for that sub-unit. Never copy a Target Hex from a row that does not list that sub-unit; if the sub-unit has no row, call the routing tool or leave it idle. One row may name several sub-units; copy those ids into one `unitIds` array on a single envelope entry. Each sub-unit gets at most one move and one shot: pick one row per action type; do not copy overlapping rows that relist the same sub-unit. Carries `BEST_OPTIONS_ROWS`.
4. **Reach is limited and honest.** Infantry or armor already on urban or rubble has a one-point budget this beat. A destination beyond this beat's point budget is clamped to the first reachable leg, so ordering a far cell advances the sub-unit rather than failing, but it does not teleport it. The one-step fallback may enter a cell that already holds a friendly unit. Road and rail edges multiply remaining points. Carries `TACTICAL_MP_RULES`, `FIRST_LEG_TRUNCATION`, `LEGAL_DEST_OCCUPANCY`.
5. **Infantry and armor can shoot here, within terrain limits.** State the res4 infantry and armor baselines, the range-1 cap on forest/urban/rubble/transport, and mountain LOS, because the strategic rule is melee-only infantry and a model carrying baseline-5 armor into a beat will order illegal shots. Carries `TACTICAL_RANGE_TABLE`.
6. **Air strikes or ferry, not both.** An air sub-unit may hit any occupied footprint cell, or ferry to another intact airport cell in the footprint; that is its one air action for the beat. Carries `AIR_STRIKE_ENVELOPE`, `FERRY_DESTINATIONS`, `AIR_ORDER_RESTRICTIONS`.
7. **Target the weakest defender.** Same casualty rule as strategic. Carries `CASUALTY_PRIORITY`.
8. **Friendly stacking is legal; enemy cells are move/melee contact.** Same as strategic.
9. **Sealift works inside the footprint.** Included only when the naval status section is present. Carries `EMBARK_LEGALITY`, `EMBARK_STATE`.
10. **Callbacks use sub-unit ids and die with the battle.** Unit-scoped subscriptions name sub-units, the response replaces the whole list, subscriptions are evaluated after each beat under event-driven policy, and all of them are cleared when the battle ends. An empty Active Callbacks table means there are no self-chosen triggers; omitting callbacks or sending `[]` keeps it empty, so only engine-forced consultations remain unless the model subscribes now. Carries `CALLBACK_TACTICAL_SCOPE`, `CALLBACK_REPLACE_SEMANTICS`.
11. **A beat with no prompt is a beat not acted in.** Coaching says the model is consulted when a subscribed event fires; mandatory overrides also force consults (those ids are not listed). Standing orders are inert in battle, so an unconsulted beat is one where its sub-units did nothing. Carries `CONSULT_POLICY`, `STANDING_ORDERS_INERT_IN_BATTLE`.
12. **Keep the player-facing line clean.** Same message discipline as strategic. Carries `MESSAGE_DISCIPLINE`.

Claims the builders **omit** from tactical coaching:

- Any regional or home-region objective.
- Any suggestion that unfired shots will be taken anyway (`TEMPO_SWEEP_SILENCE`).
- Strategic idle-air “ferry toward the fighting / even on defend” coaching. Battle lists airport ferry dests and strike-or-ferry exclusivity instead.
- Any reference to production, memory, or standing-order assignment as something to do this beat.
- Engine-internal callback stash and restore behaviour. The model is told subscriptions are cleared when the battle ends.

## 5. Differences from the strategic contract, in one place

| Surface | Strategic | Tactical |
| --- | --- | --- |
| Goal | Win conditions and home regions | Defeat the forces in this battle |
| Coordinate registry | res1 codes | res4 codes in one footprint |
| Unit addressing | unit id | `parent:slot` sub-unit id |
| Infantry ranged | none | res4 baseline of two |
| Air ranged | strike radius of three from base | anywhere in the footprint |
| Air ferry | offered and coached | offered for intact airport cells in the footprint; not the 4-hex hop |
| Movement | per-turn cell budget | terrain-weighted point budget with first-leg clamping |
| Standing orders | central to the turn | inert and forbidden as actions |
| Production and memory | present when their tools are enabled | never |
| Visibility | fog-dependent | complete inside the footprint |
| Distance caveat line | present when distances are hop counts | never |
| Tools | up to nine | routing and distance only |
| Envelope tails | air, ferry, callbacks, memory, production | air, ferry, callbacks |
