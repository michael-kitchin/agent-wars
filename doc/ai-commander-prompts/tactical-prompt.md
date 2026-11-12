# Tactical prompt

The tactical beat system prompt as the builders emit it. The preamble states that the battle map is the enclosing strategic hex's tactical cells plus up to three neighboring rings, and that cells beyond a regional map's edge are not part of the battle. A formatted snapshot of one consultation is in [`example-tactical-prompt.md`](example-tactical-prompt.md). The runtime capture `debug-last-tactical-prompt-N.txt` is not a source for this catalog. N is `aiIndexForSeatId` of the seat being consulted. Opponent 1 writes `debug-last-strategic-prompt-1.txt`. If this file disagrees with the builders, the builders win.

Shared rules come from [`assembly-contract.md`](assembly-contract.md). Differences from the strategic contract are stated as differences; everything not called out here follows [`strategic-prompt.md`](strategic-prompt.md) only where [`assembly-contract.md`](assembly-contract.md) marks the section as shared.

## 1. Battle framing

1. **Two clocks.** The prompt states the strategic turn number, the tactical beat number, and the phase. A beat is a period inside one strategic turn, and the beat number is what "this beat" refers to everywhere else in the prompt. Carries `TURN_CLOCK`, `BATTLE_FRAME`.
2. **One footprint.** The battle occupies the enclosing strategic hex's tactical cells plus up to three neighboring rings. Cells beyond a regional map's edge are not part of the battle. Every cell code in the prompt belongs to that footprint. Carries `BATTLE_FRAME`, `HEX_IDENTITY`.
3. **Local goal only.** The goal statement is to engage and defeat the enemy forces present in this battle. The regional win conditions, home regions, and territorial progress must not appear. A model told to win the region during a beat will disengage to chase territory it cannot reach from inside the footprint. Carries `BATTLE_FRAME`.
4. **Sub-unit addressing.** Units in battle are sub-units, addressed as the parent unit id followed by a colon and a two-digit slot. Enemy sub-unit ids are legal target values. The parent strategic id is never a valid order target in a beat. Carries `SUBUNIT_IDENTITY`.
5. **Full visibility.** Both sides see every sub-unit in the footprint, and the narrative states this. Fog affects the strategic snapshot, not the battle. The straight-hop distance caveat is not emitted in battle, because its gate requires the strategic resolution. Carries `BATTLE_FRAME`.
6. **Movement is a point budget.** A sub-unit moves on a terrain-weighted movement-point budget. Clear of weather, that budget is two points for infantry, four for armor, three for naval, and air does not march. Infantry or armor whose **current** cell is urban or rubble has a one-point budget this beat, not the type baseline. Armor in forest is penalised to the infantry baseline. Entering an intact road cell costs half a point and an intact rail cell costs one third, for every terrain, for infantry and armor. That cell may be entered from a neighbor that is not on the line, including terrain the unit could not otherwise enter, and a blocked line cell may be left only onto terrain the unit can enter without a line or onto another intact line cell. Entering an urban cell with no road or rail costs 1. Rubble with no road or rail costs 2. Rubble on a road or rail costs 1 where the unit could already enter, and does not open blocked terrain. A non-air sub-unit always retains at least one point. Carries `TACTICAL_MP_RULES`.
7. **Infantry has reach here.** On the tactical grid every ground and naval type has a ranged reach: infantry two, armor five, naval ten, before terrain reduces it. Forest, urban, or rubble on the attacker's cell caps infantry and armor to range 1. A mountain cell between the shooter and the target blocks armor and naval. The cell the shooter stands on and the target cell do not. Infantry is exempt. Air strikes and ferry are not blocked by mountains. This is the opposite of the strategic rule and the prompt must state it explicitly rather than leaving the strategic melee-only sentence in place. Carries `TACTICAL_RANGE_TABLE`.
8. **Air strikes and drops anywhere in the battle.** An air sub-unit may strike or drop any cell in the footprint; the strategic three-cell strike radius does not apply. A drop onto a cell fortified by the other side is illegal. A drop onto an enemy cell is fought in melee if both remain. Ferry is one hop between intact airport cells. An air sub-unit carries one infantry sub-unit. Strike, drop, and ferry are mutually exclusive. Carries `AIR_STRIKE_ENVELOPE`, `TACTICAL_RANGE_TABLE`, `AIR_ORDER_RESTRICTIONS`.
9. **Standing orders are inert.** No standing order moves a sub-unit during a beat. A sub-unit the model does not order is a sub-unit that does not move. Carries `STANDING_ORDERS_INERT_IN_BATTLE`.

## 2. Section-by-section layout

Emit order. Sections shared with strategic keep the same heading strings; the differences are in the content.

### 2.1 Role line

Same role sentence as strategic, with no clock on that line. The beat clock is the first line under `# Current Situation`: `Strategic turn: {N}, date: {D}, tactical beat: {B}, phase: {P}.` The date clause is omitted when `currentDateLabel` is absent. When the battle is AI-only and the match stored a numeric beat limit, the next paragraph is `Beats left before this battle ends on its own: {M}. This count is 0 on the last beat. This beat still resolves, and the battle ends after the beat where the count is 0. Use the beats you have on the fight in front of you.` M is `aiOnlyBeatsLeft` of the beat and `aiOnlyBeatLimit` (`formatAiOnlyBeatsLeftPrompt`). A human battle and an unlimited limit omit that paragraph. It stays in the situation message, so the cached system text does not change with the count. The role line names the consulted commander's side. In an AI-only battle each commander is briefed as its own side, with its own sub-units as "yours".

### 2.2 Goal statement

The battle-local goal from section 1.3, followed by a pointer to the rules below. **Must not** contain win conditions, home regions, or scenario text.

### 2.3 Situational directives

- **Scouting directive:** never. Visibility inside the footprint is complete, so there is nothing to scout.
- **Tool-budget warning:** the same sentence as strategic, in the situation message, on the same condition.

### 2.4 Coordinate preamble

Two paragraphs. First: the battle map is the enclosing strategic hex's tactical cells plus up to three neighboring rings, cells beyond a regional map's edge are not part of the battle, positions are two-character tactical codes taken from the map and the unit table, copied exactly and never invented, distances are tactical hex steps. Second: in the response, cells are tactical codes and target-unit values are enemy sub-unit ids; raw H3 strings and coordinate pairs are never emitted. Carries `HEX_IDENTITY`, `SUBUNIT_IDENTITY`.

### 2.5 `# Rules`

Same subsection order as strategic section 1.5. A battle omits Production, Holding Fire, and the strategic missile employment subsection. `## Rule Lookup` is present when the `rules` tool is on. Substitutions:

| Clause | Tactical value |
| --- | --- |
| Per-type reach | Tactical reaches from `RANGED_RANGE_BY_UNIT_TYPE` for the types present on either side; an empty or unknown roster names every type. Air is stated as striking anywhere in the battle rather than as a numeric reach |
| Infantry clause | Infantry and armor fire at res4 baselines; forest, urban, or rubble on the attacker caps them to range 1. A mountain cell between the shooter and the target blocks armor and naval, and the cells they stand on do not, only when either side has armor or naval; infantry is exempt; air strikes and ferry are not blocked by mountains. Close to melee when out of reach |
| Movement budgets | The point budget from section 1.6: clear-of-weather type baselines, origin urban/rubble collapsing infantry and armor to one point, forest penalty for armor, intact line enter costs for infantry and armor, the roadless urban enter cost, and rubble enter costs; not the strategic per-turn cell counts. Weather changes to those budgets are the weather-bonus row |
| Resolution order | Embark, air strikes, air drops, ranged fire, movement, ferry, cargo sync, melee, applied per beat with no production step (`buildResolutionOrderRule`). Missile launches are not in this list |
| Missile employment | When the roster has a missile sub-unit, `buildMissileEmploymentRule` adds `Missile sub-units never move or fire.` The casualty sentence says missiles are hit last only when either side has a missile |
| Truncation clause | A destination beyond this beat's budget is clamped to the first reachable leg rather than rejected; when the planner cannot use the destination at all but a neighbouring footprint cell still closes on it, the engine may take that single step instead. When that shortened step is not the ordered cell and the sub-unit can already shoot an enemy from its current cell, the move is dropped and the sub-unit stays there, unless the shortened step enters a cell that holds an enemy. Friendly stacking on that cell is legal. |
| Origin bonus | Included when either bonus flag is on. Country: a unit on a cell in the area where it was built adds 2 (Low) or 4 (High) to every value it rolls there. That area is its birth country in a global game and its origin area in a regional game. Terrain: the same for a cell whose terrain kind matches its birth terrain kind, with urban and rubble ignored. The terrain clause ends with the terrain-bonus movement sentence (`TERRAIN_BONUS_MOVEMENT_PROMPT_SENTENCE` in `src/shared/terrainBonusMarch.ts`) when the consulted side has armor, or naval born on wetlands. Unknown birth terrain includes that sentence. It says armor may enter one cell of a birth terrain kind it otherwise cannot enter, other than water, and a wetlands-born naval unit one wetlands cell; the entry ends the beat there; routes and beat estimates use it only when it arrives in fewer beats; roads, rails, urban, rubble, and seaport rules are unchanged. Both on: the bonuses do not stack, and the sentence names the larger amount as the most. Air qualifies by its base cell when the opponent has air. Casualty order keeps the printed defense values (`buildOriginBonusRule`) |
| Tech bonus | Included only when the tech bonus is on (`buildTechBonusRule`). An Advanced unit, born in a hex with at least the loaded map's Advanced threshold (21 urban cells on the global map), adds 2 to its attack at Low and High, and also 2 to its defense at High. A Basic unit adds nothing. At Low, the tech bonus does not change defense. Casualty order keeps the printed defense values. The Unit Status Bonus column names the clause |
| Weather bonus | Included when the weather bonus is on and the battle's weather is not mild (`buildWeatherRule`). Missing weather includes the rules. Mild omits them and omits the Unit Status Weather column. The text does not contain the strategic armor and naval movement sentence or the strategic ferry sentence. The air-strike penalty sentence is included only when the consulted side has air. The turn line names the strategic date. A global date reads `November, Year 3`. A regional date reads `November 22nd, Year 1`. Weather changes when that date enters a new month. The battle uses the enclosing hex's weather for every beat. When the column is shown, it names that weather, with birth tags in parentheses. Armor and naval budgets drop in weather they lack (at Low, armor in snow or rain and naval in snow, to 2; at High, armor also in heat and naval also in rain, to 1), infantry pays 2 to enter open ground in snow or rain, and armor ranged attack is lower in snow or heat (3 at Low, 5 at High). One sentence states that none of these penalties applies to a unit tagged for that weather. |
| Terrain cover | Always included (`buildTerrainCoverRule`), naming cells instead of hexes and adding urban and rubble: ranged fire at a forest, mountain, urban, or rubble cell needs a roll 2 lower, or 1 lower for wetlands; an air strike on units in a forest, urban, or rubble cell needs a roll 1 lower; melee, return fire, anti-air fire, and shots at infrastructure ignore cover. A cell without its own terrain kind uses the battle hex's kind |

Carries `COMBAT_STATS`, `TACTICAL_RANGE_TABLE`, `ATTACK_ONE_PER_UNIT`, `WEGO_PHASE_ORDER`, `TEMPO_RANGED_SHOT`, `CASUALTY_PRIORITY`, `ORIGIN_BONUS`, `TECH_BONUS`, `TERRAIN_COVER`, `TACTICAL_MP_RULES`, `FIRST_LEG_TRUNCATION`, `LEGAL_DEST_OCCUPANCY`.

### 2.6 `# Commander's Briefing`

Include when a briefing body is supplied. If the briefing body cannot be built — which in current code means the map block came back empty — there is no tactical briefing at all and the consultation proceeds on the no-briefing path.

#### Narrative paragraph

At most five sentences. The first is always the beat number, own sub-unit count, and enemy sub-unit count with the note that visibility is full. The closing sentence directs the model to the tables and map and names only the actions available this beat: `explicit_move` and `ranged_attack` always; air strikes only when the opponent has air sub-units. Middle sentences report contact and critical threats. **Must not** mention standing orders or orderless units.

#### `## Unit Status and Threats`

Same six columns as strategic: `Unit ID`, `Type`, `Hex`, `Nearest enemy + distance`, `Threat severity`, `Action needed`. When an origin bonus flag or the tech bonus is on, a `Bonus` column follows `Hex`. Origin reads `+2 origin`, `+2 terrain`, `+2 origin, terrain`, or the number 4 when the larger applicable level is High. Tech appends `tech +2 attack` at Low, or `tech +2 attack and defense` at High, for an Advanced sub-unit. A row with neither reads `—`.

- **Weather column.** Follows `Bonus` when the weather rules are in the combat paragraph. Mild weather omits it. The cell names the battle weather, with birth tags in parentheses.
- **No standing-order column.** Standing orders do not act in a beat, so a column for them would invite the model to rely on one. The row's current-order value is null by construction even when the parent unit has a standing order at strategic level.
- **No quiet annotation.** Every sub-unit in the footprint is in the battle; there is no rear area.
- **No distance-basis caveat.** Distances here are res4 steps inside a small footprint. `# Reading the Briefing` still carries `## Map Legend` and `## Best Options Odds`, and `## Air Operations Table` or `## Transport` when the battle roster has that arm.
- **Rows:** one per own sub-unit, uncapped.
- **Empty-state:** header row plus `(No AI units)`.

#### `## Attention Flags`

Bullet list, ranked, capped at five, empty form `None.` Tactical emits threat bullets and the aggregate armed-units bullet only. **Must not** emit standing-order warning bullets. The armed-units bullet names sub-units that can order a ranged attack or an air strike this beat, and tells the model to copy a Best Options row for each and not invent a target. When an air shooter is on that list, the clause names a ranged or air-strike row. A sub-unit whose only legal fight is melee is left off that bullet.

#### `## Operational Map`

- **Example:** one rendered grid from a single consultation is in [`example-tactical-prompt.md`](example-tactical-prompt.md).
- **Legend contract:** the legend is `## Map Legend` in the system prompt, not beside the fence. Each cell shows its tactical code on the top line and terrain plus overlay on the bottom; `x` is land and `.` is water, taken from that cell's own kind, including a margin cell (not the enclosing hex's ocean); `-` is an empty overlay, so bare land is `x-` and bare water is `.-`; `*` marks own sub-units, `!` enemy sub-units, `#` contested; `A/a` airport, `S/s` seaport, `B/b` both, `U/u` urban, and `F/f` fortified city cell (`FORTIFIED_MAP_LEGEND_FRAGMENT`, always printed so the cached legend does not change when a cell is fortified); a fortified cell shows `F` or `f` in place of `U` or `u`; uppercase means the enclosing cell is AI-controlled; odd rows are indented one space, and a crop keeps that indent when its first row was indented on the full footprint; only codes from this map or the tables may be used. The undiscovered-intel marker is not part of the tactical legend.
- **Displaced-features footnote:** included when a unit overlay hides a feature marker; omitted when empty.
- **Window:** the rendered grid is the cells within two grid steps of any sub-unit, plus every Best Options target that is inside the footprint. When that set is smaller than the footprint, the map section adds `Shown: N of M cells around your units and the listed targets.` When `get_map` is enabled, that line also says to call `get_map(center, radius)` for cells outside the window. A row that is indented on the full footprint stays indented in the crop.
- **Empty footprint:** the map body states that there are no tactical cells to render.
- **Must not contain:** a unit-roster subsection.

#### `### Best Options This Turn`

- **Include:** when at least one option row exists; omit heading and table otherwise.
- **Columns:** identical to strategic, including `Odds`, the approach Target Units cap of three ids plus ` +N more`, and the `Target Infrastructure` cell contract (`|` is written as a space; an `air strike` row then omits text from `; strike:` onward; a cell with no `; strike:` suffix is otherwise unchanged; an empty cell is an em dash). `Odds` is `Kill: N%, Hurt: N%, Loss: N%` for a ranged or move/melee row, from `probabilityDefenderEliminated`, `probabilityAtLeastOneHit`, and `probabilityAttackerLosesUnit` with every listed unit attacking together. An air strike, air drop, approach, ferry, uncontested, or failed estimate is an em dash.
- **Action values in battle:** `air strike`, `air drop`, `ranged`, `approach`, `ferry`, `move/melee`. A unit listed on an `air strike` row is not also listed on a `ferry` row this beat. An `air drop` row is added beside the strike or ferry row when that air sub-unit has infantry aboard, or when an unembarked friendly infantry sub-unit shares its cell. The lead side of an AI-only battle is the exception: its embark is applied after the drop, so it lists a drop only when the infantry is already aboard. The model picks one of air strike, air drop, and ferry.
- **"This beat" legality:** move and approach targets are cells reachable this beat under the terrain-weighted budget, computed with the same planner the engine uses when it applies the order. With the terrain bonus on, that reach includes one cell of the unit's birth terrain that it otherwise could not enter, and nothing past that cell in the same beat. Approach targets omit stay-put friendlies; a cell a friendly is leaving this period is listed. move/melee targets may be enemy-occupied. Ranged targets are enemy-occupied cells within reach. Air strike targets are enemy-occupied footprint cells, and are produced only when the parent cell's airport is intact. Air drop targets are footprint cells that hold an enemy sub-unit, or urban cells whose enclosing hex is not controlled by the air unit's owner. A cell outside the footprint, the air unit's own cell, a cell another owner fortified, a cell that blocks infantry entry, and rubble are not drop targets. The drop does not require the air sub-unit to sit on an airport cell. Ferry targets are other intact airport cells in the footprint.
- **Per-unit cap:** five target hexes per sub-unit. Each distinct action on a hex is its own row, in the order air strike, air drop, ranged, approach, ferry, then move/melee. Identical rows are merged and their sub-unit ids listed together. A sub-unit may use the same hex as its move and its ranged target; the shot resolves first (`buildAttackConstraintsClause`). An air drop ranks with an air strike for that cap (`tempoActionRankForRowPriority`).

#### `## Recent Turn Notes`

Include when at least one of the previous ten periods in this battle has a message, strategy, or loss (`RECENT_TURN_NOTES_LIMIT`); omit otherwise. The blocks are those periods in ascending order, labeled `Turn N:`. Scoped to this battle, not to the strategic timeline.

#### `## Active Callbacks`

- **Columns:** `Event`, `Details`.
- **Ids:** unit-scoped subscriptions use sub-unit ids. Subscriptions naming a unit that is not in this battle's roster are filtered out before the table is built, so every row the model sees is actionable.
- **Empty-state:** one row whose event cell is `—` and whose detail cell is `None.` The callbacks coaching bullet states the empty-list rule.
- **Detail-cell contract:** as strategic — the parameters, not just the event name.

### 2.7 Always omitted in battle

Each row states what is omitted and why the model must not be given it.

| Omitted | Reason |
| --- | --- |
| `# Scenario Objective (Required)` | Regional victory is unreachable from inside a beat and would redirect the model away from the fight |
| Home-region bullets and explored/controlled progress | Same reason; also res1 data in a res4 prompt |
| `## Standing Order Status` and `### Units Without Standing Orders` | Standing orders do not act in a beat |
| `## Production Status` and every production clause | No production resolves during a beat |
| `## Your Strategic Memory` and every memory clause | Memory tools are not callable in battle and memory updates are not accepted |
| `## Supplemental Hex Intelligence` | Terrain in the footprint is already on the map and in the option rows |
| Straight-hop distance caveat | Its gate requires the strategic resolution |
| Unit-roster subsection | Duplicate of the unit table |
| Air-repositioning coaching | Strategic idle-air “ferry toward the fighting” coaching; battle lists airport ferry dests and strike-or-ferry exclusivity instead |
| Strategic assessment and combat-estimate hints | Battle guidance has its own `assess_unit` and `estimate_combat` bullets (section 2.11), and `assess_hex` is stripped in battle |
| Scouting directive | Visibility in the footprint is complete |

**Forbidden strings.** A tactical prompt must not contain any of these, in any casing: `memoryUpdates`, `productionOrders`, `query_production`, `enemyIntel`, `set_build_queue`. These are the markers a strategic surface leaves behind when it leaks into a battle prompt, and their presence is a defect regardless of how the surrounding sentence reads.

### 2.8 `# Battle Context`

Tactical variant, bullets in this order:

1. **Priority**, one line: engage enemy forces and inflict losses when advantageous.
2. **Strategy**, the same three lines as strategic, with `beat` in place of `turn`. Balanced, Aggressive, and Cautious each add the same doctrine block strategic adds, immediately after the strategy list. A battle does not name the campaign target.
3. **Message guidance**, identical to strategic.

**Must not** contain the goals list, the explored or controlled progress lines, the home-region bullets, the Sides table, or any claim about what an enemy is doing.

### 2.9 `# Air Operations Status`

- **Include:** when the opponent has at least one air sub-unit in this battle. **Omit** the section otherwise, along with the strike list and every air clause.
- **Content:** own and enemy air counts and a per-unit table. The tactical air-rules sentence is `## Air Operations Table`. Columns are `Unit ID`, `Hex`, `Aboard`, `Enemy Unit Targets`. `Aboard` is the infantry sub-unit id, or `none`.
- **Omitted columns relative to strategic:** base intact, base controlled, and the strikeable-infrastructure columns. Infrastructure is not a strike target class inside a beat. Ferry dests appear on Best Options, not as extra Air Operations columns.

### 2.10 `# Naval Transport Status`

- **Include:** when the opponent has at least one naval sub-unit in this battle. **Omit** otherwise, along with the sealift actions.
- **Content:** a per-sub-unit table of what is aboard. The tactical sealift sentence and the airlift sentence are `## Transport`. Air without ships omits this heading.
- **Omitted column relative to strategic:** the nearest embark cell. In a footprint the whole map is visible on one screen of text and the option rows already carry reachable cells.

### 2.11 `# Available Tools`

- **Enabled set in battle:** the routing tool, the distance tool, `get_map`, and `rules` when planning tools are enabled, `assess_unit` when assessment tools are enabled, and `estimate_combat` when estimation tools are enabled. `assess_hex` and the memory, standing-order, and production tools are stripped. A strategic consult also offers `get_map`, clipped to the loaded strategic cells. When `rules` is enabled, the combat-rules section ends by telling the model to call `rules(topic)` for a rule that is not printed above.
- **Tool lines:** `assess_unit` and `estimate_combat` use battle-specific lines. `assess_unit` reports which enemies the sub-unit can shoot and which can shoot it this beat, whether it can make melee contact this beat, and beats to reach each nearby unit. `estimate_combat` predicts ranged or melee engagements under battle range, terrain, and line-of-sight rules from beat-start positions, and does not cover air strikes. `plan_route` keeps the ferry-into-`ferryOrders` clause and omits `AIR_PLAN_ROUTE_PROMPT_SUFFIX`.
- **Intro:** points at the briefing for assessments and options, and states the copy-then-submit rule with the tactical field mapping. It names the routing tool only when planning tools are enabled.
- **Tool lines under `## How to Use These Tools Effectively`** (`buildToolUsageGuidance`), in this order:
  1. The briefing in the situation message already contains unit status, attention flags, and this beat's options.
  2. When assessment tools are enabled: `assess_unit` is optional. Call it only when the briefing does not show what that sub-unit can reach or shoot. On a shared cell, assess one sub-unit per parent.
  3. Independent calls to the same tool, such as routes for several sub-units, go together in one reply as parallel tool calls; wait for a result only when the next call's arguments depend on it.

  The `estimate_combat` tool line itself says Best Options already gives Odds for a listed fight, and to use the tool for a fight the table does not list.
- **`# Orders Guidance`**, after the tools section (`buildTacticalCoachingSections`). Subsections, in this order, each omitted when it has no bullet:
  1. Using the Briefing: the tempo rule (section 4 item 1), standing orders inert (item 2), copy option rows (item 3), and the clamped destination (item 4). The copy bullet maps a move or approach target into the move field, a ranged target into a `ranged_attack` entry, and, when air is present, an air strike, air drop, or ferry target into its list. An air sub-unit picks only one of air strike, air drop, and ferry, and embarks one infantry sub-unit from its cell in the same orders when Aboard is none.
  2. Air and Naval Units: the air bullet when air is present (item 5), and the sealift bullet when the naval status section is present (item 6).
  3. Callbacks and Messages: callbacks (item 7), the unconsulted beat (item 8), message discipline (item 9), and leaving a decided battle when it applies (item 10).
- **Empty-state:** the heading plus `No tools available.`

### 2.12 Observed enemy roster line

One line listing the enemy sub-units in the battle with their types and cells. Always included; in battle it is never empty while the battle is live.

### 2.13 Response envelope contract and example

Section 3. Always included; the example must match the contract. Example unit ids use the `example-` prefix with a `:slot` suffix so they cannot collide with live sub-unit ids. The strategy field is a plan for this **beat**, not this turn. The example is compact JSON with no markdown fence. When the request attaches the JSON schema, the skeleton line and the strict-schema line are omitted; the field meanings, the action list, and the example stay.

## 3. Tactical response envelope

### 3.1 Fields

`message`, `strategy`, `orders`, then `exitBattle` when the battle is between two AI commanders, then `airStrikes` when the opponent has air sub-units, `ferryOrders` when the opponent has air sub-units, `airDrops` when the opponent has air sub-units, and `callbacks`. **No `missileLaunches`, no `memoryUpdates`, and no `productionOrders`**, in the contract, in the example, and in the repair schema. A human-versus-AI battle omits `exitBattle`. When it is present it is a required boolean, and the repair example sets it to false.

### 3.2 Legal actions this beat

| Action | Required fields | Legality rules the prompt must state |
| --- | --- | --- |
| `explicit_move` | `unitId` or `unitIds`, `destination` | One tactical cell for this beat. Prefer an option-row target for those sub-units, or a routing-tool result. When the option row lists several ids, emit one entry with `unitIds`. A destination beyond the beat budget is clamped to the first reachable leg, and one on the sub-unit's current cell is ignored as already arrived; the unit holds. When that shortened step is not the ordered cell and the sub-unit can already shoot an enemy from its current cell, the move is dropped and the sub-unit stays there, unless the shortened step enters a cell that holds an enemy. Friendly stacking is legal; a cell holding an enemy is legal as move/melee contact. Embarked cargo debarks automatically before marching. |
| `ranged_attack` | `unitId` or `unitIds`, exactly one of a target cell code or a target sub-unit id | Legal for every type with a res4 reach, infantry included — not "ranged-only" units. One per sub-unit per beat, resolved from beat-start positions. |
| `airStrikes` entry | `unitId` or `unitIds`, exactly one of a target cell code or a target sub-unit id, `targetType` | Any footprint cell, subject to the parent airport being intact. One air action per sub-unit per beat. |
| `embark` | `unitId`, `navalUnitId` | Cargo assignment inside the footprint. |
| `transport_move` | `unitId` or `unitIds`, `navalUnitId`, `destination` | Moves the transport and its cargo. |
| `disembark` | `unitId`, `destination` | Clears cargo and marches in one action. |
| `airDrops` entry | `unitId` or `unitIds`, `destination` | A footprint cell that can receive infantry. Present when the opponent has air sub-units. One air action per sub-unit: strike, drop, or ferry. |
| `ferryOrders` entry | `unitId`, `destination` | Intact airport cells in the footprint. A sub-unit that strikes this beat must not also ferry; a ferry order for a striking sub-unit is discarded. A drop and a ferry cannot both be ordered. |

**Forbidden:** the standing-order assignment and cancellation actions for sub-unit ids, missile launches, memory updates, and production orders. The prompt states the standing-order prohibition explicitly, because the strategic habit of assigning missions is exactly what a model carries into a beat.

### 3.3 Option row to envelope field mapping

| Option row action | Envelope destination |
| --- | --- |
| `approach` | `explicit_move.destination` |
| `move/melee` | `explicit_move.destination` |
| `ranged` | a `ranged_attack` entry's target |
| `air strike` | an `airStrikes` entry's target |
| `air drop` | an `airDrops` entry's `destination` |
| `ferry` | a `ferryOrders` entry's destination |

### 3.4 Invalid output rules the prompt must state

1. The top level is an object; a top-level array is invalid.
2. Standing-order assignment and cancellation for sub-unit ids are rejected this beat.
3. Memory updates and production orders are not accepted.
4. An entry missing a required field is dropped without comment.
5. More than one ranged action for the same sub-unit in the same beat is not honoured. When air is present, the same one-action limit applies to air strike, air drop, and ferry.
6. Strategic res1 codes, raw H3 strings, and coordinate pairs are never valid field values.
7. Friendly stacking is legal; a cell holding an enemy is legal as move/melee contact.
8. An explicit_move to the sub-unit's current cell is ignored as already arrived; the unit holds.

## 4. Required tactical coaching

Printed by `buildOrdersGuidanceSection` under `# Orders Guidance`.

1. **Fire every beat.** Copy a listed shot from Best Options unless its Odds show Kill below 50% and Loss at least 50%. An em dash is not that case, so an air-strike row is still copied. A shot resolves from the beat-start position and does not use the move. The model must not invent a target the table does not list. The air-strike half of this sentence is omitted when the opponent has no air sub-units. Carries `TEMPO_RANGED_SHOT`, `ATTACK_ONE_PER_UNIT`.
2. **Nothing moves unless ordered.** Standing orders do not move sub-units in battle, so a sub-unit with a move option and no order is idle for the beat. Carries `STANDING_ORDERS_INERT_IN_BATTLE`.
3. **Copy option rows.** Use the mapping in section 3.3, and route only for a destination the table does not list for that sub-unit. Never copy a Target Hex from a row that does not list that sub-unit; if the sub-unit has no row, call the routing tool or leave it idle. One row may name several sub-units; copy those ids into one `unitIds` array on a single envelope entry. Each sub-unit gets at most one move and one shot: pick one row per action type; do not copy overlapping rows that relist the same sub-unit. Carries `BEST_OPTIONS_ROWS`.
4. **A too-far destination is clamped.** A destination beyond this beat's point budget is clamped to the first reachable leg. When that shortened step is not the ordered cell and the sub-unit can already shoot, the move is dropped unless the step enters a cell that holds an enemy. Road, rail, urban, and rubble enter costs, and the one-point budget on urban or rubble, stay in the combat rules paragraph. Carries `FIRST_LEG_TRUNCATION`.
5. **Air strikes or ferry, not both.** An air sub-unit may hit any occupied footprint cell, or ferry to another intact airport cell in the footprint; that is its one air action for the beat. Carries `AIR_STRIKE_ENVELOPE`, `FERRY_DESTINATIONS`, `AIR_ORDER_RESTRICTIONS`.
6. **Sealift works inside the footprint.** Included only when the naval status section is present. Carries `EMBARK_LEGALITY`, `EMBARK_STATE`.
7. **Callbacks use sub-unit ids and die with the battle.** Unit-scoped subscriptions name sub-units, the response replaces the whole list, subscriptions are evaluated after each beat under event-driven policy, and all of them are cleared when the battle ends. An empty Active Callbacks table means there are no self-chosen triggers; omitting callbacks or sending `[]` keeps it empty, so only engine-forced consultations remain unless the model subscribes now. Carries `CALLBACK_TACTICAL_SCOPE`, `CALLBACK_REPLACE_SEMANTICS`.
8. **A beat with no prompt is a beat not acted in.** Coaching says the model is consulted when a subscribed event fires or when the engine forces a consultation. Standing orders are inert in battle, so an unconsulted beat is one where its sub-units did nothing. Carries `CONSULT_POLICY`, `STANDING_ORDERS_INERT_IN_BATTLE`.
9. **Keep the player-facing line clean.** Same message discipline as strategic. Carries `MESSAGE_DISCIPLINE`.
10. **Leave when the battle is already decided.** Included only when the battle is between two AI commanders. The sentence is: set `exitBattle` to true when your side has an overwhelming numerical advantage, or when you have no order you can legally give, and set it to false otherwise. Orders in this reply still resolve for this beat.

Claims the builders **omit** from tactical coaching:

- Any regional or home-region objective.
- Any suggestion that unfired shots will be taken anyway (`TEMPO_SWEEP_SILENCE`).
- Strategic idle-air “ferry toward the fighting / even on defend” coaching. Battle lists airport ferry dests and strike-or-ferry exclusivity instead.
- Infantry and armor tactical baselines, the range-1 cap, and the mountain line-of-sight sentence. The combat rules paragraph states them.
- Casualty order and friendly stacking. The combat rules paragraph states them.
- Any reference to production, memory, or standing-order assignment as something to do this beat.
- Engine-internal callback stash and restore behaviour. The model is told subscriptions are cleared when the battle ends.

## 5. Differences from the strategic contract, in one place

| Surface | Strategic | Tactical |
| --- | --- | --- |
| Goal | Win conditions and home regions | Defeat the forces in this battle |
| Coordinate registry | Loaded match's strategic cells; a new match replaces them | That battle's tactical children; a new match drops them |
| Unit addressing | unit id | `parent:slot` sub-unit id |
| Infantry ranged | none | res4 baseline of two |
| Air ranged | strike radius of three from base | anywhere in the footprint |
| Air ferry | offered and coached | offered for intact airport cells in the footprint; not the 4-hex hop |
| Movement | per-turn cell budget | terrain-weighted point budget with first-leg clamping |
| Standing orders | central to the turn | inert and forbidden as actions |
| Production and memory | present when their tools are enabled | never |
| Visibility | fog-dependent | complete inside the footprint |
| Distance caveat line | present when distances are hop counts | never |
| Tools | up to nine | routing, distance, `assess_unit`, and `estimate_combat` (no air strikes), per tool-group toggles |
| Envelope tails | air, ferry, missile launches when the roster has a missile, callbacks, memory, production | air, ferry, callbacks. No `missileLaunches` |
| Fortification rule | Always, from `buildFortificationRule` | The tactical sentence from `buildFortificationRule` only when `hasFortifiedCells` is true: `F` is yours, `f` is the enemy's, enemy units cannot enter, a fortified cell absorbs one hit on its owner's units, and fire removes the fortification first |
