# Example strategic prompt

One strategic consultation, laid out for reading. The operational map is in a code block so its columns stay aligned. The closing JSON example is indented here; the builders print that object on one line.

This reading copy was edited to match the builders rather than captured. The system message comes first, then the fixed lead-in, then the situation message. The catalog is [strategic-prompt.md](strategic-prompt.md). The builders under `src/main/openRouter/` win if this copy disagrees with them. The reply is [example-strategic-response.md](example-strategic-response.md).

The operational map below is one connected area. The builders print one fenced block per area. When the window is smaller than the loaded set they add `Shown: N of M cells in K areas around your units, visible enemies, your cities, and the listed targets.` and, when `get_map` is enabled, `Call get_map(center, radius) for cells outside this window.`

---

# Your Command

You command Northern America in a WEGO (simultaneous movement) hex wargame with 2 sides. Every other side is your enemy, and so are neutral garrisons.

Your goal is to be the last side standing. A side is knocked out when one other side controls its home region (see the share below), when its home region has no cities left, or when it holds no city hexes anywhere. A knocked-out side's units become neutral garrisons and its land becomes neutral.

If every side would be knocked out on the same turn, none is knocked out and the match ends. The side holding the most city hexes wins. If several sides hold that many, no single side wins. Enemy units can be destroyed through ranged and melee combat, and production capacity can be destroyed through air strikes. Review the rules, below, for how to order this.

# Scenario Objective (Required)

- Scenario: region_vs_region
- Your home region: Northern America
- Enemy home regions: South America
- Win at end of turn by either:
    (1) Controlling all hexes intersecting the enemy home region, OR
    (2) Eliminating all urban production (tactical urban hexes) in the enemy home region.
- Every home-region outline is always visible on the map.

- Your home region hexes are: AC, AH, AO, AP, AV, AE, AZ, BL, AQ, BA, AW, AJ, BH, BU, BT, B6, AT, A5, A2, BQ, CM, B0, CO, A3, BV, A7, BY, B8, CJ, CU, A8, BI, BO, CC, DQ, B3, CR, B9, DC, CN, DY, ER, EE, E3, CW, DN, DB, EG, DW, DD, FS, E0, EH, FE, EJ, FH, DK, DJ, GZ, FZ, GL, FO, G2, G9, GQ, F9, GF, FQ, HL
- South America home region hexes are: IW, K5, KG, J9, J0, K2, KQ, LP, JN, I8, LA, K7, MT, L4, L7, OL, NQ, NS, NL, MM, MQ, LY, O5, N9, OG, N1, OZ, MB, NC, M0, P2, PE, QR, PW, P7, PB, RZ, RB, QW, RA, RU, RV, SL, PT, QJ, QI, S8, SF, TY, SX, T5, TN, S2, VC, UO, UT, VH

## Sides

| Side | Unit id prefix | Home region | Status |
| --- | --- | --- | --- |
| Northern America (you) | a1 | Northern America | Active |
| South America | h1 | South America | Active |

# Coordinates

Global Earth map, H3 resolution 1. Positions are two-character briefing hex codes (A–Z and 0–9) from the operational map and Unit Status table — copy exactly; never invent codes. Distances are hex counts where shown.

Final JSON: use briefing hex codes for cells; standing-order pursue uses enemy unit id (targetUnitId). Never emit raw H3 strings or latitude/longitude pairs.

# Rules

## Combat

Combat: d20 per shot — an attack hits on a roll at or below its attack value and a defensive melee roll hits at or below its defense value, after the changes below. Penalties and cover never lower an attack value below 2 before bonuses, and no value exceeds 17. infantry: 3 attack / 7 defense, melee only; armor: 10 attack / 7 defense, range 1; naval: 7 attack / 7 defense, range 2; air: 10 attack / 3 defense, range 3.

Hits land on the lowest-defense unit in the target stack first, then in the fixed type order infantry, armor, naval, air. Missiles are always hit last.

## Bonuses

Origin bonus is on: a unit in a hex in the area where it was built adds 2 to every attack or defense value it rolls there, including ranged fire, return fire, melee, and air-strike counter-fire. That area is its birth country in a global game and its origin area in a regional game. An air unit qualifies by the hex of its base, whatever it strikes. Casualty order still uses the printed defense values.

Tech bonus is on. An Advanced unit, born in a hex with at least 21 urban cells, adds 2 to its attack. A Basic unit adds nothing. The tech bonus does not change defense. Casualty order still uses printed defense.

## Weather

Weather bonus is on: the date is on the turn line, weather changes when that date enters a new month, and every beat of a battle shares the enclosing hex's weather.

Armor strategic movement is 1 in snow or rain, and naval strategic movement is 1 in snow. In battle, armor's point budget is 2 in snow or rain and naval's is 2 in snow; infantry pays 2 to enter open ground in snow or rain.

Armor ranged attack is 3 lower in snow or heat, including return fire and air-strike counter-fire. An air strike is 3 lower once when its base or its target is snow, rain, or heat the unit lacks. A strategic ferry into snow is 2 hexes.

None of these penalties applies to a unit tagged for that weather; a tag is earned by the birth hex. Weather does not change defense, melee, or casualty order.

The Unit Status Weather column names the weather where that unit stands. Birth tags, when the unit has any, follow in parentheses.

## Terrain Cover

Terrain cover: ranged fire at a hex whose main terrain is forest or mountain needs a roll 2 lower, or 1 lower for wetlands. An air strike on units in a hex whose main terrain is forest needs a roll 1 lower. Melee, return fire, anti-air fire, and strikes on infrastructure ignore cover. A city hex uses the higher of its terrain cover and city cover in each column. A rugged hex uses the higher of its terrain cover and rugged ground cover.

## Resolution Order

This turn resolves as embark, then missile launches, then air strikes, then air drops, then ranged fire, then movement, then ferry, then cargo sync, then melee. Ranged uses pre-move positions. At most one ranged_attack per unit from turn-start range; use exactly one of targetHexCode (enemy cell from the map) or targetUnitId. A unit may fire at a cell and move into that same cell in the same turn; the shot resolves first. Infantry has no strategic ranged_attack (melee only); use movement and melee. Copy each ranged or air-strike row that Best Options This Turn lists for that unit, and choose among those listed rows. Do not invent a target the table does not list. Those attacks resolve from turn-start positions and do not prevent movement in the same turn. Drop invalid attacks before submit.

## Movement

Movement budgets in clear weather: 1 cell for infantry, 2 for armor and naval, and air never marches. When the weather sentence states a lower budget for a unit that lacks that weather, that lower number is this turn's budget. Armor that enters a rugged, arctic, or city hex ends its move there. Armor already on that hex may leave. A longer route continues on the next turn, and the turn count includes that halt. An explicit_move farther than this turn's budget becomes a standing march to that hex.

Friendly units may stack on the same cell. Copy a move/melee Target Hex even when it holds an enemy — that is how contact is made this period. Approach Target Hexes omit stay-put friendlies; a cell a friendly is leaving this period is a legal dest.

## Naval Units

Naval units fire on land targets within 2 cells (range 2). Add ranged_attack when a naval unit is within 2 cells of an enemy at turn start. Naval units move on water/coastal hexes. To engage a land target, move to the nearest water or coastal cell within range.

To move a naval unit toward a land target, copy a Best Options Target Hex for that naval unit if listed; otherwise call plan_route with that land unit's briefing hex code as the destination.

## Air Units

An air unit ferries any distance in one turn by hopping controlled intact airports. Each hop is at most 4 hexes, or 2 into snow when the unit lacks the snow tag. It strikes within 3 hexes of its current airport. It does not strike from the end of a ferry on the same turn. It carries one infantry unit. embark with that air unit's id in navalUnitId loads infantry on the same hex. disembark clears the assignment and then marches the infantry by normal land movement. The destination does not have to be a port or a coast. A destination of the current hex unloads and stays. ferryOrders carries the infantry along. While aboard, the infantry cannot fight and is destroyed if the air unit is destroyed. airDrops lands that infantry on a land hex within 3 of the current airport, including an enemy hex, and the air unit stays based where it is. Enemy units there may shoot the air unit down; if they do, the infantry is lost. A drop and a strike cannot both be ordered. A drop and a ferry cannot both be ordered. When infantry cannot reach the fight by land this turn, embark it on air and drop it, or ferry it through airports, when a chain exists. Use a ship when no airport chain reaches.

## Fortifications

Fortifications: a hex's controller may fortify its intact city cells through production, one cell per item. Every hit that would destroy one of the controller's units in a fortified hex destroys one fortification instead, until none remain. Control of a fortified hex cannot change while any fortification remains. Units alone in an enemy fortified hex roll their attack against the fortifications each turn. A ranged_attack may target an explored enemy fortified hex that holds no units. This is the one ranged target you may order without a Best Options row. Air strikes and missiles remove a cell's fortification before they can destroy the cell.

## Holding Fire

A unit that should not engage is given a fire-withholding standing order, which suppresses automatic engagement for that unit until replaced. Leaving a unit without an attack is not the same as ordering it to hold fire.

## Production

Rules: infantry cost 20 (min urban 1), armor cost 40 (min urban 2), naval cost 100 (min urban 10 + min seaports 1), air cost 60 (min urban 5 + requires airport), missile cost 200 (min urban 21). fortification cost 20 per city cell (queue unitType "fortification", one cell per item). a credits item costs 20 production points and adds 20 credits to your treasury (queue unitType "credits").

Deployment caps (per side): infantry 12, armor 8, naval 8, air 6, missile 2.

A controlled cell earns production points equal to its urban count each turn and spends them in queue order. A queue that is building keeps its unspent points toward the next item. A paused queue loses its points at the end of the turn.

You can build only in your home region and in cells that hold one of your units or fortifications at the end of the turn.

Elsewhere a queue pauses, and its points are lost at the end of each turn until you end a turn with a unit there or raise a mercenary there.

Production progress/spawn resolves after Ready, after combat and control resolution.

# Strategic Context

- Your goals are, in priority order:
    (1) Take and hold enemy cities. Taking cities is how you knock sides out.
    (2) Bring more force to each fight than the enemy can. Mass your ground units before an attack, and use ships, aircraft, and mercenaries to put units where the enemy is weak.
    (3) Stop the enemy doing the same. Destroy the city cells, airports, and seaports that build and move its units.
    (4) Keep enough units at home to stop a raid on your cities.
    (5) Keep every city building, and keep credits coming in for mercenaries.
    (6) Scout with a few units, not your main force.
- Your strategy is:
    (1) Attack where you outnumber the defenders, and avoid fights where you do not.
    (2) Strike gaps the enemy cannot reinforce quickly.
    (3) Keep the initiative: move toward your objective every turn.
- Your tools are:
    (1) Missiles destroy city cells, airports, and seaports up to 12 hexes away, beyond the reach of aircraft. Build one in a city that reaches a large enemy city, then launch it.
    (2) Naval units shell any hex within 2 of them, and carry ground units to a coast the enemy has left open.
    (3) Air units strike within 3 hexes of their airport, carry one infantry unit between airports, and drop it within 3 hexes.
    (4) Mercenaries are raised for credits in any explored city outside an enemy home region that holds no enemy unit. They do not count toward unit caps. Raise them beside the campaign target, or behind the enemy to split its force.
- Your doctrine is balanced:
    (1) Advance on the campaign target while your home cities are safe.
    (2) Trade a unit for a city when the odds favor you. At your unit caps, a lost unit is usually rebuilt within a turn or two, and a lost city is not.
    (3) Strike the cities, airports, and seaports your ground units cannot reach. Production the enemy loses is force it cannot bring.
- Your message is:
    Address your enemies in character, as their enemy commander. Deliver a one-line taunt or threat meant to unnerve them. Psychological warfare only — do not reveal real orders, hex codes, unit ids, or operational intent.

## Campaign

The engine picks one enemy city for your ground units to take: the campaign target. The Campaign Objective section of the briefing names it, a staging hex near it, and the phase.

In the assemble phase, campaign units march to the staging hex and hold there. When enough of them are within 2 hexes of it, the phase becomes assault and they march on the target together. Units that arrive one at a time are destroyed one at a time.

When enemy ground units are within 3 hexes of your ground units at home, the engine keeps one home unit per enemy unit as a home defender, nearest the enemy first, and never more than half your ground units. Home defenders stay out of the campaign. A unit within 1 hex of an enemy keeps fighting it.

Campaign Orders, under Standing Order Status, lists each campaign unit whose standing order should change, and each home defender still marching on the campaign target or staging hex. Give each listed unit the order its row names. A campaign unit without a standing order has the campaign hex as its Suggested Destination.

Best Options lists advance rows for campaign units. An advance row is a one-step move toward the campaign hex. Copy it into explicit_move like an approach row.

To choose a different target, set "campaignTarget" to the hex code of an enemy city in your final JSON. Omit it to keep the target. Sending the current target changes nothing. The engine keeps your target until you take it, it stops being an enemy city, or no ground unit can reach it by land. An unknown or unreachable city is dropped.

## Operations

The engine runs operations: several turns of orders that carry ground units to an enemy city by sea. It musters the units and ships at a port, loads them, sails to a landing beside the city, unloads, and marches onto it. The Active Operations section of the briefing lists each one and how far it has got.

When you have room for another operation, Operation Options lists up to 5 you could launch, with what each would gain, what it would tie up, and what stands in its way. Launch one with "operations": [{"action":"launch","option":"<letter>"}]. The engine launches the first undefended row on the turn after that row was offered, and it never launches a defended row. Call an operation off with {"action":"cancel","id":"<operation id>"}: one that is still mustering frees its units, and one at sea turns back.

Units and ships in an operation already have their orders. Leave them alone and they carry on, including on turns you are not consulted. To take a unit or a ship out of an operation, give it any standing order of your own; it keeps that order and the operation goes on without it. A standing order on a loaded ship takes that ship and the units aboard it out together. The operation does not unload those units.

A unit aboard a ship takes no order. An explicit_move or a disembark unloads it where the ship is.

# Reading the Briefing

## Distances and Intel Age

A last-known enemy position is a report with an age; a report older than 2 turns is dropped rather than shown as old.

Nearest-enemy distances are march or sail path lengths when a path exists (otherwise a hop count). That length can be longer than one movement budget. Best Options This Turn Target Hexes are the one-step destinations already inside this turn's budget, including weather. Copy a Target Hex into explicit_move. Do not copy a farther hex from the printed path.

## Map Legend

- Each cell: top = hex code, bottom = terrain + overlay.
- Terrain: x = land, . = water.
- Overlay: - = nothing here, * = your units, ! = enemy units, including neutral garrisons, # = contested, ? = undiscovered intel.
- Features: A/a airport, S/s seaport, B/b both, U/u urban only; uppercase = your control.
- Each fenced block is one connected area. Odd rows in that block are indented one space. Use only hex codes from these blocks or the tables.

## Best Options Odds

Odds is Kill, Hurt, and Loss for every listed unit taking part. Kill is the chance the defenders are wiped out. Hurt is the chance at least one hit lands, including a hit that only removes a fortification. Loss is the chance you lose a unit. An em dash is not a fight, or it could not be estimated.

## Memory Slots

A new persistent key replaces the oldest persistent note when all 5 persistent slots are full.

Use memory_read to retrieve stored memories by key or tag. To add, update, or remove memories, use "memoryUpdates" in your final JSON (write/delete actions); there are no memory_write or memory_delete tools.

## Air Operations Table

Air rules: an air unit ferries any distance by hopping controlled intact airports. Each hop is at most 4 hexes, or 2 into snow when the unit lacks the snow tag. It strikes and drops within 3 of its current airport. Ferry Destinations lists at most 8 nearest reachable airports; any other airport you control may be legal, and plan_route confirms the chain. One air action per unit per turn.

Callback support: subscribe with event "infrastructure_destroyed" and parameters targetType plus the briefing hex code to be re-consulted after successful infra strikes.

## Transport

Embark: coastal or land seaport (control not required), or a water seaport you control. Capacity: 1 armor or 2 infantry per naval unit.

An air unit carries one infantry unit, boarded with embark, moved with ferryOrders, unloaded with disembark or airDrops.

# Available Tools

Use the Commander's Briefing in the situation message for assessments and possible unit actions. When Best Options This Turn lists a target for a unit, copy it and do not call plan_route for it. When it lists none, call plan_route or leave the unit idle. Copy Best Options This Turn approach, advance, and move/melee Target Hexes into explicit_move when you need a one-step move; copy ranged Target Hexes or Target Units into ranged_attack; copy ferry Target Hexes into ferryOrders and air drop Target Hexes into airDrops; copy air strike Target Hexes into airStrikes; pick one row per unit per action. An air unit picks only one of air strike, air drop, and ferry.

Never copy a Target Hex from a row that does not list that unit.

Standing-order status is already in the briefing; call query_orders only for a rare detail.

Use tools selectively for memory lookup (memory_read) and production queue checks/sets when needed.

1. plan_route(unitId, destination, options?) - Path and orderToHexCode. Skip this tool when the dest is already a Best Options This Turn Target Hex for that unit (copy approach/move/melee into explicit_move, ferry into ferryOrders). Otherwise copy orderToHexCode into explicit_move.destination. For naval units, you may pass a land unit's briefing hex code as destination; the route will be to the nearest water/coastal hex to that position so the naval can get in range. For an air unit, the result is the airport chain to that airport and its hop count; copy its orderToHexCode into ferryOrders.destination, not explicit_move.
2. check_distance(from, to, unitType) - Quick distance and turn estimate between two hexes. Use to compare options; skip plan_route when the dest is already a Best Options Target Hex for that unit.
3. get_map(center, radius?) - The map around a cell. Radius is 0 to 8 grid steps, default 2. Use it for cells outside the map in the briefing.
4. memory_read(key?, tags?, tier?, all?) - Retrieve memories by key, tag, or tier.
5. query_orders(unitId?, all?) - Check standing order statuses.
6. query_production(hex?, all?) - Read production queue status and available unit types by controlled hex.
7. set_build_queue(hex, unitType, count) - Set one queue unit type/count and replace any previous entries for that hex.
8. query_mercenaries(hex?) - Read your treasury, upkeep, and hire orders, or what you can hire in one cell.
9. hire_mercenaries(action, hex?, unitType?, count?, unitId?, orderId?) - Raise mercenaries in a cell, rehire a Neutral unit, or cancel a hire order. The fee is taken when the order is placed and returned if you cancel it. Orders fill at the end of the turn.

## How to Use These Tools Effectively

- The Commander's Briefing in the situation message already contains unit status, attention flags, possible unit actions, and supplemental hex intelligence for this turn. Use the briefing to decide targets and priorities.
- Batch independent tool calls: when you need the same tool for several units or hexes, request all of those calls together in one reply as parallel tool calls instead of one call per reply. Wait for a result only when the next call's arguments depend on it.
- memoryUpdates / tiers: "persistent" entries appear in every briefing (limit 5); "stored" are retrieved via memory_read (limit 15).
- Production: use query_production to inspect controlled-hex queues and constraints; use set_build_queue to set one unit type/count for a queue (this replaces existing queue entries). If skipping tools, you may include productionOrders in final JSON.

# Orders Guidance

## Winning

- Win by being the last side standing: knock out each enemy by controlling its home region, or by destroying or taking all of its cities. Those are the cells that matter. If the turn limit arrives first, the most city hexes wins.

## Using the Briefing

- When Best Options This Turn lists a target for a unit, copy it and do not call plan_route for it. When it lists none, call plan_route or leave the unit idle. Best Options This Turn Target Hexes are already this-turn legal destinations. Copy a Target Hex from a row listing that unit into explicit_move.destination (approach, advance, or move/melee); copy a ranged Target Hex or Target Unit into a ranged_attack entry; copy a ferry Target Hex into ferryOrders; copy an air strike Target Hex into airStrikes; copy an air drop Target Hex into airDrops.

  Each unit gets at most one move and one shot: pick one row per action type and copy its Unit IDs into one unitIds array; do not copy overlapping rows that relist the same unit. An air unit picks only one of air strike, air drop, and ferry. When its Aboard column is none, embark one infantry unit from its hex in the same orders list.

  Never copy a Target Hex from a row that does not list that unit; if that unit has no row, call plan_route or leave it idle.
- When the briefing shows no observed enemy unit, move to regain contact along plausible approaches rather than holding position.
- A unit that fires can still move, and a ferried air unit arrives after ground movement.
- Copy a listed shot, including an air-strike row, from Best Options unless its Odds show Kill below 50% and Loss at least 50%. An em dash is not that case. A shot resolves before movement and does not use the move. Do not invent a target.

## Standing Orders

- For every unit listed in the Units Without Standing Orders table, add an orders[] entry with action assign_order. When Suggested Destination is a bare hex, march there. That hex may be the enemy-occupied hex. When an enemy is observed, it is a legal destination that closes on the nearest enemy. When no enemy is observed, that hex may lie beyond this turn's movement budget; it is still the march destination. Use pursue only when you supply an enemy unit id, not in place of that hex.

  When Suggested Destination starts with defend, assign defend on that hex, including when no enemy is observed. Do not march an air unit. When the cell is —, do not invent a march and do not invent a defend. Never march to the unit's current Hex; that order is ignored as already arrived and the unit holds. An explicit_move to the unit's current Hex is ignored as already arrived and the unit holds.

  Copy a Suggested Destination hex into explicit_move only when Best Options lists that same hex for that unit this turn. Otherwise, when you need a one-step explicit_move this turn, copy a Best Options approach, advance, or move/melee Target Hex for that unit. That hex is already inside this turn's movement budget, including weather. Do not copy a farther hex from the printed nearest-enemy path.
- Units with a healthy standing order do not need explicit orders from you unless you want to override their current mission this turn; the attention column marks stalled orders, and marches or defend orders whose next move recedes from the nearest enemy.

  A defend order with status en_route walks the unit back to its defend post; to keep the unit where it is, assign defend on its current hex.

  An explicit_move that takes a unit off its defend post moves the post to that destination.

  A this-turn move/melee Target Hex is such an override — copy it even when the unit is already marching. After a unit fires, do not leave it on a standing march that recedes from that enemy: assign defend to hold contact, cancel the march, or remarch toward the enemy.

## Air and Naval Units

- For every air unit with no strike and no drop, ferry along owned airports toward the fighting, but only when Air Operations Status shows that unit's Base Intact and Base Controlled columns as yes. Air-drop embarked infantry onto the fight when the target is within 3 and a land march cannot reach it this turn. An air unit cannot strike and drop, or drop and ferry, on the same turn.
- Prefer airlift when an airport chain reaches and a ship would take longer.
- Naval units cannot enter land cells; to engage a land target, move to the nearest water or coastal cell within range.
- When land force must cross water, embark at a legal cell, move the transport, then disembark; loading requires a coastal cell, a land seaport, or a controlled seaport on transit water. Use the Naval Transport Status section for each naval unit (capacity, cargo already aboard, nearest embark hex). While embarked, explicit_move and disembark both clear cargo and march in one action.

## Production Queues

- When a controlled cell can build and its queue is empty, queue something.

  Keep one city queued on credits at all times. Credits are the only way to raise mercenaries, and mercenaries are the only units you can place away from your own cities.

  Production Priorities, under Production Status, names a city for a missile, a naval unit, or credits when one is worth building. Queue what it names before filling the other cities.

  Do not queue types at maximum while other types can still be built; replace blocked queues with a still-available type. When every unit type a hex can build is at cap, queue credits and spend them on mercenaries. Queue fortification only in a city whose Exposed column says yes, and replace a fortification queue in a city that is not exposed with credits.

  A hex whose available types are marked "all unit types at cap" and which lists neither has no alternative — leave that queue as it is so it resumes when the cap frees up.

  When every unit type for that cell is capped and it lists neither fortification nor credits, leave the queue alone so it resumes when the cap frees.

  When the Production attention flag is present, it names the hexes to queue and the types they can still build.

  When an attention bullet names paused queues, apply the fix in Paused Queues under Production Status.

  A city is exposed when an enemy unit you can see or remember is within 4 hexes.

## Memory and Callbacks

- Write a short persistent note under the key turn_objectives, naming this turn's objectives and the units assigned to them. Overwrite that same key every strategic turn. Never put the turn number in a key. When all 5 persistent slots are full, a new key replaces the oldest persistent note. Do not persist enemy positions or rosters, which the briefing already supplies fresh each turn. Do not persist the campaign target either; the Campaign Objective section supplies it.
- Subscribe only to events from the engine's event vocabulary; the response replaces the entire subscription list, so repeat every subscription you still want. Omit the array or send [] to clear every subscription. An empty Active Callbacks table means you have no self-chosen triggers; under event-driven policy only engine-forced consultations remain unless you subscribe now.
- The model is consulted when a subscribed event fires or when the engine forces a consultation; a turn it is not consulted for is a turn in which it issued nothing.

## Messages and Rounds

- The message field is a taunt or threat and must not reveal orders, cells, unit ids, or intent.
- Rounds are limited. After the last round, tools are withdrawn and you get one reply to submit orders; once destinations are chosen, submit.

# Response Format

Submit your final JSON only (one compact JSON object, no markdown fence, no extra whitespace, no comments).

```text
{
  "message": "<one-line taunt or threat>",
  "strategy": "<one-line>",
  "orders": [ ... ],
  "airStrikes": [ ... ],
  "ferryOrders": [ ... ],
  "airDrops": [ ... ],
  "callbacks": [...],
  "memoryUpdates": [...],
  "productionOrders": [...],
  "campaignTarget": "<optional hex code>",
  "operations": [...]
}
```

Strict schema: top-level must be a JSON object with "message" (string), "strategy" (string) and "orders" (array); do not return a top-level array.

The "message" field is a one-line in-character taunt or threat addressed to your enemies (psychological warfare only: do not reveal real orders, hex codes, unit ids, or operational intent).

The "strategy" field is a one-line summary of your plan for this turn.

The "orders" array is processed in list order. Each entry includes "action" and "unitId" or "unitIds" (copy several ids from one Best Options row into unitIds instead of one object per unit).

Actions:

- assign_order: include "order": { "type": "defend"|"march"|"pursue"|"patrol"|"hold_fire", ... }. Required fields per type: "march" needs "destination" (one two-character briefing hex code); "defend" needs "defendHex" (one hex code); "patrol" needs "waypoints" (an array of two or more hex codes, visited in order then looped — a single "destination" is not a valid patrol); "pursue" needs "targetUnitId" (an enemy unit id string); "hold_fire" needs no extra fields. Air units never move hex by hex, so "march", "patrol", and "pursue" are rejected for them — use airStrikes for attacks, ferryOrders to reposition, airDrops to land embarked infantry, or a "defend" order to keep striking targets in range.
- cancel_order
- explicit_move: include "destination": briefing hex code for this turn's move; auto-debarks embarked cargo before marching.
- ranged_attack: include exactly one of targetHexCode or targetUnitId; units with a strategic ranged reach of at least one, never infantry.
- transport_move: include "navalUnitId" and "destination" hex code.
- disembark: include "unitId" and "destination" hex code — clears cargo assignment then moves in one action.
- embark: include "unitId" and "navalUnitId".

assign_order place fields are operational-map briefing hex codes, not plan_route orderToHexCode; they may be multi-turn goals. Best Options Target Hexes are this-turn dests only.

Optional top-level air actions: airStrikes[] entries use { "unitId" or "unitIds", exactly one of "targetHexCode" or "targetUnitId", "targetType": "units"|"urban"|"airport"|"seaport" }, ferryOrders[] entries use { "unitId" or "unitIds", "destination": "`<hex code>`" }, airDrops[] entries use { "unitId" or "unitIds", "destination": "`<hex code>`" }.

The top level must be a JSON object; a top-level array is invalid. Do not use top-level movementOrders or rangedAttacks (legacy).

An entry missing a required field is dropped without comment. More than one ranged or air action for the same unit in the same period is not honoured. Raw H3 strings and latitude/longitude pairs are never valid field values. Friendly stacking is legal; a cell holding an enemy is legal as move/melee contact. A march or explicit_move to the unit's current cell is ignored as already arrived; the unit holds. Air units cannot be given march, patrol, or pursue orders. Infantry cannot be given a strategic ranged_attack.

For each explicit_move entry: set "destination" to a Target Hex from that unit's Best Options This Turn approach, advance, or move/melee row (copy the two-character code exactly), or to the exact orderToHexCode from that unit's plan_route result when the dest is not listed there.

Include optional "callbacks" for re-consultation planning. Each response replaces the whole callbacks list; omit the array or send [] to clear every subscription.

Legal events and their parameters: turns (n: fires after n turns have passed since the subscription); unit_engaged (unitId: fires when that unit takes part in combat); unit_destroyed (side or unitId: fires when an own or enemy unit, or a named unit, is destroyed); unit_arrived (unitId: fires when that unit's standing march arrives); threat_escalation (unitId, severity: fires when that unit's threat reaches the named severity); infrastructure_destroyed (targetType, hex (omit both for an unfiltered watch): fires when urban, airport, or seaport infrastructure at that briefing hex is destroyed; omitting targetType and hex watches any).

Optional "campaignTarget": the hex code of an enemy city for your ground campaign, as a string. Omit it to keep the target. Sending the current target changes nothing. The engine keeps your target until you take it, it stops being an enemy city, or no ground unit can reach it by land. An unknown or unreachable city is dropped.

Optional "operations": launch or cancel an operation. To launch a row of Operation Options, add {"action":"launch","option":"<letter>"}. To call one off, add {"action":"cancel","id":"<operation id>"} with an id from the Active Operations section. At most one launch per turn. Omit the array to change nothing.

Use optional "memoryUpdates" for memory writes/deletes (applied from JSON only; there are no memory_write or memory_delete tools). Memory write keys are at most 64 characters and may contain only letters, digits, hyphen, and underscore; content is at most 500 characters.

"productionOrders" entries MUST include "action" on every item. Required forms: {"action":"set_build_queue","hex":"`<two-char code>`","unitType":"infantry|armor|naval|air|missile|fortification|credits","count":1..99}. Any productionOrders item missing "action" or required fields is dropped. when at least one controlled hex has availableUnitTypes and an empty queue, or a queue blocked at cap while another type can still be built, include at least one set_build_queue this turn.

Do not queue types at maximum while other types can still be built; replace blocked queues with a still-available type. When every unit type a hex can build is at cap, queue credits and spend them on mercenaries. Queue fortification only in a city whose Exposed column says yes, and replace a fortification queue in a city that is not exposed with credits.

A hex whose available types are marked "all unit types at cap" and which lists neither has no alternative — leave that queue as it is so it resumes when the cap frees up. Each set_build_queue item fully replaces the chosen hex queue with one unit type/count. To hire, add {"action":"raise_mercenaries","hex":"<code>","unitType":"infantry","count":1} or {"action":"rehire_mercenary","unitId":"<id>"} rows to productionOrders.

## Example Response

Example (illustrative only — use briefing hex codes and unit ids from this operational map, not these placeholders). Emit compact JSON with no markdown fence:

```json
{
  "message": "You will not find safety in delay.",
  "strategy": "Close with observed enemies and keep production moving.",
  "orders": [
    {
      "action": "assign_order",
      "unitId": "a1-i1",
      "order": {
        "type": "march",
        "destination": "CD"
      }
    },
    {
      "action": "assign_order",
      "unitId": "a1-n2",
      "order": {
        "type": "patrol",
        "waypoints": [
          "CD",
          "CF"
        ]
      }
    },
    {
      "action": "explicit_move",
      "unitIds": [
        "a1-t1",
        "a1-t3"
      ],
      "destination": "CF"
    },
    {
      "action": "ranged_attack",
      "unitId": "a1-n1",
      "targetUnitId": "h1-i1"
    }
  ],
  "airStrikes": [],
  "ferryOrders": [],
  "airDrops": [],
  "callbacks": [
    {
      "event": "infrastructure_destroyed",
      "params": {
        "targetType": "airport",
        "hex": "CD"
      }
    }
  ],
  "memoryUpdates": [
    {
      "action": "write",
      "key": "turn_objectives",
      "tier": "persistent",
      "content": "Close with observed enemies; keep air and naval production moving."
    }
  ],
  "productionOrders": [
    {
      "action": "set_build_queue",
      "hex": "CF",
      "unitType": "air",
      "count": 1
    }
  ]
}
```

The current situation is in the next message.

# Current Situation

Current turn: 40, date: April, Year 4, phase: planning.

# Commander's Briefing

Turn 40: you command 31 unit(s); currently observed enemy units: 7. 13 of your units are in or near direct combat range. 1 unit(s) face a critical threat and require immediate attention. Review the unit status table, attention flags, and operational map below, then issue movement, ranged attacks, and air strikes as permitted this turn.

## Unit Status and Threats

| Unit ID | Type | Hex | Bonus | Weather | Nearest enemy + distance | Threat severity | Action needed |
|---------|------|-----|-------|---------|---------------------------|-----------------|---------------|
| a1-a1 | air | G9 | +2 origin | Mild | — | — | no (quiet) |
| a1-a4 | air | HV | tech +2 attack | Mild (Snow) | h1-i34 @ 7 (current, seen t40) | low | yes |
| a1-a5 | air | HV | tech +2 attack | Mild | h1-i34 @ 7 (current, seen t40) | low | yes |
| a1-a6 | air | HV | tech +2 attack | Mild (Heat) | h1-i34 @ 7 (current, seen t40) | low | yes |
| a1-a7 | air | HV | tech +2 attack | Mild (Heat) | h1-i34 @ 7 (current, seen t40) | low | yes |
| a1-a8 | air | IE | tech +2 attack | Mild (Heat) | h1-i32 @ 2 (current, seen t40) | moderate | yes |
| a1-i1 | infantry | FQ | +2 origin | Mild (Snow) | — | — | no (quiet) |
| a1-i2 | infantry | FZ | +2 origin; tech +2 attack | Rain (Heat) | h1-i34 @ 5 (current, seen t40) | low | no (quiet) |
| a1-i3 | infantry | FZ | +2 origin; tech +2 attack | Rain (Heat) | h1-i34 @ 5 (current, seen t40) | low | no (quiet) |
| a1-i6 | infantry | I8 | tech +2 attack | Mild (Heat) | h1-i32 @ 1 (current, seen t40) | moderate | yes |
| a1-i9 | infantry | EH | +2 origin; tech +2 attack | Mild | — | — | no (quiet) |
| a1-i12 | infantry | J0 | tech +2 attack | Rain (Heat) | h1-i32 @ 0 (current, seen t40) | critical | yes |
| a1-i13 | infantry | ER | +2 origin; tech +2 attack | Mild (Heat) | — | — | no (quiet) |
| a1-i14 | infantry | ER | +2 origin; tech +2 attack | Mild (Heat) | — | — | no (quiet) |
| a1-i15 | infantry | GL | tech +2 attack | Mild | h1-i34 @ 7 (current, seen t40) | low | no (quiet) |
| a1-i16 | infantry | GL | tech +2 attack | Mild | h1-i34 @ 7 (current, seen t40) | low | no (quiet) |
| a1-i17 | infantry | FZ | +2 origin; tech +2 attack | Rain (Heat) | h1-i34 @ 5 (current, seen t40) | low | no (quiet) |
| a1-i18 | infantry | GL | tech +2 attack | Mild (Heat) | h1-i34 @ 7 (current, seen t40) | low | no (quiet) |
| a1-n4 | naval | IV | tech +2 attack | Mild (Heat) | h1-i34 @ 2 (current, seen t40) | moderate | yes |
| a1-n5 | naval | IV | tech +2 attack | Mild (Heat) | h1-i34 @ 2 (current, seen t40) | moderate | yes |
| a1-n6 | naval | IV | tech +2 attack | Mild (Heat) | h1-i34 @ 2 (current, seen t40) | moderate | yes |
| a1-n7 | naval | HI | tech +2 attack | Mild | h1-i32 @ 2 (current, seen t40) | low | yes |
| a1-n8 | naval | HI | tech +2 attack | Mild | h1-i32 @ 2 (current, seen t40) | low | yes |
| a1-n9 | naval | HI | tech +2 attack | Mild | h1-i32 @ 2 (current, seen t40) | low | yes |
| a1-n10 | naval | IE | tech +2 attack | Mild | h1-i32 @ 2 (current, seen t40) | moderate | yes |
| a1-n11 | naval | ER | +2 origin; tech +2 attack | Mild (Heat) | — | — | no (quiet) |
| a1-t2 | armor | FQ | — | Mild (Snow) | — | — | no (quiet) |
| a1-t3 | armor | FZ | +2 origin; tech +2 attack | Rain | h1-i34 @ 5 (current, seen t40) | low | no (quiet) |
| a1-t4 | armor | FZ | +2 origin; tech +2 attack | Rain | h1-i34 @ 5 (current, seen t40) | low | no (quiet) |
| a1-t5 | armor | FZ | +2 origin; tech +2 attack | Rain (Heat) | h1-i34 @ 5 (current, seen t40) | low | no (quiet) |
| a1-t9 | armor | HV | tech +2 attack | Mild (Heat) | h1-i34 @ 7 (current, seen t40) | low | no (quiet) |

## Attention Flags

- a1-i12 faces a critical threat (nearest enemy: h1-i32, distance 0).
- a1-i6 faces a moderate threat (nearest enemy: h1-i32, distance 1).
- 12 unit(s) have a legal attack this turn — copy a Best Options ranged or air-strike row for each and do not invent a target: a1-a4, a1-a5, a1-a6, a1-a7, a1-a8, a1-n4, a1-n5, a1-n6, a1-n7, a1-n8, a1-n9, a1-n10.
- Production: 10 controlled hexes can build but are not building — empty queue, can build armor, credits: EJ, FO, ER; blocked at cap, can build armor, credits: FZ, DN, EH, E0, DJ, E3, GF. Add a set_build_queue row to productionOrders for each.
- Campaign: 2 units need a new standing order. Copy each Campaign Orders row into an assign_order entry.

## Operational Map

```text
AB AA AC                                                                                                      
.? .? .-                                                                                                      
 AD AF AH AE AG                                                                                                
 .? .? .- x- .?                                                                                                
AK AI AN AM AJ AL                                                                                             
.? .? .? .? x- .?                                                                                             
 AU AX AT AP AV AO AQ AW AY AR AS                                                                              
 x? x? .A .- x- x- x- .- .? .? .?                                                                              
A0 A6 A1 A2 A5 A8 A7 A3 BA AZ A9 A4                                                                           
x? x? .? .U xA x- x- .- x- x- x? x?                                                                           
 BB BK BG BD BJ BM BH BI BL BF BC BE                                                                           
 x? x? x? x? x? .? xB xA .- .? .? .?                                                                           
B2 B1 B5 BZ BN BT B6 BU BO BY B0 BQ BV B3 B4 BX BW BR BP BS                                                   
x? x? x? x? x? .U .- .B xB xU .A .- .- .- .? .? .? x? x? x?                                                   
 CG B7 CA CI CB CC CN CK B9 CJ B8 CM CE CL CF CD CH                                                            
 x? x? x? .? .? .U .- .? .- xB xA x- .- .? x? x? x?                                                            
C2 C3 CV CS CX CT CZ C1 C4 CU CW CO CR C0 CY CQ CP                                                            
x? x? x? x? x? x? .? .? .? xA xA x- .- .- .? .? x?                                                            
 DL DR DO C8 DG C7 C6 DC DM DE DD DB DN DJ DK DQ DI DP DH DA C5 C9 DF DS                                       
 x? x? x? x? .? .? .? .U .- .? .B xA xB xB .B .A .? .? .? x? x? x? x? x?                                       
D6 EA DX DU D5 DT EB D7 D8 DZ ED DV D1 DW DY D2 D0 EC D4 D3 D9                                                
x? x? x? x? x? .? .? .? .? .- .- .? .- xA xA .- .? .? .? x? .?                                                
 EV EU EP EN EO EX EL EF ES ET EG E0 EE ER EJ EH EM EW EQ EY EK EI EZ                                          
 x? x? x? x? .? .? .? .u .- .- .B xB xA x* xB .* .- .- .? .? x? x? x?                                          
FI FN E2 FT FM FJ E6 FU FL FA E9 FD FR E1 FG E4 FS FQ E3 FO FH FE FP FB FC FK E8 E5 E7 FF FV                  
x? x? x? x? x? x? .? .? .? .? .? .u .- .- .- .- .U x* xA xB .S .B .- .? .? x? x? .? .? x? x?                  
 F4 GB F0 F7 F1 FY F8 FX F9 GF FZ GA GE F3 F2 F6 FW GD GC F5                                                   
 x? x? x? .? .? .- .- .- .U xB x* .- .- .- .? .? .? x? x? x?                                                   
GV GX G1 GO GH G7 G0 GS GN GI GM GQ G2 GR GG G4 G5 GZ GL GY GP GW G6 GU GJ GK GT G3                           
x? x? x? x? x? .? .? .? .? .? .- .U .- .- .- .- .B .B .* .- .? .? x? x? x? x? x? x?                           
 HF HE HN HA HP HH HW HR HS HX G9 HL HB HY HT H0 HC HV HI G8 HK HG HD HJ HU HO HM HQ HZ                        
 x? x? x? x? .? .? .? .? .? .u .* .S .- .- .- xB .B .* .* .- .- .- .? .? x? x? x? x? x?                        
IM H4 IQ IB IP IH H1 II IA H2 H3 IF IO H9 IK IL IE IN ID H8 H7 IC IJ H5 H6 IG                                 
.? .? .? x? .? x? x? .? .? .? .- .- .- .- .- .- .* .b .b .- .? .? x? x? x? x?                                 
 JD JA JK I6 IT JJ I9 I1 IY I2 I7 JH JB IR JF JE JL IV I8 JN IW IS JM IU I3 JI I4 I0 IX IZ I5 JC JG            
 .? .? .? .? .? .? .? .? .? .? .u .- .- .- .? .- .- .* .* .b .s .- .? .? .? x? x? x? x? x? x? x? .?            
JV J3 JS KD JX KC JZ JR J6 J4 J5 JW KA JU KF J1 J2 JT J0 KG JO J9 JQ JY KE J8 J7 KB JP                        
.? .? .? .? .? .? .? .? .? .? .? .- .- .- .? .? .- .B x# xu .- .- .? .? x? x? x? x? .?                        
 KW KP KV K4 KS K1 KU KL KM K0 KX KZ KY K3 KJ KQ K2 K5 K6 KH KN KT KI KK KO KR                                 
 .? .? .? .? .? .? .? .? .u .- .- .? .? .- .- .! xU xs .? .? .? .? x? x? x? .?                                 
LW LN K8 L1 LI LV LL K9 L6 LT LJ LC LH L3 LE L0 LD LX LM LR L2 LA LP LY L4 L7 K7 LB LF LG LK LO LQ LS LU LZ L5
.? .? .? .? .? x? .? .? .? .? .? .? .? .? .- .- .? .? .? .? .- .- x! xa x? .? .? .? .? .? .? x? x? x? x? .? .?
 MO ME MP MA MS MK MC MN MG MU MH MI MF MX MD MJ MB MM MQ MT MW L8 MV L9 ML MR                                 
 .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .b xu x? x? .? .? .? .? .? .?                                 
M9 M2 NJ M6 NF M5 NM NB M1 NO NG M3 NK MZ NH NP M8 NN M0 NC NL NQ NS NR NI MY M4 M7 NA ND NE                  
.? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .- xu x? x? .? .? .? .? x? x? x? .? .?                  
 OF N4 NV OM N7 NU OH OA N3 NW OC N0 N8 NY OI NZ OE NT N2 N5 N1 N9 OG OL OJ OB NX N6 OD OK                     
 .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? x? x? x? .? .? .? .? .? x?                     
PC O0 O6 OV PA O3 OR PD OY OX O1 OU O4 O2 OO O7 ON OZ O5 PB PE O8 OW O9 OQ OS OT OP                           
.? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? x? x? .? .? .? .? x? x? .? .?                           
 PV PM P3 PI PY PO PJ PH P9 PR PP PF P0 PG PS P6 P8 PX PN QA PK PT PW P7 P2 PQ PL PU PZ P4 P5 P1               
 .? .? .? .? .? .? .? x? .? .? .? .? .? .? .? .? .? .? .? .? .? .? x? x? .? .? .? x? x? x? .? .?               
QU QF QG QP QQ QO QK QE QS QC QD QX QH QV QW QL QI QJ QR QT QM QB QN QY                                       
.? .? .? .? x? x? x? x? .? .? .? .? .? .? .? .? .? x? x? .? .? .? .? .?                                       
 Q0 RI QZ Q9 RO RK Q5 RM Q2 RJ Q4 RC Q3 RL Q1 RA RB RG RH Q7 RN Q6 RE RF RD Q8                                 
 .? .? .? .? .? x? .? .? .? .? .? .? .? .? .? .? x? .? .? .? .? x? x? .? .? .?                                 
SC R5 RW R8 RR SA RS RT RP R3 RQ SD RY R6 SE R9 R4 RX SB RV RU SF RZ R2 R1 R0 R7 SG                           
.? .? .? .? .? .? x? x? x? .? .? .? .? .? .? .? .? .? .? .? x? x? .? .? .? .? .? .?                           
 SS SY SP SV SW SQ SM S0 SJ SU ST S2 SL SX S1 SO SR SN SZ SK SI SH                                             
 .? .? .? .? .? x? .? .? .? .? .? .? .? x? .? .? .? .? .? .? .? .?                                             
TB S4 TM TI TK TQ S3 TP S6 TD TJ TC S5 TO TN S8 TA TE S7 S9 TF TH TG TL                                       
.? .? .? .? .? .? .? .? .? .? .? .? .? .? x? .? .? .? .? .? .? .? .? .?                                       
 T9 TW T3 TR TX TV TS T6 UA T2 UB UE T0 T5 TY TZ TT T1 TU T4 UD UC T7 T8                                       
 .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .?                                       
UG UN UK UU UX UV UM US UP UH UI UQ UO UT UR UJ UL UW UF                                                      
.? .? .? .? .? .? .? .? .? .? .? .? x? .? .? .? .? .? .?                                                      
 U9 U7 UZ U6 VB VA U0 VD VF VE U4 VC VG U3 UY U5 U8 U1 U2                                                      
 .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .?                                                      
VX VO VI VR VQ VK VP VM VV VS VH VL VJ VT VY VU VN VW                                                         
.? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .?                                                         
 V1 V6 WB V3 WE V0 WA V4 V7 V2 V5 V9 V8 VZ WD WC                                                               
 .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .?                                                               
WO WH WF WG WP WL WN WR WJ WQ WK WI WM                                                                        
.? .? .? .? .? .? .? .? .? .? .? .? .?                                                                        
 WU W0 WZ WX WW WS WT WV W1 WY                                                                                 
 .? .? .? .? .? .? .? .? .? .?                                                                                 
W6 W3 W8 W9 W5 W7 W4 XB XA W2                                                                                 
.? .? .? .? .? .? .? .? .? .?                                                                                 
 XG XC XD XH XI XF XE                                                                                          
 .? .? .? .? .? .? .?                                                                                          
XL XJ XK                                                                                                      
.? .? .?                                                                                                      
 XN XM                                                                                                         
 .? .?                                                                                                         
```

Units at featured hexes: ER(B), EH(B), FQ(A), FZ(B), GL(B), G9(B), HV(B), IE(B), IV(B), J0(b), KQ(b), LP(a)

### Best Options This Turn

| Unit IDs | Action | Target Hexes | Target Units | Target Infrastructure | Odds |
| --- | --- | --- | --- | --- | --- |
| a1-a4, a1-a5, a1-a6, a1-a7, a1-a8 | air strike | LP | 5 infantry | 8 urban hexes, 3 airports | Kill: 2%, Hurt: 97%, Loss: 31% |
| a1-a4, a1-a5, a1-a6, a1-a7, a1-a8 | air strike | J0 | 1 infantry | 9 urban hexes, 1 seaport, 3 airports | Kill: 97%, Hurt: 97%, Loss: 8% |
| a1-a4, a1-a5, a1-a6, a1-a7, a1-a8 | air strike | KQ | 1 infantry | 4 urban hexes, 1 seaport, 1 airport | Kill: 97%, Hurt: 97%, Loss: 8% |
| a1-a4, a1-a5, a1-a6, a1-a7, a1-a8 | air strike | JN | — | 18 urban hexes, 4 seaports, 2 airports | — |
| a1-a4, a1-a5, a1-a6, a1-a7 | air strike | KG | — | 18 urban hexes | — |
| a1-a8 | air strike | ID | — | 6 urban hexes, 2 seaports, 2 airports | — |
| a1-i1 | advance | G5 | — | 15 urban hexes, 2 seaports, 1 airport | — |
| a1-i1, a1-t2 | approach | G5 | h1-i32, h1-i34 | 15 urban hexes, 2 seaports, 1 airport | — |
| a1-i1, a1-t2 | approach | GF | h1-i32, h1-i34 | 27 urban hexes, 1 seaport, 2 airports | — |
| a1-i2, a1-i3, a1-i17, a1-t3, a1-t4, a1-t5 | approach | GZ | h1-i32, h1-i34 | 14 urban hexes, 2 seaports, 3 airports | — |
| a1-i6, a1-n7, a1-n8, a1-n9, a1-n10 | move/melee | J0 | 1 infantry | 9 urban hexes, 1 seaport, 3 airports | Kill: 88%, Hurt: 88%, Loss: 21% |
| a1-i6, a1-i12, a1-n4, a1-n5, a1-n6, a1-n10 | move/melee | KQ | 1 infantry | 4 urban hexes, 1 seaport, 1 airport | Kill: 91%, Hurt: 91%, Loss: 18% |
| a1-i9 | approach | FH | h1-i32, h1-i34 | 14 urban hexes, 1 seaport | — |
| a1-i12 | move/melee | LP | 5 infantry | 8 urban hexes, 3 airports | Kill: 0%, Hurt: 15%, Loss: 99% |
| a1-i13, a1-i14 | approach | FO | h1-i32, h1-i34 | 65 urban hexes, 2 seaports, 2 airports | — |
| a1-n4, a1-n5, a1-n6, a1-n10 | ranged | KQ | 1 infantry | 4 urban hexes, 1 seaport, 1 airport | Kill: 80%, Hurt: 80%, Loss: 0% |
| a1-n7, a1-n8, a1-n9, a1-n10 | ranged | J0 | 1 infantry | 9 urban hexes, 1 seaport, 3 airports | Kill: 80%, Hurt: 80%, Loss: 0% |
| a1-t2 | approach | H0 | h1-i32, h1-i34 | 25 urban hexes, 1 seaport, 5 airports | — |

## Campaign Objective

- Target: LP, a South America city with 8 city cells and no known fortifications. The engine chose it on turn 38.
- Staging hex: G5.
- Phase: assemble. 0 of 6 ground units are within 2 hexes of G5. The assault starts when 6 are.

## Active Operations

- opponent-op38: by sea to LP, an enemy city with 8 city cells. Mustering at FH: 2 of 2 ground units and 1 of 1 ship are there. Units: a1-i20, a1-i21. Ships: a1-n11.

## Operation Options

| Option | Objective | Method | Plan | Impact | Cost | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| A | KQ | sea | 2 ground units muster at FH; 1 ship sail to J0; assault KQ | 4 city cells, in an enemy home region | 2 of 12 ground units, 1 of 4 ships, about 6 turns | 0 enemy units within 2 hexes; 3 more can reach it in 6 turns |
| B | J0 | sea | 2 ground units muster at FH; 1 ship sail to KQ; assault J0 | 9 city cells | 2 of 12 ground units, 1 of 4 ships, about 8 turns | 1 enemy unit within 2 hexes; 2 more can reach it in 8 turns |

## Supplemental Hex Intelligence

- LP: terrain land; passableBy: infantry, armor; origin Colombia notes: Adjacent to water - exposed to naval bombardment (range 2)
- J0: terrain land; passableBy: infantry, armor; origin Colombia notes: Adjacent to water - exposed to naval bombardment (range 2); Chokepoint - only 2 passable adjacent hexes
- KQ: terrain water; passableBy: infantry, armor, naval; origin Panama notes: Adjacent to water - exposed to naval bombardment (range 2)

## Recent Turn Notes

Turn 37:
- Message: Your southern line will break, and no reinforcement will reach you in time.
- Strategy: Hit the stacked enemy infantry at J0 with air and naval fire, hold J0 with our infantry, and advance the reserves toward IE and G5.
- Enemy Losses: Ranged attack: h1-i19; Melee attack: h1-i21; Air strike: h1-i20
- Your Losses: Melee attack: a1-i8, a1-i10, a1-i11

Turn 38:
- Message: Your defenses are hollow husks waiting to be shattered.
- Strategy: Bombard enemy positions with air and naval power while crushing the pocket at J0.
- Enemy Losses: Ranged attack: h1-i22; Melee attack: h1-i29, h1-i30, h1-i23
- Your Losses: Melee attack: a1-t6, a1-i5

Turn 39:
- Message: Your southern bastions will crumble into dust before our relentless advance.
- Strategy: Advance armor and infantry to contact while pounding enemy positions with coordinated air and naval strikes.
- Enemy Losses: Ranged attack: h1-i24, h1-i25; Melee attack: h1-i33
- Your Losses: Melee attack: a1-t7, a1-t8

## Production Status

Your current unit counts: infantry 12/12, armor 5/8, naval 8/8, air 6/6, missile 0/2.

You are currently at maximum for: infantry, naval, air.

### Production Priorities

- Credits: no city is producing credits. Queue credits in E3.

### Controlled Hex Queues

| Hex | Urban Hexes | Fortified | Exposed | Airports | Seaports | Available Unit Types | Current Queue | Building |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EJ | 80 | 0/80 | no | 8 | 4 | armor, missile, fortification, credits | — | yes |
| FO | 65 | 0/65 | no | 2 | 2 | armor, missile, fortification, credits | — | yes |
| ER | 50 | 0/50 | no | 4 | 3 | armor, missile, fortification, credits | — | yes |
| FZ | 44 | 0/44 | no | 2 | 3 | armor, missile, fortification, credits | 1 air (blocked: at cap) | yes |
| DN | 39 | 0/39 | no | 4 | 2 | armor, missile, fortification, credits | 1 naval (blocked: at cap) | yes |
| EH | 39 | 0/39 | no | 4 | 4 | armor, missile, fortification, credits | 1 air (blocked: at cap) | yes |
| E0 | 34 | 0/34 | no | 4 | 2 | armor, missile, fortification, credits | 1 air (blocked: at cap) | yes |
| DJ | 33 | 0/33 | no | 4 | 4 | armor, missile, fortification, credits | 1 air (blocked: at cap) | yes |
| E3 | 27 | 0/27 | no | 1 | 0 | armor, missile, fortification, credits | 1 air (blocked: at cap) | yes |
| GF | 27 | 0/27 | no | 2 | 1 | armor, missile, fortification, credits | 1 air (blocked: at cap) | yes |

## Your Strategic Memory

### Persistent (Active Strategic Context)

| Key | Updated Turn | Content |
| --- | --- | --- |
| — | — | — |

### Reminders Triggered This Turn

| Key | Tier | Recurring | Content |
| --- | --- | --- | --- |
| — | — | — | — |

Persistent: 0 of 5 slots used. Stored: 0 of 15 slots used.

## Standing Order Status

| Unit ID | Unit Type | Order Type | Destination / Target | Status | Next Move | Turns Remaining | Attention |
| --- | --- | --- | --- | --- | --- | --- | --- |
| a1-a1 | air | DEFEND | G9 | holding | — | — | no |
| a1-a4 | air | DEFEND | HV | holding | — | — | no |
| a1-a5 | air | DEFEND | EJ | holding | — | — | no |
| a1-a6 | air | DEFEND | HV | holding | — | — | no |
| a1-a7 | air | DEFEND | HV | holding | — | — | no |
| a1-a8 | air | DEFEND | ER | holding | — | — | no |
| a1-i1 | infantry | DEFEND | FQ | holding | — | — | no |
| a1-i12 | infantry | DEFEND | J0 | holding | — | — | no |
| a1-i13 | infantry | DEFEND | ER | holding | — | — | no |
| a1-i14 | infantry | DEFEND | ER | holding | — | — | no |
| a1-i15 | infantry | DEFEND | GL | holding | — | — | no |
| a1-i16 | infantry | DEFEND | GL | holding | — | — | no |
| a1-i17 | infantry | DEFEND | GZ | holding | — | — | no |
| a1-i18 | infantry | DEFEND | GL | holding | — | — | no |
| a1-i2 | infantry | DEFEND | FZ | holding | — | — | no |
| a1-i3 | infantry | DEFEND | FZ | holding | — | — | no |
| a1-i6 | infantry | DEFEND | I8 | holding | — | — | no |
| a1-i9 | infantry | DEFEND | EH | holding | — | — | no |
| a1-n10 | naval | DEFEND | IE | holding | — | — | no |
| a1-n11 | naval | DEFEND | ER | holding | — | — | no |
| a1-n4 | naval | DEFEND | IV | holding | — | — | no |
| a1-n5 | naval | DEFEND | IV | holding | — | — | no |
| a1-n6 | naval | DEFEND | IV | holding | — | — | no |
| a1-n7 | naval | DEFEND | HI | holding | — | — | no |
| a1-n8 | naval | DEFEND | HI | holding | — | — | no |
| a1-n9 | naval | DEFEND | HI | holding | — | — | no |
| a1-t2 | armor | DEFEND | FQ | holding | — | — | no |
| a1-t3 | armor | DEFEND | FZ | holding | — | — | no |
| a1-t4 | armor | DEFEND | FZ | holding | — | — | no |
| a1-t5 | armor | DEFEND | FZ | holding | — | — | no |
| a1-t9 | armor | DEFEND | HV | holding | — | — | no |

### Units Without Standing Orders

| Unit ID | Unit Type | Suggested Destination |
| --- | --- | --- |
| — | — | — |

### Campaign Orders

| Unit ID | Unit Type | Current Order | Campaign Order |
| --- | --- | --- | --- |
| a1-i1 | infantry | defend FQ | march G5 |
| a1-t2 | armor | defend FQ | march G5 |

## Active Callbacks

| Event | Details |
| --- | --- |
| — | None. |

## Scenario Progress

- Explored: 36 of 190 land hexes (19%)
- Controlled: 29 of 190 land hexes (15%)
- Your home region control: 69 of 69 hexes (100%)
- Your control of South America's home region: 2 of 57 hexes (4%)

## Air Operations Status

Air units: yours=6, enemy=0.

| Unit ID | Base Hex | Aboard | Base Intact | Base Controlled | Enemy Unit Targets | Strikeable Urban | Strikeable Airports | Strikeable Seaports | Ferry Destinations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| a1-a1 | G9 | none | yes | yes | 0 | 0 | 0 | 0 | 0 |
| a1-a4 | HV | none | yes | yes | 7 | 9 | 7 | 7 | 22 |
| a1-a5 | HV | none | yes | yes | 7 | 9 | 7 | 7 | 22 |
| a1-a6 | HV | none | yes | yes | 7 | 9 | 7 | 7 | 22 |
| a1-a7 | HV | none | yes | yes | 7 | 9 | 7 | 7 | 22 |
| a1-a8 | IE | none | yes | yes | 7 | 7 | 7 | 6 | 22 |

Enemy infrastructure in your current strike envelope: airports=7, seaports=7.

## Naval Transport Status

| Unit ID | Hex | Your control | Seaport Here | Aboard | Capacity Used | Nearest Embark Hex |
| --- | --- | --- | --- | --- | --- | --- |
| a1-n4 | IV | yes | yes | infantry 0, armor 0 | 0/2 | IV at hex distance 0 |
| a1-n5 | IV | yes | yes | infantry 0, armor 0 | 0/2 | IV at hex distance 0 |
| a1-n6 | IV | yes | yes | infantry 0, armor 0 | 0/2 | IV at hex distance 0 |
| a1-n7 | HI | yes | no | infantry 0, armor 0 | 0/2 | GL at hex distance 1 |
| a1-n8 | HI | yes | no | infantry 0, armor 0 | 0/2 | GL at hex distance 1 |
| a1-n9 | HI | yes | no | infantry 0, armor 0 | 0/2 | GL at hex distance 1 |
| a1-n10 | IE | yes | yes | infantry 0, armor 0 | 0/2 | IE at hex distance 0 |
| a1-n11 | ER | yes | yes | infantry 0, armor 0 | 0/2 | ER at hex distance 0 |

## Mercenaries

Credits hire mercenaries. Raise new units in an explored cell outside other sides' home regions that holds no units but yours and no fortifications but yours, up to twice the cell's production in unit cost each turn, or rehire a Neutral unit you can see.

Hired units arrive at the end of the turn and take orders the next turn. A raise costs one turn of upkeep and a rehire costs two. That fee is taken when the order is placed, returned when the order is removed, and returned for any count the end of the turn does not fill.

After that each mercenary costs its upkeep every turn: infantry 3 (Advanced 5), armor 5 (10), naval 13 (25), air 8 (15) credits per turn. The Advanced figure applies when tech bonuses are on. Credits produced this turn arrive before upkeep is paid. If your treasury cannot pay, random mercenaries desert to Neutral. A rehired unit that shares its cell with other sides' units, Neutral included, fights them at the next resolution, and so does a deserter that shares a cell with your units. Mercenaries do not count toward unit caps.

Treasury: 40 credits. Mercenary upkeep: 0 credits per turn for 0 mercenaries. Hire orders already taken from the treasury this turn: 0 credits.

### Rehire Candidates

No Neutral unit you can see can be rehired.

### Raise Options

| Hex | To Campaign Target | Enemy Units Within 2 | Chokepoint | Capacity | Resumes building | Options |
| --- | --- | --- | --- | --- | --- | --- |
| E3 | 4 | 0 | no | 40 | no | infantry (fee 3, upkeep 3) |

## Unit Roster

Enemy units (currently observed): South America: h1-i31 (infantry) at LP; h1-i32 (infantry) at J0; h1-i34 (infantry) at KQ; h1-i35 (infantry) at LP; h1-i36 (infantry) at LP; h1-i37 (infantry) at LP; h1-i38 (infantry) at LP

Use the Commander's Briefing above. Copy one option row per unit per action into the matching envelope field; use the routing tool only for an unlisted destination. Give the units in the orderless table standing orders. Give each unit in Campaign Orders the order its row names. Launch an operation from Operation Options if one is worth its cost. Queue production for every hex named in the Production attention flag. Then submit JSON with "message", "strategy", "orders", "airStrikes", "ferryOrders", "airDrops", "callbacks", "memoryUpdates", "productionOrders".
