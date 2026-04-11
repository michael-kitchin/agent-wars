# Combat Execution and Resolution Rules

*Version 3.0 — April 2026*

This document describes combat execution and resolution rules for the game, using **Axis & Allies 2**-style combat as a template. Rules are divided into two layers: **strategic** (res1 hex grid, the primary game) and **tactical** (res4 hex grid, optional zoom-in battles). Strategic rules use **WEGO** turn resolution with **no player-to-player interaction or confirmations**. Tactical rules use a player-driven turn structure within a paused strategic game.

**Stated needs addressed:**
1. **Offensive and defensive strengths and weaknesses** — §3 and §2 (unit roster) define attack/defense values, range, and roles; §3.5 summarizes cross-domain and terrain.
2. **Ranged attack capabilities** — §2 (range 0/1/2/3), §7 (summary table): air 3 hexes (strike from base), naval 2 hexes, armor adjacent (1 hex), infantry melee only. Tactical-level ranged capabilities defined in §12.
3. **Zero player interaction / WEGO streamlining** — No confirmations or back-and-forth at the strategic level: resolution order (air strike then ranged then melee), casualty assignment (fixed priority), and attacker/defender ordering (participant IDs assigned at combat start) are all engine-defined. Single resolution phase after movement.
4. **Infrastructure destruction** — §8 defines permanent destruction of urban hexes, airports, and seaports via air strikes, with target-type-specific counter-fire risk.
5. **Optional tactical battles** — §12 defines the tactical game layer: unit multiplication, movement budgets, terrain interactions, ranged fire, entry-side injection, and bail-out resolution.

---

## 1. Design principles

- **Simultaneous resolution (strategic):** The engine resolves all combat and movement in a defined five-phase sequence. No mid-combat input from any player.
- **Dice-based hits:** Each unit rolls one die; a hit is scored when the result is **less than or equal to** that unit's attack or defense value (A&A style).
- **Automatic casualty assignment:** When hits are scored, the engine assigns casualties using a fixed priority (e.g. lowest defense first). No player chooses which unit is lost.
- **Five-phase resolution (strategic):** Air strikes → ranged → ground/naval movement → ferry movement → melee. Each phase resolves completely before the next begins.
- **Participant IDs:** At the start of combat resolution, each side (player) that has at least one unit in any combat is assigned a unique random integer ID by the game RNG. All ordering for that resolution phase (attacker/defender in melee, tie-breaks, multi-player melee order) uses these IDs. This supports an arbitrary number of players.
- **RNG:** A single seed is used for the entire game so that replay is deterministic.
- **Infrastructure destruction is permanent.** Destroyed urban hexes, airports, and seaports do not rebuild. This applies to all players — the attacker cannot recover infrastructure they destroy, even if they later control the hex.
- **Tactical battles are optional.** When opposing units share a res1 hex, the player may fight a tactical battle or resolve strategically. Bailing out of a tactical battle resolves the remainder automatically.

---

## 2. Unit roster (strategic level)

The game has four unit types. Unit caps are 10 infantry, 5 armor, 5 naval, and 3 air (23 total). Fallback if playtesting shows 23 is too many for LLM briefing quality: 8 infantry, 4 armor, 4 naval, 2 air (18 total).

| Unit type | Move | Attack | Defense | Range | Domain | Cost |
|-----------|------|--------|---------|-------|--------|------|
| **Infantry** | 1 | 1 | 2 | 0 (melee only) | Land | 10 urban hexes |
| **Armor** | 2 | 3 | 2 | 1 (adjacent hex) | Land | 20 urban hexes |
| **Naval** | 2 | 2 | 2 | 2 hexes | Water | 50 urban hexes |
| **Air** | 0 (ferry only) | 3 | 1 | 3 (strike radius) | Air | 30 urban hexes |

- **Range 0:** Unit only participates in same-hex (melee) combat.
- **Range 1:** Unit can attack an enemy in any **adjacent** hex (H3 grid distance 1; includes land–water boundary; see §6 for coastal bombardment).
- **Range 2:** Unit can attack enemies in hexes at distance 1 or 2 (e.g. naval gunfire). Range is measured by H3 grid distance (same metric as movement).
- **Range 3 (air only):** Unit can strike any hex within 3 hexes of its base airport. Air units do not use incremental movement — they strike from their base and return in the same phase.
- **Move 0 (air):** Air units have no incremental movement. They reposition via ferry orders (up to 4 hexes between owned airports, one action per turn — see §4.4). Ferry range (4) is longer than strike/visibility range (3), reflecting that a player always knows where their own airports are — ferry destinations don't require air reconnaissance, just ownership.
- **Cost:** The cost column is the total production points required to build the unit. Each res1 hex generates production points equal to its res4 urban hex count per turn. Points accumulate toward the unit cost across multiple turns; when accumulated points meet or exceed the cost, the unit spawns and excess production carries over immediately to the next unit in the queue. If the excess is sufficient to cover the next unit's cost, that unit also spawns in the same turn — a hex produces as many units per turn as its production rate and unit caps allow.

  Examples: a hex with 5 urban hexes produces 1 infantry (cost 10) every 2 turns. A hex with 15 urban hexes and a seaport queues a naval unit (cost 50) followed by an infantry: the naval unit spawns on turn 4 (15 × 4 = 60 ≥ 50) with 10 points left over, which immediately covers the infantry cost (10), so both units spawn on turn 4.

  Air strikes that destroy urban hexes (3 res4 hexes per hit) permanently reduce the production rate. Air unit cost (30) is a starting value subject to playtesting.

---

## 3. Offensive and defensive strengths and weaknesses

### 3.1 Infantry

- **Strengths:** Cheap, high defense (2) so they absorb hits well. Best used to hold hexes and absorb attacks.
- **Weaknesses:** Low attack (1) — only a roll of 1 scores a hit. No ranged attack; must be in the same hex to fight. Cannot return fire against air strikes.
- **Role:** Defensive anchor, zone control, screening, airport/infrastructure defense.

### 3.2 Armor

- **Strengths:** High attack (3) — hits on 1–3. Can attack **adjacent** hexes (ranged 1), so it can strike without entering the target hex. Good mobility (move 2).
- **Weaknesses:** Defense 2, same as infantry; no extra durability. Vulnerable to concentrated fire if exposed.
- **Role:** Offensive punch, ranged pressure on adjacent hexes, exploitation.

### 3.3 Naval

- **Strengths:** Move 2, ranged 2 — can strike enemies up to 2 hexes away (e.g. shore bombardment or sea combat). Attack 2, defense 2.
- **Weaknesses:** Restricted to water; cannot enter land hexes. No melee in land hexes; only contributes from water via ranged attack.
- **Role:** Naval control, coastal bombardment, striking land or sea targets from distance.

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

### 4.2 Ranged phase (pre-move positions)

Using the **current** (pre-movement) positions, after air strike casualties are applied:
- Build ranged attacks: for each unit with range ≥ 1 (armor, naval — **not** air, which resolves in §4.1), determine enemy-occupied hexes within range; each (attacker hex, defender hex) is a ranged attack.
- Resolve all ranged engagements. Apply casualties and remove eliminated units. No melee yet.

### 4.3 Apply ground and naval movement

Move every ground and naval unit that has a movement order to its destination. Positions are now final for ground and naval units.

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

### 4.6 Resolution ordering and determinism

This five-phase order ensures: air strikes resolve first, giving air power a "first strike" advantage that justifies the unit's fragility. Ranged attacks resolve when targets are still where the player aimed. Movement is applied only after ranged resolution. Ferry validation uses post-movement ground truth. Casualties are applied immediately after each engagement so that later engagements see updated unit counts.

Within each phase, process engagements in a **deterministic order** (e.g. by attacker/defender hex H3 index ascending). With a single game seed, replay is deterministic.

### 4.7 One round per phase

For simplicity, use **one round of fire per phase** per combat (or per attack):
- Air strike phase: each striking air unit rolls once. Counter-fire depends on target type: for unit targets, defending units with range ≥ 1 in the target hex each roll once (attack value); for infrastructure targets, a single fixed counter-fire roll is made (see §8). Hits are applied via automatic casualty rules.
- Ranged phase: each eligible attacker rolls once per eligible target hex. **Return fire:** defending units that have ranged capability (range ≥ 1) and for which at least one attacking unit's hex is within that defender unit type's range each roll once (**attack** value); those hits are assigned to attacker hexes. Hits are applied via automatic casualty rules.
- Melee phase: same — one round of rolls, then apply hits.

No "continue or retreat" — no player choices. If both sides remain in the same hex after melee, they will fight again in the **next turn's** resolution (no multi-round within the same resolution).

### 4.8 Hit and casualty rules

- **Roll:** One die per unit (d6, result 1–6).
- **Hit:** For **attack** (including return fire), hit if `roll ≤ attack value`. For **defense** (melee only), hit if `roll ≤ defense value`.
- **Return fire (ranged phase):** Only defending units with range ≥ 1 may return fire. A defending unit returns fire only if at least one attacker hex is within that unit type's range (H3 grid distance). Each such defender rolls once (attack value); hits are assigned to attacker hexes. Infantry (range 0) does not return fire at range.
- **Counter-fire against air (air strike phase):** See §8.1 for unit targets and §8.3 for infrastructure targets. Counter-fire mechanics vary by target type.
- **Casualty assignment (automatic):** When a side receives N hits, remove N of its units in that combat using a **fixed priority** so no player chooses. Remove units in order of **lowest defense value first** (so high-value units survive when possible). Ties: use unit-type order **infantry → armor → naval → air**. If the combat is ranged and the "defender" is a hex with mixed unit types, apply the same priority to that hex's stack.

### 4.9 Elimination

When a unit is chosen as a casualty (one hit = one unit removed), it is removed from the map. No capture, no retreat step — just removal.

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
      overhead. Any hit destroys the air unit.
   d. For infrastructure targets: see §8.3. Air unit rolls attack; on hit,
      infrastructure is destroyed. Infrastructure counter-fire roll
      determines risk to air unit. Units in the hex do not participate in
      counter-fire against infrastructure strikes.
   e. Apply all casualties and infrastructure destruction immediately.
4. Ranged phase (pre-move positions, post-air-strike casualties):
   Build ranged attacks from declared orders and current positions (armor
   range 1, naval range 2 — air units do not participate). Group by
   defender hex; process in deterministic order (defender hex H3 index
   ascending).
   For each ranged engagement (one defender hex D, set of attacker hexes):
   - All units in attacker hexes that have D in range each roll once.
     Attacker hits = sum of hits (roll ≤ attack).
   - Return fire: defending units in D with range ≥ 1 roll once (attack
     value) if an attacker hex is in range. Defender return-fire hits =
     sum of those hits.
   - Assign attacker hits to D using casualty priority; remove casualties
     from DB.
   - Assign defender return-fire hits to attacker hexes (most units
     remaining, then lowest H3 index); apply casualty priority; remove
     casualties.
5. Apply ground and naval movement orders: update every ground/naval unit
   that has an order to its destination hex.
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
   sides. Air units do not participate in melee. Process hexes in
   deterministic order (H3 index ascending).
   For each melee hex: order sides by participant ID; resolve one round
   (attacker rolls attack, defender rolls defense); assign hits by casualty
   priority; remove casualties from DB.
8. Post-melee air unit check: for each air unit, verify its base airport hex
   is still owned by the air unit's player. If an enemy unit entered the
   airport hex during melee (or via movement in step 5), the air unit is
   destroyed.
9. Game-over check, clear pending orders, advance turn, set phase back to
   planning, save (existing behavior).
```

No player input during steps 2–9.

---

## 6. Edge cases and clarifications

- **Stacking:** If multiple friendly units are in one hex, they all defend together in melee. When they attack (ranged or melee), each unit rolls. No stacking limit is assumed unless specified elsewhere.
- **Ranged vs. same hex:** A unit with range 1 or 2 can still participate in melee if it is in the same hex as the enemy. So armor in a hex with enemy infantry both (a) can be resolved in ranged phase as attacker against **other** hexes, and (b) participates in melee in its own hex. No double-counting: each unit rolls once per phase (e.g. once in ranged for its chosen target or none, once in melee if in a contested hex).
- **Coastal bombardment:** Naval at range 2 can target land units in hexes within 2 (typically coastal). **Rule:** Armor in a land hex may attack naval units in an adjacent water hex (range 1). Infantry (range 0) cannot attack naval.
- **Multiple attackers on one hex:** When several hexes attack the same defender hex, resolve as one combined engagement (see §5 step 4). Assign defender return-fire hits to attacker hexes one at a time: choose the attacker hex with the most units remaining (ties: lowest H3 index); within that hex apply casualty priority.
- **Arbitrary number of players:** Participant IDs are assigned once per side at the start of combat; melee with three or more sides in one hex uses the round-robin sub-engagement order. Ranged engagements are unchanged (attacker hexes vs defender hex; a defender hex may contain units from multiple sides; casualty priority applies to the stack).
- **Line of sight / blocking (strategic):** Ranged and air strikes are not blocked by terrain or intervening units. Any enemy-occupied hex within the attacker's range (H3 grid distance ≤ range) is a valid target. Implementations need not model line of sight for the strategic combat system.
- **Reproducibility:** Use a single RNG seed for the entire game so that replay is deterministic (same orders and same seed produce the same outcome). Optional: support a "deterministic" mode (e.g. average or fixed roll) for testing.
- **Air unit base capture:** If an enemy ground unit enters a hex containing an airport with a based air unit (whether via movement in step 5 or after melee in step 7), the air unit is destroyed during the post-melee check (step 8). The air unit does not fight in melee — it is simply lost. This makes ground defense of airports critical.
- **Air unit destroyed during air strike phase:** If air unit A strikes air unit B's airport and destroys it, and air unit B has not yet resolved its own strike this phase (higher H3 index), air unit B is destroyed before it can act. Processing order within the air strike phase is consequential.
- **Multiple air units at same airport:** Multiple air units may be based at the same airport. If the airport is destroyed (by air strike or ground capture), all co-located air units are destroyed.
- **Ferry to occupied airport:** An air unit may ferry to an airport that already has one or more air units based there. There is no stacking limit for air units at airports.
- **Self-strikes (scorched earth):** A player may order an air unit to strike their own infrastructure — urban hexes, airports, or seaports in hexes they control. This allows deliberate denial of infrastructure to an advancing enemy. Self-striking an airport with your own air units based there destroys those air units (including potentially the striking unit itself, depending on processing order). Counter-fire rules apply normally; the infrastructure does not distinguish between friendly and enemy strikes.
- **Multiple strikes on same hex:** Multiple air units may strike the same target hex in the same turn. Each strike resolves independently in processing order. Two strikes targeting urban hexes at the same res1 hex destroy up to 6 res4 urban hexes (3 per hit, capped at remaining). Two strikes on the same airport: the first destroys it (and any based air units); the second finds no airport and resolves as a miss (no valid infrastructure target).
- **Air unit survival and territorial control:** The post-melee air check (step 8) uses **hex ownership**, not enemy unit presence. If an enemy ground unit enters an airport hex during movement (step 5), territorial control changes immediately per the 1.4 rules — even if that enemy unit is subsequently destroyed in melee (step 7). The airport hex remains under enemy control with no surviving units, and the based air unit is destroyed in step 8. This is intentional: recapturing an airport hex requires a separate ground action on a subsequent turn.
- **No interception in transit:** Air units executing a ferry order cannot be attacked or intercepted during transit. They are not considered to "fly over" intermediate hexes — the ferry is an instantaneous relocation from origin airport to destination airport at resolution time. Enemy units along the path have no opportunity to engage. This is a deliberate simplification; air-to-air interception, if ever needed, is a tactical-level mechanic for Phase 3, not a global-level ferry rule.
- **Visibility model:** Ground units (infantry, armor) see only their own hex. Naval units see only their own hex. Air units see a 3-hex radius around their base airport (§8.2). Air units are the sole source of extended visibility — there is no adjacent-hex vision for ground or naval units. This makes fog of war thick by default and air reconnaissance a critical strategic capability rather than an incremental improvement over existing unit vision. Note that the three air ranges are deliberately distinct: visibility 3, strike 3, ferry 4. Visibility and strike share the same radius; ferry extends further because it targets player-owned airports that don't require reconnaissance to locate.

---

## 7. Attack capabilities summary

| Unit    | Range (hexes) | Can strike |
|---------|---------------|------------|
| Infantry| 0             | Same hex only (melee). |
| Armor   | 1             | Same hex (melee) or **any adjacent hex** (land or water). |
| Naval   | 2             | Same hex (melee) or **any hex at distance 1 or 2** (land or water). |
| Air     | 3             | **Any hex within 3 hexes of base airport** (air strike phase only). Can target units or infrastructure. Cannot participate in melee. |

So: **air can strike out to 3 hexes** from base (units or infrastructure). **Naval can strike out to 2 hexes** (units only). **Armor can strike adjacent hexes only** (units only). Infantry is melee-only.

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

**Target selection:** Players order air strikes against "units" as a generic target type. The player does not choose which unit type to hit — the standard casualty priority assigns the hit automatically (lowest defense first; ties: infantry → armor → naval → air).

### 8.2 Air visibility

Each air unit grants its owning player visibility of all hexes within 3 hexes of its base airport. This visibility includes terrain, occupying units, build queues, and infrastructure status. Visibility is continuous — it applies during the planning phase as well as resolution — and does not require the air unit to take any action. An air unit that executes a strike order or ferry order still provides visibility.

Air units are the **only** source of extended visibility. Ground units (infantry, armor) and naval units see only the hex they occupy. Without air coverage, a player is blind beyond their front line. This makes air reconnaissance a transformative strategic capability — a single air unit at a well-positioned airport reveals up to 37 hexes, potentially 10–15% of all land hexes. Destroying an enemy's airports (§8.3) doesn't just eliminate their strike capability; it collapses their intelligence picture.

### 8.3 Air strike vs. infrastructure

An air unit may target infrastructure at a hex within its 3-hex strike radius instead of targeting enemy units. The target hex may be enemy-controlled, neutral, or even owned by the striking player (see §6, "Self-strikes"). Three infrastructure target types exist, each with different effects and counter-fire risk. **Infrastructure counter-fire is the same whether or not the hex is occupied by enemy units.** Units in the hex do not participate in counter-fire against infrastructure strikes — the infrastructure's own defenses are the sole source of risk. At the res1 hex scale (~1,700 km across), a garrison in the hex is not meaningfully co-located with the specific infrastructure being bombed.

**Target: Urban hex.** The air unit rolls d6, hit if roll ≤ 3. On hit, **3 res4 urban hexes** at the target res1 hex are permanently destroyed (or all remaining urban hexes if fewer than 3 remain), reducing the territory's urban hex count and therefore its per-turn production rate (see §2). Sustained urban strikes can meaningfully degrade or halt production at a territory. Counter-fire: roll d6 for ground defenses; the air unit is destroyed if roll ≤ 1 (17% risk). Destroying urban hexes is low-risk but strategically consequential — the production rate is reduced for all players permanently, including the attacker if they later capture the territory.

**Target: Airport.** The air unit rolls d6, hit if roll ≤ 3. On hit, the airport is permanently destroyed. Any air units based at the destroyed airport are also destroyed immediately (including friendly air units in the case of a self-strike — see §6). Counter-fire: roll d6 for AA defenses; the air unit is destroyed if roll ≤ 2 (33% risk). Airports are the highest-risk target due to concentrated air defenses, but destroying them eliminates based air power and its associated visibility.

**Target: Seaport.** The air unit rolls d6, hit if roll ≤ 3. On hit, the seaport is permanently destroyed. No new naval units can be produced at or launched from this hex. Naval units already at sea are unaffected. Counter-fire: roll d6 for seaport defenses; the air unit is destroyed if roll ≤ 1 (17% risk).

### 8.4 Infrastructure destruction is permanent

Destroyed urban hexes, airports, and seaports do not rebuild. This is a deliberate design decision that applies globally — no player can restore destroyed infrastructure, even if they control the hex. This creates a strategic tension: destroying enemy infrastructure cripples their war effort, but also degrades the value of territory you might later capture. Air power is a scorched-earth weapon.

### 8.5 Counter-fire summary

| Target type | Air attack value | Counter-fire source | Counter-fire threshold |
|-------------|-----------------|---------------------|----------------------|
| Enemy units | 3 (50%) | Each defending unit with range ≥ 1 in target hex rolls independently | Defender's attack value (no range-to-base check) |
| Urban hex | 3 (50%), destroys 3 res4 hexes | Ground defenses (fixed roll, unaffected by hex occupation) | ≤ 1 (17%) |
| Airport | 3 (50%) | AA defenses (fixed roll, unaffected by hex occupation) | ≤ 2 (33%) |
| Seaport | 3 (50%) | Seaport defenses (fixed roll, unaffected by hex occupation) | ≤ 1 (17%) |

**Key distinction:** When targeting units, counter-fire comes from the defending units themselves — each eligible unit rolls independently, and any single hit destroys the air unit. When targeting infrastructure, counter-fire comes from the infrastructure's fixed defenses — a single roll at the listed threshold. Units in the hex never participate in infrastructure counter-fire.

Counter-fire thresholds are starting values. Tune through playtesting — if air is too dominant, increase counter-fire thresholds; if air units die too quickly to be useful, decrease them.

---

## 9. Sealift and naval transport

Naval units can transport land units across water. Transport uses an explicit cargo assignment model.

### 9.1 Cargo assignment

Each land unit has an `embarkedOn` field that identifies which naval unit it is assigned to (e.g. `"embarkedOn": "naval-2"`). Assignment requires the land unit and the naval unit to be in the same hex, and that hex must contain a seaport. Armor units are assigned before infantry (priority order). Players can reassign cargo via the stack popup UI; the LLM assigns cargo via the order format.

### 9.2 Embark and disembark

Embark requires a seaport. Disembark is permitted at any coastal hex — no seaport required. When a land unit with an `embarkedOn` assignment is given an independent movement order, it auto-disembarks as a pre-step in the movement phase. This enables "drop off and go" patterns where conflicting orders resolve naturally: the land unit disembarks first, then both units execute their movement orders independently.

### 9.3 Embarked unit combat

Embarked units can participate in melee on coastal hexes (the naval transport is close enough to shore) but cannot use ranged attacks while embarked. On water hexes, embarked units cannot participate in combat at all — they are cargo.

### 9.4 Transport loss

If a naval unit carrying cargo is destroyed on a water hex, all embarked units are destroyed (fatal loss — they sink with the transport). If a naval unit carrying cargo is destroyed on a coastal hex, embarked units are auto-disembarked to the coastal hex before the naval unit is removed (incidental loss — they wade ashore).

---

## 10. Optional extensions (later)

- **Multi-round melee:** In the same resolution, allow multiple rounds of melee in the same hex until one side is eliminated or a cap (e.g. 3 rounds) is reached. Still no player choices — engine runs rounds automatically.
- **Terrain modifiers (strategic):** E.g. armor attack/defense reduced in mountain/forest; infantry defense bonus in forest.
- **Unit hit points:** Instead of one hit = one unit lost, give units HP and weapon strength; same dice principle, different casualty math.
- **Infrastructure rebuilding:** If permanent destruction proves too punishing in playtesting, add a rebuild mechanic with resource cost and multi-turn construction time.
- **Additional unit types:** Mechanized infantry, artillery, submarines — fit into the same phase structure and automatic casualty assignment. Air-to-air combat (if multiple air domains are needed) would extend the air strike phase.

---

## 11. Summary (strategic level)

- **A&A-style:** One die per unit, hit when roll ≤ attack (when attacking) or ≤ defense (when defending in melee).
- **Air strikes:** Air units strike first (range 3 from base airport), targeting units or infrastructure. Players choose one of four target types: units, urban hexes, airports, or seaports. When targeting units, counter-fire comes from defending units with range ≥ 1 (no range-to-base check). When targeting infrastructure, a fixed counter-fire roll applies regardless of hex occupation. Urban hex strikes destroy 3 res4 hexes per hit. One action per turn: strike or ferry.
- **Infrastructure destruction:** Urban hexes, airports, and seaports can be permanently destroyed by air strikes. No rebuilding. Infrastructure counter-fire is independent of hex occupation.
- **Ranged:** Naval 2 hexes, armor 1 hex; infantry melee only. Defenders with range may return fire (attack roll) when attackers are within range.
- **Sealift:** Explicit cargo assignment via `embarkedOn` field. Embark at seaports, disembark at any coastal hex. Transport loss fatal on water, incidental on coast.
- **WEGO-friendly:** Five-phase resolution (air strike → ranged → ground/naval movement → ferry → melee); automatic casualty assignment by fixed priority; no player-to-player interaction or confirmations.

This gives a concrete, implementable combat system that matches the current four-unit roster and can be extended in later milestones.

---

## 12. Tactical game (optional battles at res4)

The tactical game is a separate combat layer that players may optionally engage when opposing strategic units share the same res1 hex. It plays out on the res4 hex grid within that res1 hex. While a tactical battle is in progress, the strategic game is paused — no other hexes resolve. This eliminates time synchronization complexity.

### 12.1 Triggering a tactical battle

When the strategic resolution phase produces a contested res1 hex (units from two or more sides present after movement), the UI offers the player a "tactical battle" option. The player may accept (entering the tactical game) or decline (resolving via standard strategic combat per §4–§5). The AI opponent does not choose — the human player's decision controls whether tactical mode is entered. If the human declines, standard strategic resolution applies.

### 12.2 Unit multiplication

Strategic units entering the tactical battle are decomposed into sub-units on the res4 grid:

| Strategic Unit | Sub-Units | Movement Budget | Ranged Attack (hexes) |
|---------------|-----------|-----------------|----------------------|
| Infantry | 12 | see §12.4 | 5 |
| Armor | 6 | see §12.4 | 10 |
| Air | 3 | unlimited (can strike anywhere in the res1 hex) | entire res1 hex |
| Naval | 2 | see §12.4 | 20 |

Sub-units inherit their parent's unit type for combat resolution. Each sub-unit fights as one unit in the A&A-style dice system (same attack/defense values as the strategic parent). The multiplication ratios are starting values subject to playtesting.

### 12.3 Entry-side injection

Sub-units are placed on the res4 hex grid at the edge corresponding to the direction from which the parent strategic unit entered the res1 hex. The engine tracks which of the six hex sides each strategic unit crossed during its most recent movement. If a unit was already in the hex before the turn (did not move this turn), its sub-units are placed at a default position — the hex center or a designated staging area.

Entry-side injection rewards strategic positioning. A player who moves units into a res1 hex from multiple directions creates a tactical advantage by forcing the defender to respond on multiple fronts.

### 12.4 Movement

Tactical movement uses a per-turn movement budget that is consumed as sub-units traverse res4 hexes. Movement cost varies by terrain and unit type. This is stateful pathfinding — the player plots a path and the sub-unit follows it, spending movement points per hex entered.

**Terrain movement costs (res4 hexes):**

| Terrain | Infantry | Armor | Naval |
|---------|----------|-------|-------|
| Plains | 1 | 1 | — |
| Forests | 2 (slowed) | 2 (slowed) | — |
| Mountains | 2 (slowed) | ∞ (blocked) | — |
| Wetlands | 1 | ∞ (blocked) | — |
| Desert | 1 | 1 | — |
| Arctic | 1 | ∞ (blocked) | — |
| Coastal | 1 | 2 (slowed) | 1 |
| Water | ∞ (blocked) | ∞ (blocked) | 1 |

Infantry can traverse all land terrain but is slowed by mountains and forests. Armor is blocked entirely by mountains, arctic, and wetlands, and slowed by forests and coastal terrain. Naval is restricted to water and coastal hexes. Air sub-units do not use the movement system — they can strike anywhere in the res1 hex each turn.

Movement budgets per turn are a playtesting variable. Starting values (res4 hexes per turn on flat terrain): infantry 2, armor 4, naval 3. These determine tactical pacing — how many turns it takes forces to cross the battlefield and engage.

### 12.5 Ranged combat

At the tactical level, all unit types gain ranged attack capability, reflecting the finer geographic scale:

- **Infantry:** Range 5 res4 hexes. A modest ranged attack representing divisional artillery and organic fire support.
- **Armor:** Range 10 res4 hexes. Longer-range fire representing combined arms firepower.
- **Naval:** Range 20 res4 hexes. Long-range naval gunfire dominating coastal approaches.
- **Air:** Can strike any hex within the res1 hex. No range limit within the tactical battlefield.

Ranged attacks use the same A&A-style dice resolution as strategic combat: roll d6, hit if roll ≤ attack value. Counter-fire applies if the target has range to reach the attacker. Casualty assignment follows the standard fixed priority.

Ranged attacks are not blocked by terrain — line of sight is not modeled at the tactical level. This is a deliberate simplification consistent with the strategic level's approach. If playtesting reveals that terrain-blocked LOS adds meaningful tactical depth without overwhelming the player or AI, it can be added later.

### 12.6 Tactical turn structure

The tactical game uses **WEGO** simultaneous resolution — the same model as the strategic game. Both sides issue orders, then all orders resolve at once. This maintains consistency with the strategic game's core identity: both levels are about committing to a plan under uncertainty and seeing how it plays out. It also eliminates the reactive advantage that IGOUGO would give the human player over the LLM opponent.

Each tactical turn:

1. **Planning phase:** Both sides issue movement orders for their sub-units (spending movement budget) and designate ranged attacks and air strikes.
2. **Air strike phase:** Air sub-units resolve strikes. Each air sub-unit may strike one target hex per tactical turn.
3. **Ranged phase:** Ranged attacks resolve simultaneously. Both sides fire; counter-fire applies if the target has range to reach the attacker. Casualties are assigned using the standard fixed priority.
4. **Movement phase:** All sub-units move simultaneously to their ordered destinations.
5. **Melee phase:** Melee resolves for any sub-units sharing a hex after movement.
6. **Casualties removed.** Next tactical turn begins.

This is the same five-phase sequence as the strategic level (air → ranged → movement → melee), minus the ferry phase which does not apply at tactical scale. The resolution logic is architecturally identical — the tactical engine runs the same phase pipeline on sub-units instead of strategic units.

### 12.7 Visibility

**Visibility in tactical battles is universal.** All sub-units on both sides are visible at all times regardless of terrain. There is no fog of war at the tactical level. This is a deliberate simplification that keeps the tactical layer focused on maneuver and fire rather than scouting, and keeps the LLM's decision space tractable when the AI participates.

### 12.8 Ending the tactical battle

A tactical battle ends in one of three ways:

1. **Decisive victory:** All opposing sub-units are eliminated. The surviving side's parent strategic units are marked as victorious and retain full strength (they were not destroyed at the strategic level).

2. **Player bail-out:** The player chooses to exit the tactical battle at any point. The remaining sub-units on both sides resolve automatically using dice rolls with **bail-out modifiers**. The modifiers are calibrated so that an immediate bail-out (before any tactical combat occurs) produces results similar to the standard strategic engagement resolution from §4–§5. As tactical losses accumulate before bail-out, the modifiers matter less — the attrition already taken dominates the outcome.

3. **AI bail-out (if applicable):** The LLM opponent may also choose to withdraw, resolving the remainder via bail-out modifiers from the AI's perspective.

**Bail-out modifier design principle:** The modifiers must be simple enough to summarize in one sentence to the player: "remaining forces fight it out with a slight defender advantage." The exact modifier formula is a playtesting variable, but it should produce outcomes that feel fair — a player who fought well tactically before bailing out should see a better outcome than one who bailed immediately, and an immediate bail-out should not be systematically better or worse than declining the tactical battle entirely.

### 12.9 Mapping sub-units back to strategic units

After a tactical battle concludes, surviving sub-units are mapped back to their parent strategic units using proportional loss:

- If more than half of a strategic unit's sub-units survive, the strategic unit survives at full strength. (At the strategic level, units are binary — alive or dead. There are no partial-strength units.)
- If half or fewer survive, the strategic unit is destroyed.

This threshold (50%) is a starting value. Playtesting may reveal that a different threshold (e.g. any survivors = unit survives, or 75% required) produces better feel. The key constraint is that the mapping must be simple and deterministic — no ambiguity about whether a strategic unit lived or died.

### 12.10 LLM play at the tactical level

When the AI plays a tactical battle (either because the human is the AI's opponent in a human-initiated tactical battle, or in an AI-vs-AI scenario), the LLM receives a tactical briefing with the full res4 hex grid state, all sub-unit positions (universal visibility), terrain, and available actions. The briefing format follows the same principles as the strategic briefing (§ development plan) but at tactical scale.

The AI's tactical decision space is bounded by universal visibility (no scouting uncertainty), fixed multiplication ratios (no force composition decisions), and the same A&A dice mechanics. This keeps the tactical layer within the LLM's reasoning capacity. The primary AI challenge is spatial: choosing where to move sub-units and where to concentrate fire.

If playtesting shows the LLM struggles with tactical-level reasoning (too many sub-units, too many hexes, too many decisions per turn), the first response is to reduce multiplication ratios. The second response is to simplify the terrain movement matrix. The third response is to make the AI auto-resolve tactical battles and restrict tactical play to human-vs-engine only.

---

## 13. Display (animation)

### 13.1 Strategic resolution animation

During the resolution phase, the client animates in seven steps so that combat and death overlays stay on the correct units:

1. **Air strike indicators** — Highlight at hexes where air strikes occurred; air units shown at base airports, strike target hexes highlighted. Units drawn at **pre-move** positions.
2. **Air strike casualties** — Red X at hexes where air strike casualties occurred (both target casualties and counter-fire losses at base airports). Infrastructure destruction indicators at hexes where urban hexes, airports, or seaports were destroyed.
3. **Ranged lightning** — Yellow lightning at hexes where ranged combat occurred; units drawn at **pre-move** positions (including removed ranged casualties so they remain visible).
4. **Ranged casualties** — Red X at hexes where ranged units were removed; same pre-move positions.
5. **Movement** — Ground and naval units interpolate from source to destination hexes. Air units executing ferry orders appear at their new airport (or show destruction animation if ferry failed and origin was lost).
6. **Melee lightning** — Yellow lightning at hexes where melee combat occurred; units drawn at **post-move** positions (including removed melee casualties).
7. **Melee casualties** — Red X at hexes where melee units were removed; same post-move positions. Air units destroyed by base capture show destruction at their airport hex.

Air strike overlays appear first and complete before ranged overlays begin. Ranged overlays never "chase" moved units; melee overlays appear only after movement is complete.

### 13.2 Tactical battle animation

Tactical battle animation follows the same principles as strategic animation but at the res4 hex grid scale. Movement uses smooth interpolation between res4 hexes. Ranged fire shows directional indicators from attacker to target hex. Casualties use the same Red X overlay. Air sub-unit strikes are visually distinct from ground ranged fire.

The tactical battle UI displays the full res4 hex grid for the parent res1 hex with terrain coloring, sub-unit markers by type, and a "Return to Strategic" button that triggers bail-out resolution.