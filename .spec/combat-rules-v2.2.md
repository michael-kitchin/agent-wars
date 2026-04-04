# Combat Execution and Resolution Rules

*Version 2.2 — April 2026*

This document describes combat execution and resolution rules for the game, using **Axis & Allies 2**-style combat as a template. Rules are designed for **WEGO** turn resolution: all combat is resolved by the engine in a single resolution phase with **no player-to-player interaction or confirmations**. No retreat declarations, no casualty choices by players — the engine applies deterministic procedures and (where specified) dice rolls.

**Stated needs addressed:**
1. **Offensive and defensive strengths and weaknesses** — §3 and §2 (unit roster) define attack/defense values, range, and roles; §3.5 summarizes cross-domain and terrain.
2. **Ranged attack capabilities** — §2 (range 0/1/2/3), §7 (summary table): air 3 hexes (strike from base), naval 2 hexes, armor adjacent (1 hex), infantry melee only.
3. **Zero player interaction / WEGO streamlining** — No confirmations or back-and-forth: resolution order (air strike then ranged then melee), casualty assignment (fixed priority), and attacker/defender ordering (participant IDs assigned at combat start) are all engine-defined. Single resolution phase after movement.
4. **Infrastructure destruction** — §8 defines permanent destruction of urban hexes, airports, and seaports via air strikes, with target-type-specific counter-fire risk.
5. **Naval transport** — §9 defines sealift mechanics: embarkation at seaports, stack movement on water, disembarkation at any coastal hex, capacity constraints, and transport loss rules.

---

## 1. Design principles

- **Simultaneous resolution:** The engine resolves all combat and movement in a defined five-phase sequence. No mid-combat input from any player.
- **Dice-based hits:** Each unit rolls one die; a hit is scored when the result is **less than or equal to** that unit's attack or defense value (A&A style).
- **Automatic casualty assignment:** When hits are scored, the engine assigns casualties using a fixed priority (e.g. lowest defense first). No player chooses which unit is lost.
- **Five-phase resolution:** Air strikes → ranged → ground/naval movement → ferry movement → melee. Each phase resolves completely before the next begins.
- **Participant IDs:** At the start of combat resolution, each side (player) that has at least one unit in any combat is assigned a unique random integer ID by the game RNG. All ordering for that resolution phase (attacker/defender in melee, tie-breaks, multi-player melee order) uses these IDs. This supports an arbitrary number of players.
- **RNG:** A single seed is used for the entire game so that replay is deterministic.
- **Infrastructure destruction is permanent.** Destroyed urban hexes, airports, and seaports do not rebuild. This applies to all players — the attacker cannot recover infrastructure they destroy, even if they later control the hex.

### 1.1 Terrain types and hex features

Each res1 hex has a **terrain type** that determines which unit domains can enter it:

| Terrain type | Land units | Naval units | Notes |
|-------------|-----------|-------------|-------|
| **Plains** | Yes | No | Default passable land terrain. |
| **Forests** | Yes | No | No combat modifiers in initial implementation (see §10). |
| **Mountains** | Yes | No | No combat modifiers in initial implementation (see §10). |
| **Desert** | Yes | No | No combat modifiers in initial implementation (see §10). |
| **Wetlands** | Yes | No | No combat modifiers in initial implementation (see §10). |
| **Arctic** | Yes | No | No combat modifiers in initial implementation (see §10). |
| **Coastal** | Yes | Yes | 15–85% land area. Passable by both land and naval units. Required for embarkation (with seaport) and disembarkation (see §9). Enables cross-domain interactions: naval bombardment of land units, armor firing on adjacent naval units. |
| **Water** | No (unless transported) | Yes | Land units may only be present on water hexes while in a naval transport stack (see §9). |

Terrain combat modifiers (e.g., armor penalty in mountains, infantry defensive bonus in forests) are not implemented in the initial combat system. See §10 for planned extensions.

Each hex may also have zero or more **features** that represent infrastructure:

| Feature | Effect | Destructible? |
|---------|--------|--------------|
| **Urban** | Each res4 urban hex contributes 1 production point per turn. Multiple urban hexes per res1 hex. | Yes — air strikes destroy 3 res4 urban hexes per hit (§8.3). |
| **Airport** | Required to base and build air units. Enables air visibility and strike coverage within 3 hexes. | Yes — air strike or ground capture (§8.3, §6). |
| **Seaport** | Required to build and launch naval units. Required for naval transport embarkation (§9.1). | Yes — air strike (§8.3). |
| **Rubble** | Marks a destroyed urban hex. No production value. Permanent. | No — rubble is the end state of a destroyed urban hex. |

Infrastructure destruction is permanent — destroyed features become rubble (urban) or simply cease to exist (airports, seaports). No player can rebuild destroyed infrastructure. See §8.4.

---

## 2. Unit roster (current)

The game has four unit types. Unit caps are 10 infantry, 5 armor, and 5 naval as of milestone 1.4; with air added in milestone 1.5, caps are 10 infantry, 5 armor, 5 naval, and 3 air (23 total). Fallback if playtesting shows 23 is too many for LLM briefing quality: 8 infantry, 4 armor, 4 naval, 2 air (18 total).

| Unit type | Move | Attack | Defense | Range | Domain | Cost | Transport weight |
|-----------|------|--------|---------|-------|--------|------|-----------------|
| **Infantry** | 1 | 1 | 2 | 0 (melee only) | Land | 10 urban hexes | 1 |
| **Armor** | 2 | 3 | 2 | 1 (adjacent hex) | Land | 20 urban hexes | 2 |
| **Naval** | 2 | 2 | 2 | 2 hexes | Water | 50 urban hexes | — (transport capacity: 2) |
| **Air** | 0 (ferry only) | 3 | 1 | 3 (strike radius) | Air | 30 urban hexes | — |

- **Range 0:** Unit only participates in same-hex (melee) combat.
- **Range 1:** Unit can attack an enemy in any **adjacent** hex (H3 grid distance 1; includes land–water boundary; see §6 for coastal bombardment).
- **Range 2:** Unit can attack enemies in hexes at distance 1 or 2 (e.g. naval gunfire). Range is measured by H3 grid distance (same metric as movement).
- **Range 3 (air only):** Unit can strike any hex within 3 hexes of its base airport. Air units do not use incremental movement — they strike from their base and return in the same phase.
- **Move 0 (air):** Air units have no incremental movement. They reposition via ferry orders (up to 4 hexes between owned airports, one action per turn — see §4.4). Ferry range (4) is longer than strike/visibility range (3), reflecting that a player always knows where their own airports are — ferry destinations don't require air reconnaissance, just ownership.
- **Cost:** The cost column is the total production points required to build the unit. Each res1 hex generates production points equal to its res4 urban hex count per turn. Points accumulate toward the unit cost across multiple turns; when accumulated points meet or exceed the cost, the unit spawns and excess production carries over immediately to the next unit in the queue. If the excess is sufficient to cover the next unit's cost, that unit also spawns in the same turn — a hex produces as many units per turn as its production rate and unit caps allow.

  Examples: a hex with 5 urban hexes produces 1 infantry (cost 10) every 2 turns. A hex with 15 urban hexes and a seaport queues a naval unit (cost 50) followed by an infantry: the naval unit spawns on turn 4 (15 × 4 = 60 ≥ 50) with 10 points left over, which immediately covers the infantry cost (10), so both units spawn on turn 4.

  Air strikes that destroy urban hexes (3 res4 hexes per hit) permanently reduce the production rate. Air unit cost (30) is a starting value subject to playtesting.

- **Transport weight and capacity:** Each naval unit has a transport capacity of 2. Infantry has a transport weight of 1; armor has a transport weight of 2. A naval unit can carry 2 infantry, or 1 armor, or 1 infantry (with 1 capacity unused). See §9 for full naval transport rules.

---

## 3. Offensive and defensive strengths and weaknesses

### 3.1 Infantry

- **Strengths:** Cheap, high defense (2) so they absorb hits well. Best used to hold hexes and absorb attacks.
- **Weaknesses:** Low attack (1) — only a roll of 1 scores a hit. No ranged attack; must be in the same hex to fight. Cannot return fire against air strikes.
- **Role:** Defensive anchor, zone control, screening, airport/infrastructure defense. Most efficient unit for naval transport (weight 1; two infantry per naval unit).

### 3.2 Armor

- **Strengths:** High attack (3) — hits on 1–3. Can attack **adjacent** hexes (ranged 1), so it can strike without entering the target hex. Good mobility (move 2).
- **Weaknesses:** Defense 2, same as infantry; no extra durability. Vulnerable to concentrated fire if exposed. Transport weight 2 — requires a full naval unit to transport.
- **Role:** Offensive punch, ranged pressure on adjacent hexes, exploitation.

### 3.3 Naval

- **Strengths:** Move 2, ranged 2 — can strike enemies up to 2 hexes away (e.g. shore bombardment or sea combat). Attack 2, defense 2. Can transport land units across water (capacity 2; see §9).
- **Weaknesses:** Restricted to water; cannot enter land hexes. No melee in land hexes; only contributes from water via ranged attack.
- **Role:** Naval control, coastal bombardment, striking land or sea targets from distance, transporting land units across oceans.

### 3.4 Air

- **Strengths:** Attack 3, range 3 — can strike any hex within 3 hexes of its base airport in a single phase with no incremental movement. Grants visibility in a 3-hex radius around its base (see §8.2). Can target enemy units **or** infrastructure (urban hexes, airports, seaports). The only unit capable of destroying infrastructure.
- **Weaknesses:** Defense 1 — the most fragile unit type. No incremental movement; repositioning requires a ferry order that consumes the unit's entire turn. Cannot participate in melee. Destroyed if an enemy ground unit enters its base airport hex. Requires an airport to exist; airport destruction eliminates the based air unit.
- **Role:** Strategic reconnaissance, deep strike, infrastructure destruction, air superiority (via airport strikes that destroy enemy air units).

### 3.5 Cross-domain and terrain (summary)

- **Land vs. land:** Infantry and armor fight on land; both can melee in the same hex; armor can also fire into an adjacent hex.
- **Naval vs. naval:** In water hexes, naval units can melee (same hex) or use range 2 to hit other naval units in nearby water hexes.
- **Naval vs. land:** Naval can use range 2 to hit land units in hexes within 2 of the naval unit (e.g. coastal hexes). Armor in a land hex may attack naval in an adjacent water hex; infantry may not. See §6 (Coastal bombardment).
- **Air vs. ground/naval:** Air units strike during the air strike phase (before ranged). When targeting units, defending ground/naval units with range ≥ 1 in the target hex may return fire at their attack value — no range-to-base check; the aircraft flies to the target, so defenders are shooting at aircraft overhead. Infantry (range 0) cannot return fire against air strikes. When targeting infrastructure, only the infrastructure's fixed counter-fire roll applies — units in the hex do not participate, regardless of hex occupation status. See §4.1 and §8 for full air strike and infrastructure strike rules.
- **Ground vs. air (base attack):** Air units do not participate in melee. If an enemy ground unit enters a hex containing an airport with a based air unit, the air unit is destroyed (see §6).
- **Naval transport:** Land units on water hexes cannot attack or defend — they are passengers. Land units on coastal hexes fight normally. See §9 for full transport rules.
- **Terrain modifiers (optional / future):** Not required for first implementation. Later, armor could suffer a penalty in certain terrain (e.g. forest/mountain); infantry could get a defensive bonus in forest. Left out of the core resolution below for simplicity.

---

## 4. Combat resolution procedure (WEGO, no player input)

Resolution uses **current unit positions** at each step. The engine runs five phases in this order:

### 4.1 Air strike phase (pre-move positions)

Using the **current** (pre-movement) positions:
- Build air strikes: for each air unit with a strike order, identify the target hex and target type (units, urban hex, airport, or seaport).
- Resolve all air strikes. Apply casualties to targets. Evaluate counter-fire against each striking air unit. Remove eliminated units and destroyed infrastructure. Process strikes in deterministic order (by striking air unit's base hex H3 index ascending).
- Air units that are destroyed during this phase (by counter-fire from another air unit's strike on their airport, or by return fire from defending units) do not execute their own strike if they haven't been processed yet. Process order matters: lower H3 index strikes first.

**One action per turn:** An air unit may either strike or ferry in a given turn, never both. An air unit with a ferry order does not participate in the air strike phase.

**Air strikes against transport stacks:** Air strikes on water hexes containing transport stacks (naval units carrying land units) resolve normally against the naval units. Embarked land units on water hexes **cannot** return counter-fire (see §9.4). If a naval unit is destroyed by an air strike and remaining naval capacity is insufficient for embarked land units, excess land units are destroyed per §9.5.

### 4.2 Ranged phase (pre-move positions)

Using the **current** (pre-movement) positions, after air strike casualties are applied:
- Build ranged attacks: for each unit with range ≥ 1 (armor, naval — **not** air, which resolves in §4.1), determine enemy-occupied hexes within range; each (attacker hex, defender hex) is a ranged attack.
- Resolve all ranged engagements. Apply casualties and remove eliminated units. No melee yet.

**Ranged attacks against transport stacks:** Naval units in a transport stack on water hexes participate normally in ranged combat (attacking and defending). Embarked land units on water hexes **cannot** participate in ranged combat — they cannot attack and cannot return fire (see §9.4). If a naval unit in a transport stack is destroyed during ranged combat, apply transport loss rules per §9.5.

### 4.3 Apply ground and naval movement

Move every ground and naval unit that has a movement order to its destination. This includes transport stack movement — naval units carrying land units move together as a group. Land units disembarking at coastal hexes appear at the coastal hex during this phase. Positions are now final for ground and naval units.

**Capacity validation:** When a transport stack enters a water hex, the engine validates that total land unit transport weight does not exceed total naval transport capacity. Orders that would violate capacity are rejected before resolution. When a naval unit moves out of a water hex independently (not as part of a stack), the engine validates that remaining naval capacity is sufficient for any land units remaining on the water hex; if not, the order is rejected.

### 4.4 Ferry movement (post ground/naval movement)

For each air unit with a ferry order:
1. Check the destination airport: is it still owned by the air unit's player, and is the airport still intact?
2. **If yes:** The air unit relocates to the destination airport. Ferry complete.
3. **If no (destination destroyed or captured during this turn's resolution):** Ferry aborts. Check the origin airport: is it still owned and intact?
   - **If origin intact:** The air unit remains at its origin airport. No movement occurs.
   - **If origin also destroyed or captured:** The air unit is destroyed.

Ferry range: maximum 4 hexes (H3 grid distance) between the origin and destination airports. Ferry range is deliberately longer than the air unit's 3-hex strike/visibility radius — a player always knows where their own airports are, so ferry destinations don't require reconnaissance, just ownership and an intact airport. Both airports must be in hexes owned by the air unit's player at the time the order is issued. Destination validation occurs at resolution time (step 1 above), not at order time, to account for WEGO simultaneous resolution.

### 4.5 Melee phase (post-move positions)

Using the **post-movement** positions (after both ground/naval movement and ferry movement):
- Build melee combats: each hex that has ground/naval units from two or more sides is one melee engagement. Air units do **not** participate in melee.
- Resolve all same-hex combats in a deterministic order.

**Amphibious landings:** Land units that disembarked at a coastal hex during phase 4.3 **participate in melee** if enemies are present at that hex. This enables opposed amphibious landings — a transport stack can sail to a defended coast and the land units fight upon arrival. This is intentional: the five-phase sequence (movement in phase 3, melee in phase 5) naturally permits same-turn landing combat.

### 4.6 Resolution ordering and determinism

This five-phase order ensures: air strikes resolve first, giving air power a "first strike" advantage that justifies the unit's fragility. Ranged attacks resolve when targets are still where the player aimed. Movement is applied only after ranged resolution. Ferry validation uses post-movement ground truth. Casualties are applied immediately after each engagement so that later engagements see updated unit counts.

Within each phase, process engagements in a **deterministic order** (e.g. by attacker/defender hex H3 index ascending). With a single game seed, replay is deterministic.

### 4.7 One round per phase

For simplicity, use **one round of fire per phase** per combat (or per attack):
- Air strike phase: each striking air unit rolls once. Counter-fire depends on target type: for unit targets, defending units with range ≥ 1 in the target hex each roll once (attack value); for infrastructure targets, a single fixed counter-fire roll is made (see §8). Hits are applied via automatic casualty rules. Embarked land units on water hexes cannot return counter-fire.
- Ranged phase: each eligible attacker rolls once per eligible target hex. **Return fire:** defending units that have ranged capability (range ≥ 1) and for which at least one attacking unit's hex is within that defender unit type's range each roll once (**attack** value); those hits are assigned to attacker hexes. Hits are applied via automatic casualty rules. Embarked land units on water hexes cannot participate.
- Melee phase: same — one round of rolls, then apply hits. Disembarked land units at coastal hexes participate normally.

No "continue or retreat" — no player choices. If both sides remain in the same hex after melee, they will fight again in the **next turn's** resolution (no multi-round within the same resolution).

### 4.8 Hit and casualty rules

- **Roll:** One die per unit (d6, result 1–6).
- **Hit:** For **attack** (including return fire), hit if `roll ≤ attack value`. For **defense** (melee only), hit if `roll ≤ defense value`.
- **Return fire (ranged phase):** Only defending units with range ≥ 1 may return fire. A defending unit returns fire only if at least one attacker hex is within that unit type's range (H3 grid distance). Each such defender rolls once (attack value); hits are assigned to attacker hexes. Infantry (range 0) does not return fire at range.
- **Counter-fire against air (air strike phase):** See §8.1 for unit targets and §8.3 for infrastructure targets. Counter-fire mechanics vary by target type.
- **Casualty assignment (automatic):** When a side receives N hits, remove N of its units in that combat using a **fixed priority** so no player chooses. Remove units in order of **lowest defense value first** (so high-value units survive when possible). Ties: use unit-type order **infantry → armor → naval → air**. If the combat is ranged and the "defender" is a hex with mixed unit types, apply the same priority to that hex's stack.

### 4.9 Elimination

When a unit is chosen as a casualty (one hit = one unit removed), it is removed from the map. No capture, no retreat step — just removal. If the eliminated unit is a naval unit carrying land units on a water hex, apply transport loss rules per §9.5.

This gives a single, predictable resolution pass: air strikes first, then ranged, then movement, then ferry, then melee — one round each, with deterministic casualty assignment.

---

## 5. Detailed resolution flow (single resolution phase)

High-level flow: **air strikes → ranged at pre-move positions → ground/naval movement → ferry movement → melee at post-move positions**.

```
1. Set phase to resolution (existing behavior).
2. Get current unit positions (before any movement). Assign participant IDs
   for this resolution phase (each side gets a unique random integer from
   the game RNG).
3. Air strike phase (pre-move positions):
   Build air strikes from declared orders. Process in deterministic order
   (striking unit's base hex H3 index ascending).
   For each air strike:
   a. If striking air unit was destroyed by an earlier strike this phase,
      skip.
   b. Determine target type (units, urban hex, airport, seaport).
   c. For unit targets: air unit rolls attack (hit on roll ≤ 3). If hit,
      assign casualty to target hex using casualty priority. Defending
      units with range ≥ 1 in the target hex return fire (roll ≤ attack
      value); no range-to-base check — defenders shoot at aircraft
      overhead. Any hit destroys the air unit. NOTE: embarked land units
      on water hexes cannot return counter-fire against air strikes.
   d. For infrastructure targets: see §8.3. Air unit rolls attack; on hit,
      infrastructure is destroyed. Infrastructure counter-fire roll
      determines risk to air unit. Units in the hex do not participate in
      counter-fire against infrastructure strikes.
   e. Apply all casualties and infrastructure destruction immediately.
      If a naval unit on a water hex is destroyed, check transport
      capacity vs. embarked land units; destroy excess per §9.5.
4. Ranged phase (pre-move positions, post-air-strike casualties):
   Build ranged attacks from declared orders and current positions (armor
   range 1, naval range 2 — air units do not participate, embarked land
   units on water hexes do not participate). Group by defender hex; process
   in deterministic order (defender hex H3 index ascending).
   For each ranged engagement (one defender hex D, set of attacker hexes):
   - All units in attacker hexes that have D in range each roll once.
     Attacker hits = sum of hits (roll ≤ attack).
   - Return fire: defending units in D with range ≥ 1 roll once (attack
     value) if an attacker hex is in range. Defender return-fire hits =
     sum of those hits. Embarked land units on water hexes do not
     return fire.
   - Assign attacker hits to D using casualty priority; remove casualties
     from DB. If a naval unit on a water hex is destroyed, check transport
     capacity vs. embarked land units; destroy excess per §9.5.
   - Assign defender return-fire hits to attacker hexes (most units
     remaining, then lowest H3 index); apply casualty priority; remove
     casualties.
5. Apply ground and naval movement orders: update every ground/naval unit
   that has an order to its destination hex. This includes transport stack
   movement (naval + land units moving together on water) and disembarkation
   (land units leaving a transport stack at a coastal hex). Validate
   transport capacity constraints before applying movement.
6. Apply ferry movement orders:
   For each air unit with a ferry order (process in deterministic order by
   origin hex H3 index ascending):
   - Check destination airport: owned and intact?
     - Yes: relocate air unit to destination.
     - No: check origin airport: owned and intact?
       - Yes: air unit stays at origin (ferry aborted).
       - No: air unit destroyed.
7. Get unit positions after all movement. Melee phase (post-move positions):
   Build melee combats: hexes that have ground/naval units from two or more
   sides. Air units do not participate in melee. Land units that disembarked
   at a coastal hex in step 5 DO participate in melee. Process hexes in
   deterministic order (H3 index ascending).
   For each melee hex: order sides by participant ID; resolve one round
   (attacker rolls attack, defender rolls defense); assign hits by casualty
   priority; remove casualties from DB.
8. Post-melee air unit check: for each air unit, verify its base airport hex
   is still owned by the air unit's player. If an enemy unit entered the
   airport hex during melee (or via movement in step 5), the air unit is
   destroyed.
9. Post-melee transport check: for each water hex, verify naval capacity
   is sufficient for embarked land units. If a naval unit was destroyed
   during melee (naval units in water hexes adjacent to contested coastal
   hexes can participate via ranged, and may take casualties), apply
   transport loss rules per §9.5.
10. Game-over check, clear pending orders, advance turn, set phase back to
   planning, save (existing behavior).
```

No player input during steps 2–10.

---

## 6. Edge cases and clarifications

- **Stacking:** If multiple friendly units are in one hex, they all defend together in melee. When they attack (ranged or melee), each unit rolls. No stacking limit is assumed unless specified elsewhere.
- **Ranged vs. same hex:** A unit with range 1 or 2 can still participate in melee if it is in the same hex as the enemy. So armor in a hex with enemy infantry both (a) can be resolved in ranged phase as attacker against **other** hexes, and (b) participates in melee in its own hex. No double-counting: each unit rolls once per phase (e.g. once in ranged for its chosen target or none, once in melee if in a contested hex).
- **Coastal bombardment:** Naval at range 2 can target land units in hexes within 2 (typically coastal). **Rule:** Armor in a land hex may attack naval units in an adjacent water hex (range 1). Infantry (range 0) cannot attack naval.
- **Multiple attackers on one hex:** When several hexes attack the same defender hex, resolve as one combined engagement (see §5 step 4). Assign defender return-fire hits to attacker hexes one at a time: choose the attacker hex with the most units remaining (ties: lowest H3 index); within that hex apply casualty priority.
- **Arbitrary number of players:** Participant IDs are assigned once per side at the start of combat; melee with three or more sides in one hex uses the round-robin sub-engagement order. Ranged engagements are unchanged (attacker hexes vs defender hex; a defender hex may contain units from multiple sides; casualty priority applies to the stack).
- **Line of sight / blocking:** Ranged and air strikes are not blocked by terrain or intervening units. Any enemy-occupied hex within the attacker's range (H3 grid distance ≤ range) is a valid target. Implementations need not model line of sight for the initial combat system.
- **Reproducibility:** Use a single RNG seed for the entire game so that replay is deterministic (same orders and same seed produce the same outcome). Optional: support a "deterministic" mode (e.g. average or fixed roll) for testing.
- **Air unit base capture:** If an enemy ground unit enters a hex containing an airport with a based air unit (whether via movement in step 5 or after melee in step 7), the air unit is destroyed during the post-melee check (step 8). The air unit does not fight in melee — it is simply lost. This makes ground defense of airports critical.
- **Air unit destroyed during air strike phase:** If air unit A strikes air unit B's airport and destroys it, and air unit B has not yet resolved its own strike this phase (higher H3 index), air unit B is destroyed before it can act. Processing order within the air strike phase is consequential.
- **Multiple air units at same airport:** Multiple air units may be based at the same airport. If the airport is destroyed (by air strike or ground capture), all co-located air units are destroyed.
- **Ferry to occupied airport:** An air unit may ferry to an airport that already has one or more air units based there. There is no stacking limit for air units at airports.
- **Self-strikes (scorched earth):** A player may order an air unit to strike their own infrastructure — urban hexes, airports, or seaports in hexes they control. This allows deliberate denial of infrastructure to an advancing enemy. Self-striking an airport with your own air units based there destroys those air units (including potentially the striking unit itself, depending on processing order). Counter-fire rules apply normally; the infrastructure does not distinguish between friendly and enemy strikes. Self-striking a seaport denies it as an embarkation point for enemy sealift operations (see §9).
- **Multiple strikes on same hex:** Multiple air units may strike the same target hex in the same turn. Each strike resolves independently in processing order. Two strikes targeting urban hexes at the same res1 hex destroy up to 6 res4 urban hexes (3 per hit, capped at remaining). Two strikes on the same airport: the first destroys it (and any based air units); the second finds no airport and resolves as a miss (no valid infrastructure target).
- **Air unit survival and territorial control:** The post-melee air check (step 8) uses **hex ownership**, not enemy unit presence. If an enemy ground unit enters an airport hex during movement (step 5), territorial control changes immediately per the 1.4 rules — even if that enemy unit is subsequently destroyed in melee (step 7). The airport hex remains under enemy control with no surviving units, and the based air unit is destroyed in step 8. This is intentional: recapturing an airport hex requires a separate ground action on a subsequent turn.
- **No interception in transit:** Air units executing a ferry order cannot be attacked or intercepted during transit. They are not considered to "fly over" intermediate hexes — the ferry is an instantaneous relocation from origin airport to destination airport at resolution time. Enemy units along the path have no opportunity to engage. This is a deliberate simplification; air-to-air interception, if ever needed, is a theatre-level mechanic for Phase 3, not a global-level ferry rule.
- **Visibility model:** Ground units (infantry, armor) see only their own hex. Naval units see only their own hex. Air units see a 3-hex radius around their base airport (§8.2). Air units are the sole source of extended visibility — there is no adjacent-hex vision for ground or naval units. This makes fog of war thick by default and air reconnaissance a critical strategic capability rather than an incremental improvement over existing unit vision. Note that the three air ranges are deliberately distinct: visibility 3, strike 3, ferry 4. Visibility and strike share the same radius; ferry extends further because it targets player-owned airports that don't require reconnaissance to locate.

---

## 7. Attack capabilities summary

| Unit    | Range (hexes) | Can strike |
|---------|---------------|------------|
| Infantry| 0             | Same hex only (melee). **Cannot attack while on a water hex (embarked).** |
| Armor   | 1             | Same hex (melee) or **any adjacent hex** (land or water). **Cannot attack while on a water hex (embarked).** |
| Naval   | 2             | Same hex (melee) or **any hex at distance 1 or 2** (land or water). |
| Air     | 3             | **Any hex within 3 hexes of base airport** (air strike phase only). Can target units or infrastructure. Cannot participate in melee. |

So: **air can strike out to 3 hexes** from base (units or infrastructure). **Naval can strike out to 2 hexes** (units only). **Armor can strike adjacent hexes only** (units only). Infantry is melee-only. Land units on water hexes are passengers and cannot attack or defend.

---

## 8. Air operations and infrastructure destruction

### 8.1 Air strike vs. enemy units

An air unit with a strike order targeting an enemy-occupied hex resolves as follows:

1. The air unit rolls d6. Hit if roll ≤ 3 (attack value).
2. If hit, assign one casualty to the target hex using the standard casualty priority (lowest defense first; ties: infantry → armor → naval → air).
3. **Counter-fire:** Every defending unit in the target hex with range ≥ 1 rolls d6; hit if roll ≤ that unit's attack value. If any counter-fire roll hits, the air unit is destroyed. There is no range-to-base check — the aircraft flies to the target hex, so defenders are shooting at aircraft overhead, not at a distant airfield.
   - Armor (range 1, attack 3): returns fire, hitting on 1–3.
   - Naval (range 2, attack 2): returns fire, hitting on 1–2.
   - Infantry (range 0): cannot return fire against air.
   - Air units at the target hex: cannot return fire (air units only act during their own strike order).
   - **Embarked land units on water hexes: cannot return fire** (see §9.4). Only naval units in the hex return counter-fire.

**Target selection:** Players order air strikes against "units" as a generic target type. The player does not choose which unit type to hit — the standard casualty priority assigns the hit automatically (lowest defense first; ties: infantry → armor → naval → air).

### 8.2 Air visibility

Each air unit grants its owning player visibility of all hexes within 3 hexes of its base airport. This visibility includes terrain, occupying units, build queues, and infrastructure status. Visibility is continuous — it applies during the planning phase as well as resolution — and does not require the air unit to take any action. An air unit that executes a strike order or ferry order still provides visibility.

Air units are the **only** source of extended visibility. Ground units (infantry, armor) and naval units see only the hex they occupy. Without air coverage, a player is blind beyond their front line. This makes air reconnaissance a transformative strategic capability — a single air unit at a well-positioned airport reveals up to 37 hexes, potentially 10–15% of all land hexes. Destroying an enemy's airports (§8.3) doesn't just eliminate their strike capability; it collapses their intelligence picture.

### 8.3 Air strike vs. infrastructure

An air unit may target infrastructure at a hex within its 3-hex strike radius instead of targeting enemy units. The target hex may be enemy-controlled, neutral, or even owned by the striking player (see §6, "Self-strikes"). Three infrastructure target types exist, each with different effects and counter-fire risk. **Infrastructure counter-fire is the same whether or not the hex is occupied by enemy units.** Units in the hex do not participate in counter-fire against infrastructure strikes — the infrastructure's own defenses are the sole source of risk. At the res1 hex scale (~1,700 km across), a garrison in the hex is not meaningfully co-located with the specific infrastructure being bombed.

**Target: Urban hex.** The air unit rolls d6, hit if roll ≤ 3. On hit, **3 res4 urban hexes** at the target res1 hex are permanently destroyed — replaced by rubble (see §1.1) — or all remaining urban hexes if fewer than 3 remain, reducing the territory's urban hex count and therefore its per-turn production rate (see §2). Sustained urban strikes can meaningfully degrade or halt production at a territory. Counter-fire: roll d6 for ground defenses; the air unit is destroyed if roll ≤ 1 (17% risk). Destroying urban hexes is low-risk but strategically consequential — the production rate is reduced for all players permanently, including the attacker if they later capture the territory.

**Target: Airport.** The air unit rolls d6, hit if roll ≤ 3. On hit, the airport is permanently destroyed. Any air units based at the destroyed airport are also destroyed immediately (including friendly air units in the case of a self-strike — see §6). Counter-fire: roll d6 for AA defenses; the air unit is destroyed if roll ≤ 2 (33% risk). Airports are the highest-risk target due to concentrated air defenses, but destroying them eliminates based air power and its associated visibility.

**Target: Seaport.** The air unit rolls d6, hit if roll ≤ 3. On hit, the seaport is permanently destroyed. No new naval units can be produced at or launched from this hex. The hex can no longer be used as an embarkation point for naval transport (see §9.1). Naval units already at sea are unaffected. Counter-fire: roll d6 for seaport defenses; the air unit is destroyed if roll ≤ 1 (17% risk).

### 8.4 Infrastructure destruction is permanent

Destroyed urban hexes, airports, and seaports do not rebuild. This is a deliberate design decision that applies globally — no player can restore destroyed infrastructure, even if they control the hex. This creates a strategic tension: destroying enemy infrastructure cripples their war effort, but also degrades the value of territory you might later capture. Air power is a scorched-earth weapon. Destroying seaports has the additional strategic effect of denying embarkation points for naval transport operations — a defensive player can bomb their own coastal seaports to prevent enemy sealift into their territory.

### 8.5 Counter-fire summary

| Target type | Air attack value | Counter-fire source | Counter-fire threshold |
|-------------|-----------------|---------------------|----------------------|
| Enemy units | 3 (50%) | Each defending unit with range ≥ 1 in target hex rolls independently (embarked land units on water hexes excluded) | Defender's attack value (no range-to-base check) |
| Urban hex | 3 (50%), destroys 3 res4 hexes | Ground defenses (fixed roll, unaffected by hex occupation) | ≤ 1 (17%) |
| Airport | 3 (50%) | AA defenses (fixed roll, unaffected by hex occupation) | ≤ 2 (33%) |
| Seaport | 3 (50%) | Seaport defenses (fixed roll, unaffected by hex occupation) | ≤ 1 (17%) |

**Key distinction:** When targeting units, counter-fire comes from the defending units themselves — each eligible unit rolls independently, and any single hit destroys the air unit. When targeting infrastructure, counter-fire comes from the infrastructure's fixed defenses — a single roll at the listed threshold. Units in the hex never participate in infrastructure counter-fire.

Counter-fire thresholds are starting values. Tune through playtesting — if air is too dominant, increase counter-fire thresholds; if air units die too quickly to be useful, decrease them.

---

## 9. Naval transport (sealift)

Naval units can transport land units across water hexes, enabling cross-ocean force projection. Without sealift, land power is permanently continent-locked.

### 9.1 Embarkation

Land units embark by moving to a hex with **coastal terrain** (see §1.1) that has a **seaport feature** where naval units are present, using their normal movement action. The land units must be co-located with the naval units at the **start of a turn** for the transport stack to move together — embarkation and sailing cannot occur in the same turn.

A seaport is required for embarkation. If a seaport is destroyed (by air strike, see §8.3), the hex can no longer serve as an embarkation point. This makes seaport denial — including self-strikes on your own seaports — a viable defensive strategy against enemy sealift.

### 9.2 Capacity

Each naval unit has a transport capacity of **2**. Land units have transport weights: infantry = 1, armor = 2. The engine validates capacity when a transport stack enters a water hex:

- 1 naval unit can carry: 2 infantry (weight 2), or 1 armor (weight 2), or 1 infantry (weight 1, with 1 capacity unused).
- 2 naval units can carry: up to 4 infantry, or 2 armor, or 1 armor + 2 infantry, or other combinations not exceeding total capacity of 4.

Orders that would violate capacity are rejected before resolution.

### 9.3 Stack movement

On water hexes, land and naval units move as a **mixed stack** using the naval unit's movement speed (2 hexes/turn). The entire stack must be selected and moved together — partial stack movement on water hexes (e.g., moving one naval unit and leaving another with the land units) is permitted only if remaining naval capacity is sufficient for the land units that stay. If a route change occurs on a water hex, the entire stack must be re-selected and moved, or the order is rejected.

Land units in a transport stack do not consume their own movement action — they are passengers. Their movement for the turn is determined entirely by the naval unit's movement.

### 9.4 Combat restrictions while embarked

Land units on **water hexes** (i.e., being transported at sea):
- **Cannot** use melee attacks.
- **Cannot** use ranged attacks.
- **Cannot** return counter-fire against air strikes (see §8.1).
- Are fully dependent on their naval escorts for defense.

Land units on **coastal hexes** (whether pre-embarkation, post-disembarkation, or simply present) fight normally with their full attack, defense, and range capabilities. The combat restriction applies exclusively to water hexes.

### 9.5 Transport loss

If a naval unit is destroyed on a water hex (by air strike, ranged combat, or melee with adjacent naval forces) and the remaining naval transport capacity is **insufficient** for the land units present:

1. Calculate excess: total land unit transport weight minus remaining naval capacity.
2. **Randomly** destroy land units until the remaining weight fits within capacity. Standard casualty priority does not apply — the destruction is random, representing the chaos of a transport sinking at sea.

Example: 2 naval units carrying 3 infantry (weight 3). One naval unit is destroyed, leaving capacity 2. Excess weight = 1. One infantry is randomly destroyed. The remaining 2 infantry continue aboard the surviving naval unit.

If **all** naval units on a water hex are destroyed, **all** embarked land units are destroyed — there is no survival at sea without transport.

### 9.6 Disembarkation

When a transport stack reaches any hex with **coastal terrain** (see §1.1) — no seaport required — land units may disembark. Disembarkation occurs during the ground/naval movement phase (§4.3) — the land units appear on the coastal hex as part of the stack's movement. Land units that disembark cannot move further that turn (the naval unit's movement determines their position for the turn), but they **participate in melee** (phase 5) if enemies are present at the coastal hex.

This enables **opposed amphibious landings**: a transport stack sails to a defended coastal hex, land units disembark during movement, and the disembarked units fight in melee at the end of the same turn. Amphibious assaults are high-risk — the land units arrive without the opportunity for ranged softening (ranged phase is pre-move), and the attacker must commit to the landing hex before knowing the melee outcome.

A seaport is **not** required for disembarkation. Land units can land at any coastal hex. This asymmetry (seaport required to embark, any coast to disembark) enables amphibious operations against coastlines without port infrastructure, while still making seaports strategically valuable as the only embarkation points.

### 9.7 Turn count examples

- **Inland-to-inland (minimum 3 turns):** Turn 1: land units move to a coastal port hex where naval units are present. Turn 2: the stack sails across water. Turn 3: stack arrives at a coastal hex, land units disembark and move inland.
- **Port-to-coast amphibious assault (minimum 2 turns):** Turn 1: land units are already co-located with naval units at a seaport. Turn 2: stack sails to the target coastal hex, land units disembark and fight in melee if enemies are present.
- **Long-distance sealift:** Multiple turns of sailing at naval movement speed (2 water hexes/turn). The stack is vulnerable to air strikes and naval engagements throughout the transit.

### 9.8 Strategic implications

Naval transport creates several emergent strategic dynamics:

- **Port denial:** Destroying enemy seaports (via air strikes, §8.3) prevents embarkation, potentially stranding land forces on a continent. Self-striking your own seaports denies them to an advancing enemy.
- **Escort requirements:** Transport stacks at sea are high-value targets — carrying land units that cannot defend themselves. Escorting transports with additional naval units (providing ranged defense) or timing sealift to avoid enemy air coverage are meaningful decisions.
- **Amphibious threat:** The ability to land on any coastal hex (not just ports) means defenders must guard their entire coastline, not just port cities. Air reconnaissance (§8.2) becomes critical for detecting incoming transport stacks.
- **Force composition trade-offs:** Infantry (weight 1) is twice as transport-efficient as armor (weight 2). An invasion force of infantry is cheaper and more transportable; an armor-heavy invasion requires more naval assets. This creates meaningful force composition decisions for sealift operations.

---

## 10. Optional extensions (later)

- **Multi-round melee:** In the same resolution, allow multiple rounds of melee in the same hex until one side is eliminated or a cap (e.g. 3 rounds) is reached. Still no player choices — engine runs rounds automatically.
- **Terrain modifiers:** E.g. armor attack/defense reduced in mountain/forest; infantry defense bonus in forest.
- **Unit hit points:** Instead of one hit = one unit lost, give units HP and weapon strength; same dice principle, different casualty math.
- **Infrastructure rebuilding:** If permanent destruction proves too punishing in playtesting, add a rebuild mechanic with resource cost and multi-turn construction time.
- **Additional unit types:** Mechanized infantry, artillery, submarines, dedicated transports — fit into the same phase structure and automatic casualty assignment. Air-to-air combat (if multiple air domains are needed) would extend the air strike phase.

---

## 11. Summary

- **A&A-style:** One die per unit, hit when roll ≤ attack (when attacking) or ≤ defense (when defending in melee).
- **Air strikes:** Air units strike first (range 3 from base airport), targeting units or infrastructure. Players choose one of four target types: units, urban hexes, airports, or seaports. When targeting units, counter-fire comes from defending units with range ≥ 1 (no range-to-base check; embarked land units on water hexes excluded). When targeting infrastructure, a fixed counter-fire roll applies regardless of hex occupation. Urban hex strikes destroy 3 res4 hexes per hit. One action per turn: strike or ferry.
- **Infrastructure destruction:** Urban hexes, airports, and seaports can be permanently destroyed by air strikes. No rebuilding. Infrastructure counter-fire is independent of hex occupation. Seaport destruction denies embarkation for naval transport.
- **Naval transport:** Naval units carry land units across water (capacity 2 per naval; infantry weight 1, armor weight 2). Embark at seaports, disembark at any coastal hex. Land units cannot fight on water hexes. Transport loss destroys excess land units randomly. Disembarked units participate in same-turn melee, enabling amphibious landings.
- **Ranged:** Naval 2 hexes, armor 1 hex; infantry melee only. Defenders with range may return fire (attack roll) when attackers are within range.
- **WEGO-friendly:** Five-phase resolution (air strike → ranged → ground/naval movement → ferry → melee); automatic casualty assignment by fixed priority; no player-to-player interaction or confirmations.

This gives a concrete, implementable combat system that matches the current four-unit roster with naval transport capability, and can be extended to a fuller roster in later milestones.

---

## 12. Display (animation)

During the resolution phase, the client animates in seven steps so that combat and death overlays stay on the correct units:

1. **Air strike indicators** — Highlight at hexes where air strikes occurred; air units shown at base airports, strike target hexes highlighted. Units drawn at **pre-move** positions. Transport stacks on water hexes render with their embarked land units visible.
2. **Air strike casualties** — Red X at hexes where air strike casualties occurred (both target casualties and counter-fire losses at base airports). Infrastructure destruction indicators at hexes where urban hexes, airports, or seaports were destroyed. Transport loss indicators at water hexes where embarked land units were destroyed due to naval unit loss.
3. **Ranged lightning** — Yellow lightning at hexes where ranged combat occurred; units drawn at **pre-move** positions (including removed ranged casualties so they remain visible).
4. **Ranged casualties** — Red X at hexes where ranged units were removed; same pre-move positions. Transport loss indicators if naval units in transport stacks were destroyed.
5. **Movement** — Ground and naval units interpolate from source to destination hexes. Transport stacks animate as a group — naval and land units moving together on water. Disembarking land units animate from the transport stack to the coastal hex. Air units executing ferry orders appear at their new airport (or show destruction animation if ferry failed and origin was lost).
6. **Melee lightning** — Yellow lightning at hexes where melee combat occurred; units drawn at **post-move** positions (including removed melee casualties). Amphibious landing melee at coastal hexes should be visually distinctive.
7. **Melee casualties** — Red X at hexes where melee units were removed; same post-move positions. Air units destroyed by base capture show destruction at their airport hex.

Air strike overlays appear first and complete before ranged overlays begin. Ranged overlays never "chase" moved units; melee overlays appear only after movement is complete.