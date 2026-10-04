# Combat Execution and Resolution Rules

*Version 3.1 — August 2026 (aligned to engine 2.4.0)*

This document describes combat, movement, production, fog, sealift, and optional tactical battles. **Live engine symbols under `src/` are first authority.** Constants cited here are the values in those symbols as of 2.4.0.

Rules are divided into two layers: **strategic** (H3 res1, the primary game) and **tactical** (H3 res4, optional zoom-in battles). Both layers use **WEGO** simultaneous resolution. A tactical battle pauses the rest of the strategic map until it ends.

**Stated needs addressed:**
1. **Offensive and defensive strengths** — §3 and §2 (unit roster).
2. **Ranged attack** — §2 and §7 (strategic); §12.5 (tactical baselines, terrain caps, mountain LOS).
3. **Zero player interaction at strategic resolve** — no confirmations; casualty assignment is engine-defined. Tactical entry during resolution is the one exception: a melee-intercept dialog (Fight / Ignore).
4. **Infrastructure destruction** — §8.
5. **Optional tactical battles** — §12.

---

## 1. Design principles

- **Simultaneous resolution:** The engine resolves all combat and movement in a defined phase sequence. No mid-combat input, except the melee-intercept choice to enter a tactical battle or continue strategic melee.
- **Dice-based hits:** Each unit rolls one d6; a hit is scored when the result is **less than or equal to** that unit's attack or defense value (A&A style), plus 1 (Low) or 2 (High) when an optional origin bonus applies (§4.9).
- **Automatic casualty assignment:** Hits remove units by **lowest defense first**, then type order **infantry → armor → naval → air** (`CASUALTY_PRIORITY_ORDER`).
- **Resolution order (strategic):** embark → air strikes → ranged → ground/naval movement → cargo sync → ferry → melee. Production, control, and fog refresh run after melee.
- **Resolution order (tactical beat):** embark → air strikes → ranged → movement → ferry → cargo sync → melee. No production step.
- **Participant IDs:** At the start of combat resolution, each side with at least one unit in any combat is assigned a unique random integer ID from the game RNG. Melee ordering uses these IDs.
- **RNG:** A single game seed plus turn number produces deterministic replay for a given order set.
- **Infrastructure destruction is permanent.** Destroyed urban cells, airports, and seaports do not rebuild.
- **Tactical battles are optional.** Contested res1 hexes can be fought at res4, or resolved with strategic dice.

---

## 2. Unit roster (strategic level)

The game has four unit types. Per-side caps scale with match size (`getMaxUnitsPerType`). Small is the baseline; Medium is 2× Small; Large is 3× Small. Caps, costs, and starting armies do **not** otherwise change with size. See [game-size-unit-caps.md](game-size-unit-caps.md).

| Size | Infantry | Armor | Naval | Air |
|------|---------|-------|-------|-----|
| Small | 12 | 8 | 8 | 6 |
| Medium | 24 | 16 | 16 | 12 |
| Large | 36 | 24 | 24 | 18 |

| Unit type | Move | Attack | Defense | Strategic range | Domain | Cost | Build prerequisites |
|-----------|------|--------|---------|-----------------|--------|------|---------------------|
| **Infantry** | 1 | 1 | 2 | 0 (melee only) | Land | 20 | min 1 urban hex |
| **Armor** | 2 | 3 | 2 | 1 (adjacent hex) | Land | 40 | min 2 urban hexes |
| **Naval** | 2 | 2 | 2 | 2 hexes | Water/coastal | 100 | min 10 urban hexes and 1 seaport |
| **Air** | 0 (ferry only) | 3 | 1 | 3 (strike radius) | Air | 60 | min 5 urban hexes and an airport |

- **Range 0:** Unit only participates in same-hex (melee) combat.
- **Range 1:** Unit can attack an enemy in any **adjacent** hex (H3 grid distance 1; includes land–water boundary; see §6 for coastal bombardment).
- **Range 2:** Unit can attack enemies in hexes at distance 1 or 2. Range is H3 grid distance (same metric as movement).
- **Range 3 (air only):** Unit can strike any hex within 3 hexes of its base airport. Air units do not use incremental movement — they strike from their base and return in the same phase.
- **Move 0 (air):** Air units have no incremental movement. They reposition via ferry orders (up to 4 hexes between owned airports, one action per turn — see §4.4). Ferry range (4) is longer than strike range (3). A ferry into snow can be 2 hexes when the weather bonus is on (§4.9).
- **Cost:** Each res1 hex generates production points equal to its res4 urban hex count per turn (`buildProductionIncomeRule`). Points accumulate toward the queued unit; when accumulated points meet or exceed the cost, the unit spawns and excess carries over immediately. A hex produces as many units per turn as its rate and caps allow. Air also requires an airport at the hex; naval requires a seaport.

  Examples: a hex with 5 urban hexes produces one infantry (cost 20) every 4 turns. A hex with 10 urban hexes and a seaport queues a naval unit (cost 100): it spawns on turn 10 when accumulated production first reaches 100.

  Air strikes that destroy urban hexes (3 res4 hexes per hit) permanently reduce the production rate.

  Each new unit records where it was born: its res1 hex, and one res4 cell inside that hex when the hex has land. An intact urban cell is chosen when the hex has one; otherwise any land cell. Rubble is not intact urban. A hex with no land cell records no cell, uses that hex's own terrain, and has no country. The chosen cell also stores its terrain, whether it is intact urban, and its country from the naming data ([terrain pipeline](terrain-pipeline.md)). The origin drives the flag on unit names and the optional origin bonuses (§4.9). Hovering the flag lists the bonuses the unit was born with and does not repeat the birth place ([stack callout](ux/stack-callout.md)). Those lines stay the same after the unit moves. With the country and terrain bonuses off, the origin has no effect on dice and AI prompts do not mention an origin bonus.

- **Strategic movement** is a flat hex budget (`getMovementBudget`): infantry 1, armor 2, naval 2, air 0. Terrain does **not** modify strategic movement costs. With the weather bonus on, armor and naval can be shorter (§4.9). Naval movement is restricted to water and coastal hexes (`NAVAL_MOVEMENT_PROMPT_RULE`).

---

## 3. Offensive and defensive strengths and weaknesses

### 3.1 Infantry

- **Strengths:** Cheap, high defense (2). Holds hexes and absorbs hits.
- **Weaknesses:** Attack 1. No strategic ranged attack; must be in the same hex to fight. Cannot return fire against strategic air strikes (strategic range 0).
- **Role:** Defensive anchor, zone control, screening, airport/infrastructure defense.
- **Tactical:** Gains ranged baseline 2 (see §12.5).

### 3.2 Armor

- **Strengths:** Attack 3. Can attack **adjacent** hexes (ranged 1). Move 2.
- **Weaknesses:** Defense 2, same as infantry.
- **Role:** Offensive punch, ranged pressure on adjacent hexes, exploitation.

### 3.3 Naval

- **Strengths:** Move 2, ranged 2. Attack 2, defense 2. Can carry land units (see §9).
- **Weaknesses:** Restricted to water and coastal hexes. No melee in land hexes; contributes from water via ranged attack.
- **Role:** Naval control, coastal bombardment, transport.

### 3.4 Air

- **Strengths:** Attack 3, strike range 3 from base. Can target enemy units **or** infrastructure. The only unit capable of destroying infrastructure. Grants a 3-hex visibility radius around its base (see §6).
- **Weaknesses:** Defense 1. No incremental movement; ferry consumes the unit's entire turn. Cannot participate in melee. Destroyed if an enemy ground unit captures its base airport hex, or if the airport is destroyed.
- **Role:** Reconnaissance, deep strike, infrastructure destruction, air superiority via airport strikes.

### 3.5 Cross-domain and terrain (summary)

- **Land vs. land:** Infantry and armor fight on land; both can melee in the same hex; armor can also fire into an adjacent hex.
- **Naval vs. naval:** In water hexes, naval units can melee (same hex) or use range 2.
- **Naval vs. land:** Naval can use range 2 to hit land units within 2 hexes. Armor in a land hex may attack naval in an adjacent water hex; infantry may not on the strategic map. See §6 (Coastal bombardment).
- **Air vs. ground/naval:** Air units strike during the air strike phase (before ranged). When targeting units, defending ground/naval units with **strategic** range ≥ 1 in the target hex may return fire at their attack value — no range-to-base check. Infantry cannot return fire against air on the strategic map. In a tactical battle, defending sub-units with a tactical ranged baseline (including infantry) may counter-fire; see §12.5. When targeting infrastructure, only the infrastructure's fixed counter-fire roll applies.
- **Ground vs. air (base attack):** Air units do not participate in melee. If an enemy ground unit enters a hex containing an airport with a based air unit, the air unit is destroyed (see §6).
- **Strategic terrain combat modifiers:** None. Strategic ranged and air strikes are not blocked by terrain or intervening units.
- **Tactical terrain combat modifiers:** Implemented. See §12.4 and §12.5 (enter-hex costs, origin MP collapse, forest/urban/rubble range cap, road/rail enter costs, mountain LOS).

---

## 4. Combat resolution procedure (WEGO, no player input except melee intercept)

Resolution uses **current unit positions** at each step. Strategic `executeReadyStrategicTurn` runs this order:

### 4.0 Embark (pre-combat)

Apply pending embark orders so cargo is aboard before any shooting. Embarked land still occupies the carrier's hex.

### 4.1 Air strike phase (pre-move positions)

Using the **current** (pre-movement) positions:
- Build air strikes: for each air unit with a strike order, identify the target hex and target type (units, urban hex, airport, or seaport).
- Resolve all air strikes. Apply casualties to targets. Evaluate counter-fire against each striking air unit. Remove eliminated units and destroyed infrastructure. Process strikes in deterministic order (by striking air unit's base hex H3 index ascending).
- Air units destroyed during this phase do not execute their own strike if they haven't been processed yet.

**One action per turn:** An air unit may either strike or ferry in a given turn, never both. An air unit with both a strike and a ferry has the ferry dropped.

### 4.2 Ranged phase (pre-move positions)

Using the **current** positions, after air strike casualties:
- Build ranged attacks: for each unit with range ≥ 1 (armor, naval — **not** air). Each (attacker hex, defender hex) is a ranged attack.
- Resolve all ranged engagements. Apply casualties. No melee yet.

**DEFEND standing orders (strategic):** Each turn, a unit holding a DEFEND order automatically issues one ranged attack (armor/naval) or one air strike against enemy units (air only, `targetType: units`) at the closest enemy within weapon range, measured from the unit's **current** hex — including while still marching toward its defend post. Infantry has no strategic ranged attack and does not auto-fire. Explicit human pending orders override standing-generated attack rows for the same unit id.

**DEFEND standing orders (tactical):** The same per-beat auto-engagement applies during tactical battles. Each tactical beat, sub-units whose strategic parent carries a DEFEND order fire ranged (non-air) or air strikes (air, `targetType: units`) at the closest legal enemy res4 cell. Explicit/LLM orders for the same sub-unit override standing-generated rows.

**Tempo sweep:** After player and model orders are merged, `collectTempoRuleAttacks` (strategic) / `collectTacticalTempoAttacks` (tactical) adds one legal attack for each unit that can fire and was not already ordered. Units with a `hold_fire` standing order are skipped. Model or human orders beat standing orders, which beat the sweep. The sweep is engine behavior, not a player-facing order.

### 4.3 Apply ground and naval movement

Move every ground and naval unit that has a movement order to its destination. Positions are now final for ground and naval units. Friendly stacking is legal. An **enemy**-occupied cell is legal contact (move/melee).

### 4.4 Cargo sync (strategic; after movement, before ferry)

Embarked land units that did not receive an independent move are moved to stay with their naval carrier. Strategic order: cargo sync **before** ferry. Tactical beats run ferry **before** cargo sync.

### 4.5 Ferry movement (post ground/naval movement)

For each air unit with a ferry order:
1. Check the destination airport: is it still owned by the air unit's player, and is the airport still intact?
2. **If yes:** The air unit relocates to the destination airport.
3. **If no:** Ferry aborts. If the origin airport is still owned and intact, the air unit stays. If the origin is also lost, the air unit is destroyed.

Ferry range: maximum 4 hexes (H3 grid distance) between origin and destination airports. With the weather bonus on, a destination in snow is 2 hexes when the unit lacks the snow tag (§4.9). Tactical ferry is unchanged. Both airports must be in hexes owned by the air unit's player at order time; destination validation occurs at resolution time.

### 4.6 Melee phase (post-move positions)

Using the **post-movement** positions:
- Build melee combats: each hex that has ground/naval units from two or more sides is one melee engagement. Air units do **not** participate in melee.
- If a contested hex is eligible, the engine may **pause** here for a melee-intercept dialog (Fight tactical battle / Ignore and resolve strategically). See §12.1.
- Resolve remaining same-hex combats in a deterministic order.

### 4.7 Resolution ordering and determinism

This order ensures: cargo is aboard before shooting; air strikes resolve first; ranged attacks resolve when targets are still where the player aimed; movement is applied only after ranged resolution; ferry validation uses post-movement ground truth. Casualties are applied immediately after each engagement.

Within each phase, process engagements in a **deterministic order** (attacker/defender hex H3 index ascending). With a single game seed, replay is deterministic.

### 4.8 One round per phase

- Air strike phase: each striking air unit rolls once. Counter-fire depends on target type (see §8).
- Ranged phase: each eligible attacker rolls once per eligible target hex. **Return fire:** a defending unit returns fire only when it could legally plan the reverse shot at that attacker hex (planning parity). Each eligible defender rolls once (**attack** value).
- Melee phase: one round of rolls, then apply hits. In a two-side melee, the side with the lower participant ID rolls **attack** values and the other side rolls **defense** values. Participant IDs are random, so which side rolls which is random each resolution and does not depend on who moved in; `estimate_combat` averages both cases ([ai-tools.md](ai-tools.md)).

No "continue or retreat." If both sides remain in the same hex after melee, they fight again in the **next** turn's resolution.

### 4.9 Hit and casualty rules

- **Roll:** One die per unit (d6, result 1–6).
- **Hit:** For **attack** (including return fire), hit if `roll ≤ attack value`. For **defense** (melee only), hit if `roll ≤ defense value`.
- **Return fire (ranged phase):** A defending unit returns fire only if at least one attacker hex is a legal reverse shot under planning rules. **Strategic ground** (infantry/armor/naval): strategic ranged range + H3 grid distance. Infantry strategic range is 0, so infantry never returns fire on the strategic map. **Tactical ground:** tactical ranged baselines with terrain caps and mountain LOS (same as direct-fire validation), including infantry. **Air** in the ranged phase: strike-planning rules — intact airport at base, and on the strategic map within air strike range of the attacker hex; in a tactical battle, airport only (engagement hexes are already in footprint). Air-strike phase counter-fire (§8) is separate and still has **no** range-to-base check.
- **Casualty assignment:** When a side receives N hits, remove N of its units using **lowest defense first**. Ties: **infantry → armor → naval → air**.

#### Origin bonuses (optional)

Two new-game dropdowns, **Country bonus** and **Terrain bonus**, each offer Off, Low, and High, and default to Low. A match saved before levels existed plays at Low. Each dropdown is set independently. When a unit qualifies where it stands at the moment of a roll, it adds that bonus's amount to its attack or defense value for that roll (hit if `roll ≤ value + amount`). The number of dice never changes.

| Level | Added to a qualifying roll |
|---|---|
| Low | +1 |
| High | +2 |

The highest printed attack is 3, so the highest hit threshold is 5 and a roll of 6 always misses. The highest defense threshold is 4.

- **Country bonus (strategic and tactical):** the unit's birth country equals the country of the place where it rolls. Countries match by canonical name, not by code. On the strategic map, a hex's country is its **majority country**: the country with the most res4 cells inside the hex, with ties going to the name that sorts first. A hex with no counted cells has no country. In a battle, a cell's country is that cell's own country, the same value used for unit births.
- **Terrain bonus (tactical only):** the unit's birth terrain kind equals the cell's effective terrain kind. Urban and rubble are flags, not kinds, and never affect the match. The strategic map ignores this flag.
- **No stacking:** a unit that qualifies on both counts adds only the larger of the two amounts. For example, country High and terrain Low add 2.
- **Who qualifies:** a unit without a recorded origin, or with a missing birth country or terrain, never qualifies for that test. Tactical sub-units use their parent unit's origin.
- **Where a unit stands:** air strikes and ranged fire use pre-move positions; melee uses the melee hex or cell. An air unit is judged at its base, whatever it strikes. Cargo shares its carrier's position.
- **Rolls that change:** ranged fire and return fire (including standing-order defend fire), both melee rolls, air strikes on units and on infrastructure, air-strike counter-fire by defending units, and tactical ranged fire at infrastructure.
- **The origin bonus does not change:** infrastructure's fixed counter-fire, every casualty sort and air-strike victim pick (they keep the printed defense values), movement, ranges, enter costs, ferry range, sub-unit counts, and production. Weather, below, is a separate option.

`estimate_combat` uses the same effective values. `assess_unit`, `assess_hex`, the briefing Unit Status table, and the AI combat rules paragraph report the bonus only while a flag that applies in that mode is on ([ai-tools.md](ai-tools.md)).

#### Weather bonus (optional)

**Weather bonus** is a new-game dropdown offering Off, Low, and High, defaulting to Low, with a starting month under the options. The dialog opens on a random month, and the player can pick another month or draw again. Each strategic turn is one month. Every beat of a battle stays in that month and uses the weather of the enclosing hex.

Weather is Mild, Rain, Snow, or Heat, from a fixed monthly climate, not a roll. A month is snow when its mean temperature is at or below 0°C; otherwise rain when precipitation is at least 120 mm; otherwise heat when the mean is at least 23°C; otherwise mild. A hot wet month displays as rain and still counts as heat. Land hexes are sampled at the centroid. A water hex copies the nearest land hex within two res1 steps, and is mild all year when no land is that close ([terrain pipeline](terrain-pipeline.md)).

A unit is tagged for rain, snow, or heat when its birth hex has that condition in at least 3 of 12 months. Mild is never a tag. At most two tags. When three qualify, the two with more months are kept; equal counts keep snow, then heat, then rain. Tags are shown in the order snow, rain, heat. No birth hex means no tags. Sub-units inherit the parent.

Penalties apply only to units that lack the tag. They never raise a printed stat. A match with no saved weather setting plays with the bonus off. A match saved before levels existed plays at Low. An unreadable start month is January. Turn 1 of a January match is January.

| Rule | Low | High |
|---|---|---|
| Weather that slows untagged armor | snow, rain | snow, rain, heat |
| Weather that slows untagged naval | snow | snow, rain |
| Strategic movement when slowed | 1 hex | 1 hex |
| Tactical point budget cap when slowed | 2 | 1 |
| Armor ranged attack in snow or heat | -1 | -2 |
| Air strike when base or target is snow, rain, or heat the unit lacks | -1 | -2 |
| Infantry open-ground enter cost in snow or rain | 2 | 2 |
| Strategic ferry into snow | 2 hexes | 2 hexes |

- **Strategic movement** is always infantry 1, armor 2, naval 2, air 0, with the weather bonus off. At Low or High, armor and naval in weather that slows them move 1 hex. The weather is the hex the unit occupies now, so it can still enter a worse hex at full speed and is slowed on the next turn. Route and distance estimates use that same budget for the whole path.
- **Tactical movement:** in weather that slows it, armor's or naval's budget becomes the level's cap (2 at Low, 1 at High), then the lower of that and the existing forest or urban budget. A slowed unit's budget is never below 1, and a march always makes at least one cell of progress. Infantry's budget stays 2. Snow or rain raises the cost of entering open ground (plains, desert, wetlands, arctic, coastal) to 2. Roads, rubble, and urban costs do not change.
- **Attack:** armor ranged attack, including return fire and air-strike counter-fire, is lower in snow or heat by the level's penalty (1 at Low, 2 at High). An air strike is lower by the same amount once when the base or the target is snow, rain, or heat the unit lacks. The printed attack is at least 1 after the penalty and before the origin bonus, so a roll of 1 always hits. High origin and High weather can cancel: home armor firing in snow ends at `max(1, 3 - 2) + 2 = 3`. Rain does not cut armor attack. Infantry attack is unchanged.
- **Unchanged:** defense, melee dice, casualty order, and tactical ferry. A strategic ferry into snow is 2 hexes instead of 4 when the unit lacks the snow tag, at either level.

`estimate_combat` uses the same attack thresholds. With the weather bonus off, prompts stay as they were. With it on, the turn line names the month and the combat paragraph states the penalties for the chosen level.

### 4.10 Elimination

When a unit is chosen as a casualty (one hit = one unit removed), it is removed from the map. No capture, no retreat step. If a naval unit carrying cargo is destroyed, embarked units are destroyed with it (see §9.4).

---

## 5. Detailed resolution flow (single resolution phase)

High-level flow: **embark → air strikes → ranged at pre-move positions → ground/naval movement → cargo sync → ferry → melee at post-move positions** (strategic). Tactical beats swap cargo sync to after ferry and omit production.

```
1. Set phase to resolution.
2. Get current unit positions (before any movement). Assign participant IDs.
3. Apply embark orders.
4. Air strike phase (pre-move positions):
   Build air strikes from declared orders. Process in deterministic order
   (striking unit's base hex H3 index ascending).
   For each air strike:
   a. If striking air unit was destroyed by an earlier strike this phase,
      skip.
   b. Determine target type (units, urban hex, airport, seaport).
   c. For unit targets: air unit rolls attack (hit on roll ≤ 3). If hit,
      assign casualty to target hex using casualty priority. Defending
      units with range ≥ 1 in the target hex return fire (roll ≤ attack
      value); no range-to-base check. Any hit destroys the air unit.
   d. For infrastructure targets: see §8.3.
   e. Apply all casualties and infrastructure destruction immediately.
5. Ranged phase (pre-move positions, post-air-strike casualties):
   Build ranged attacks from declared orders, standing-order DEFEND rows,
   and the tempo sweep. Group by defender hex; process in deterministic order.
   For each ranged engagement (one defender hex D, set of attacker hexes):
   - All units in attacker hexes that have D in range each roll once.
   - Return fire: defending units in D that pass planning-parity reverse
     reach each roll once (attack value).
   - Assign attacker hits to D; assign defender return-fire hits to attacker
     hexes (most units remaining, then lowest H3 index).
6. Apply ground and naval movement orders.
7. Cargo sync (strategic): embarked land follows the carrier unless it
   received an independent move. Tactical: this step runs after ferry.
8. Apply ferry movement orders (destination airport owned and intact;
   else abort to origin or destroy if origin is also lost).
9. Melee phase (post-move positions):
   Optionally pause for melee intercept on contested hexes.
   Build melee combats: hexes that have ground/naval units from two or more
   sides. Air units do not participate. Process hexes in H3 index order.
   For each melee hex: order sides by participant ID; resolve one round
   (attacker rolls attack, defender rolls defense); assign hits by casualty
   priority.
10. Post-melee air unit check: if an airport hex is no longer owned by the
    air unit's player, the based air unit is destroyed.
11. Production, control, fog refresh, game-over check, clear pending orders,
    advance turn, set phase back to planning (strategic only).
```

No player input during steps 2–11 except the melee-intercept dialog at step 9.

---

## 6. Edge cases and clarifications

- **Stacking:** If multiple friendly units are in one hex, they all defend together in melee. When they attack (ranged or melee), each unit rolls. No stacking limit is assumed unless specified elsewhere. Friendly stacking is legal on both the strategic and tactical maps. Enemy-occupied cells are legal move/melee contact destinations.
- **Ranged vs. same hex:** A unit with range 1 or 2 can still participate in melee if it is in the same hex as the enemy. Armor in a hex with enemy infantry both (a) can be resolved in ranged phase as attacker against **other** hexes, and (b) participates in melee in its own hex. Each unit rolls at most once per phase for its declared action.
- **Coastal bombardment:** Naval at range 2 can target land units in hexes within 2. Armor in a land hex may attack naval units in an adjacent water hex (range 1). Infantry (range 0) cannot attack naval on the strategic map.
- **Multiple attackers on one hex:** When several hexes attack the same defender hex, resolve as one combined engagement. Assign defender return-fire hits to attacker hexes one at a time: most units remaining (ties: lowest H3 index); within that hex apply casualty priority.
- **Arbitrary number of players:** Participant IDs are assigned once per side; melee with three or more sides uses round-robin sub-engagements. The live match is two sides (`human` / `opponent`).
- **Line of sight / blocking (strategic):** Ranged and air strikes are not blocked by terrain or intervening units. Any enemy-occupied hex within the attacker's range is a valid target.
- **Line of sight (tactical):** Mountain along the implicit grid path blocks armor and naval shots. Infantry is exempt. Air strikes and ferry are not blocked by mountains. See §12.5.
- **Reproducibility:** A single RNG seed for the entire game so that replay is deterministic.
- **Air unit base capture:** If an enemy ground unit enters a hex containing an airport with a based air unit, the air unit is destroyed during the post-melee check. The air unit does not fight in melee.
- **Air unit destroyed during air strike phase:** If air unit A strikes air unit B's airport and destroys it, and air unit B has not yet resolved its own strike (higher H3 index), air unit B is destroyed before it can act.
- **Multiple air units at same airport:** Multiple air units may be based at the same airport. If the airport is destroyed, all co-located air units are destroyed.
- **Ferry to occupied airport:** An air unit may ferry to an airport that already has air units. No stacking limit for air units at airports.
- **Self-strikes (scorched earth):** A player may order an air unit to strike their own infrastructure. Self-striking an airport with your own air units based there destroys those air units. Counter-fire rules apply normally.
- **Multiple strikes on same hex:** Multiple air units may strike the same target hex in the same turn. Each strike resolves independently. Two urban strikes destroy up to 6 res4 urban hexes (3 per hit, capped at remaining). Two strikes on the same airport: the first destroys it; the second finds no airport and misses.
- **Air unit survival and territorial control:** The post-melee air check uses **hex ownership**, not enemy unit presence. If an enemy ground unit enters an airport hex during movement, territorial control changes immediately — even if that enemy unit is subsequently destroyed in melee. Recapturing an airport hex requires a separate ground action on a subsequent turn.
- **No interception in transit:** Air units executing a ferry order cannot be attacked during transit. The ferry is an instantaneous relocation.
- **Visibility (fog on):** Vision is a per-type H3 disk (`VISION_RANGE_BY_UNIT_TYPE`): infantry **1**, armor **2**, naval **2**, air **3** (air measured from the base airport). Unexplored hexes are never seen. Explored-but-not-visible hexes show last-known terrain without current enemy units. Last-known enemy positions persist for `STALE_INTEL_TURNS` (2) turns, then drop. Own home-region hexes and the shared home-region intersection are force-visible in the `region_vs_region` scenario. Fog can be turned off for a match; then every cell is visible.
- **hold_fire:** A standing order that suppresses both DEFEND auto-engagement and the tempo sweep for that unit until replaced. Omitting an attack is not the same as `hold_fire`.

---

## 7. Attack capabilities summary (strategic)

| Unit    | Range (hexes) | Can strike |
|---------|---------------|------------|
| Infantry| 0             | Same hex only (melee). |
| Armor   | 1             | Same hex (melee) or **any adjacent hex** (land or water). |
| Naval   | 2             | Same hex (melee) or **any hex at distance 1 or 2** (land or water). |
| Air     | 3             | **Any hex within 3 hexes of base airport** (air strike phase only). Can target units or infrastructure. Cannot participate in melee. |

Tactical ranged baselines are larger; see §12.5.

---

## 8. Air operations and infrastructure destruction

### 8.1 Air strike vs. enemy units

An air unit with a strike order targeting an enemy-occupied hex resolves as follows:

1. The air unit rolls d6. Hit if roll ≤ 3 (attack value).
2. If hit, assign one casualty to the target hex using the standard casualty priority.
3. **Counter-fire:** Every defending unit in the target hex with **strategic** range ≥ 1 rolls d6; hit if roll ≤ that unit's attack value. If any counter-fire roll hits, the air unit is destroyed. There is no range-to-base check.
   - Armor (range 1, attack 3): returns fire, hitting on 1–3.
   - Naval (range 2, attack 2): returns fire, hitting on 1–2.
   - Infantry (range 0): cannot return fire against air on the strategic map.
   - Air units at the target hex: cannot return fire (air units only act during their own strike order).

These §8.1 counter-fire rules use **strategic** range. In a tactical battle, defending sub-units with a tactical ranged baseline (including infantry) may counter-fire; see §12.5.

**Target selection:** Players order air strikes against "units" as a generic target type. Casualty priority assigns the hit automatically.

### 8.2 Air visibility

Each air unit grants its owning player visibility of all hexes within 3 hexes of its base airport. This visibility includes terrain, occupying units, build queues, and infrastructure status. It is continuous and does not require the air unit to take an action.

Air is **not** the only source of extended visibility. Ground and naval units see a disk of radius 1 (infantry) or 2 (armor, naval) around their hex. Air's 3-hex disk is still the largest.

### 8.3 Air strike vs. infrastructure

An air unit may target infrastructure at a hex within its 3-hex strike radius instead of targeting enemy units. The target hex may be enemy-controlled, neutral, or owned by the striking player. Three infrastructure target types exist. **Infrastructure counter-fire is the same whether or not the hex is occupied.** Units in the hex do not participate in counter-fire against infrastructure strikes.

**Target: Urban hex.** The air unit rolls d6, hit if roll ≤ 3. On hit, **3 res4 urban hexes** at the target res1 hex are permanently destroyed (or all remaining if fewer than 3 remain). Counter-fire: roll d6; the air unit is destroyed if roll ≤ 1 (17% risk).

**Target: Airport.** The air unit rolls d6, hit if roll ≤ 3. On hit, the airport is permanently destroyed. Any air units based at the destroyed airport are also destroyed immediately. Counter-fire: roll d6; the air unit is destroyed if roll ≤ 2 (33% risk).

**Target: Seaport.** The air unit rolls d6, hit if roll ≤ 3. On hit, the seaport is permanently destroyed. No new naval units can be produced at this hex. Naval units already at sea are unaffected. Counter-fire: roll d6; the air unit is destroyed if roll ≤ 1 (17% risk).

In a **tactical** battle, air may also strike strikeable infrastructure inside the footprint (urban, airport, seaport, or an active road/rail corridor that is not rubble), without the strategic 3-hex radius.

### 8.4 Infrastructure destruction is permanent

Destroyed urban hexes, airports, and seaports do not rebuild. This applies globally.

### 8.5 Counter-fire summary

| Target type | Air attack value | Counter-fire source | Counter-fire threshold |
|-------------|-----------------|---------------------|----------------------|
| Enemy units | 3 (50%) | Each defending unit with range ≥ 1 in target hex rolls independently | Defender's attack value (no range-to-base check) |
| Urban hex | 3 (50%), destroys 3 res4 hexes | Ground defenses (fixed roll, unaffected by hex occupation) | ≤ 1 (17%) |
| Airport | 3 (50%) | AA defenses (fixed roll, unaffected by hex occupation) | ≤ 2 (33%) |
| Seaport | 3 (50%) | Seaport defenses (fixed roll, unaffected by hex occupation) | ≤ 1 (17%) |

The values in §8 are the printed values. With an origin bonus on (§4.9), a qualifying air unit's strike roll and a qualifying defender's counter-fire roll each add the bonus amount (1 at Low, 2 at High). Infrastructure counter-fire never changes.

---

## 9. Sealift and naval transport

Naval units can transport land units across water. Transport uses an explicit cargo assignment model.

### 9.1 Cargo assignment

Each land unit has an `embarkedOn` field (strategic: `embarkedOnNavalUnitId`; tactical: `embarkedOnSubUnitId`). Assignment requires the land unit and the naval unit to be in the same hex, and that hex must be a legal embark hex (`canEmbarkAtHex`): coastal or land seaport unconditionally; naval-transit terrain with a seaport **only when that hex is controlled** by the embarking player. Armor units are assigned before infantry (priority order). Players can reassign cargo via the stack popup UI; the LLM assigns cargo via the order format.

### 9.2 Embark and disembark

Embark requires a legal embark hex as above. Manual debark is permitted at any coastal hex and at controlled water seaports (via stack popup or sealift slot `(none)`). Embarked land units cannot receive independent human or tactical movement orders until manually debarked. The LLM opponent auto-debarks when issuing independent movement orders (`explicit_move`, `disembark`, or standing-order expansion at Ready); humans must debark manually first.

### 9.3 Embarked unit combat

Embarked units can participate in melee on coastal hexes but cannot use ranged attacks while embarked. On water hexes, embarked units cannot participate in combat at all — they are cargo.

### 9.4 Transport loss

If a naval unit carrying cargo is destroyed, all embarked units are destroyed with it (fatal transport loss), regardless of terrain. Manually debarked co-located land units survive because they no longer have an `embarkedOn` assignment.

---

## 10. Optional extensions (later)

- **Multi-round melee:** Multiple rounds of melee in the same hex until one side is eliminated or a cap is reached.
- **Strategic terrain modifiers:** Not implemented. Tactical terrain modifiers are live (§12).
- **Unit hit points:** Instead of one hit = one unit lost.
- **Infrastructure rebuilding:** If permanent destruction proves too punishing.
- **Additional unit types.**
- **Player-facing save/load and turn replay** (milestone 2.5).
- **AI-initiated tactical bail-out** as a distinct order (not implemented; only the human can voluntarily exit).

---

## 11. Summary (strategic level)

- **A&A-style:** One die per unit, hit when roll ≤ attack (when attacking) or ≤ defense (when defending in melee).
- **Origin bonuses (optional):** +1 (Low) or +2 (High) to that value for a unit rolling in its birth country; in battles, also on its birth terrain kind. The two never stack; the larger amount applies.
- **Caps:** Small 12/8/8/6 infantry/armor/naval/air, scaled by game size. Costs 20 / 40 / 100 / 60.
- **Air strikes:** Air units strike first (range 3 from base airport), targeting units or infrastructure. One action per turn: strike or ferry (range 4).
- **Infrastructure destruction:** Urban hexes, airports, and seaports can be permanently destroyed by air strikes. No rebuilding.
- **Ranged:** Naval 2 hexes, armor 1 hex; infantry melee only on the strategic map. Return fire uses planning-parity reverse reach.
- **Fog:** Infantry vision 1, armor 2, naval 2, air 3. Stale intel lasts 2 turns.
- **Sealift:** Explicit cargo assignment. Fatal transport loss when the carrier is destroyed. LLM opponent movement orders auto-debark.
- **WEGO:** embark → air strike → ranged → movement → cargo sync → ferry → melee; automatic casualty assignment; tempo sweep fires unordered legal shots unless `hold_fire`.

---

## 12. Tactical game (optional battles at res4)

The tactical game is a separate combat layer on the res4 hex grid within one res1 hex. While a tactical battle is in progress, the rest of the strategic map does not resolve. Tactical beats use the same WEGO model as the strategic game.

### 12.1 Triggering a tactical battle

Two entry paths:

1. **Planning-time magnifier.** During strategic planning, contested **explored** res1 hexes show a tactical-entry control on the map. Clicking it starts a battle for that hex (`startTacticalBattleForEnclosingRes1Hex`). The strategic turn stays in planning until the battle ends.
2. **Melee intercept.** During strategic resolution, if melee is about to resolve in a contested hex, the engine can pause and offer **Fight** (enter tactical) or **Ignore** (continue strategic melee). The enclosing turn remains in `resolution` until the intercept is answered and, if fought, until the battle ends.

The AI opponent does not choose whether to enter. If the human declines, standard strategic resolution applies.

Both sides must be able to place at least one sub-unit or the battle does not start.

### 12.2 Unit multiplication

Strategic units entering the tactical battle are decomposed into sub-units on the res4 grid (`tacticalSubUnitCountForStrategicUnitType`):

| Strategic Unit | Sub-Units | Movement budget (flat terrain) | Ranged baseline (res4 steps) |
|---------------|-----------|----------------------------------|------------------------------|
| Infantry | 8 | 2 | 2 |
| Armor | 4 | 4 | 5 |
| Air | 3 | 0 (does not march) | entire footprint (cap 99) |
| Naval | 4 | 3 | 10 |

Sub-units inherit their parent's unit type for combat resolution. Each sub-unit fights as one unit in the A&A-style dice system (same attack/defense values as the strategic parent). Standing orders do **not** move sub-units during a beat; they can still generate DEFEND fire.

### 12.3 Entry-side injection

Sub-units are placed on the res4 hex grid at the edge corresponding to the direction from which the parent strategic unit entered the res1 hex (`getPreviousStrategicH3IndexForUnit`). If a unit was already in the hex, placement uses a default edge. Road/rail corridors can allow infantry/armor to spawn on otherwise blocked cells. Urban and rubble cells are occupiable. Armor is blocked by mountains, wetlands, arctic, and water unless a transport override applies.

### 12.4 Movement

Tactical movement uses a per-beat **movement-point budget** consumed as sub-units enter res4 hexes. Air sub-units do not march.

**Terrain enter-hex costs** (`tacticalEnterHexMovementCost`):

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

**Origin budget modifiers** (`effectiveTacticalMovementPointBudgetForMarchLeg`):

- Infantry or armor whose **current** cell is urban or rubble: budget **1** this beat, not the type baseline.
- Armor whose current cell is forest: budget equals the **infantry** baseline (2).
- A non-air unit always retains at least 1 point.
- With the weather bonus on, the enclosing hex's weather applies after those terrain budgets (§4.9). In weather that slows it, armor's or naval's budget becomes the level's cap (2 at Low, 1 at High), then the lower of that and the urban, rubble, or forest budget, and never below 1. At Low, armor is slowed in snow or rain and naval in snow; at High, armor also in heat and naval also in rain. Infantry's budget stays 2. Snow or rain raises infantry's cost to enter open ground (plains, desert, wetlands, arctic, coastal) to 2. Roads, rubble, and urban costs do not change. The table above stays the printed costs.
- Entering an intact road cell costs half a point and an intact rail cell costs one third, for every terrain, for infantry and armor. The destination cell sets the rate (`1 / TACTICAL_TRANSPORT_ROAD_BUDGET_MULTIPLIER` and `1 / TACTICAL_TRANSPORT_RAIL_BUDGET_MULTIPLIER`). A unit may enter that cell from a neighbor that is not on the line, and may leave only onto terrain it can enter off the line or onto another intact line cell.
- Urban enter override: infantry/armor enter urban at 1 MP when the cell has no road or rail. Rubble with no road or rail still costs 2 MP. Rubble on a road or rail costs 1 MP where the unit could already enter, and does not open water for infantry or mountains, wetlands, arctic, or water for armor. Naval treats rubble as blocking land.

A destination beyond this beat's budget is **clamped** to the first reachable leg rather than rejected. When the planner cannot use the destination at all but a neighbouring footprint cell still closes on it, the engine may take that single step. Friendly stacking on that cell is legal.

### 12.5 Ranged combat

At the tactical level, all unit types have a positive ranged baseline (`RANGED_RANGE_BY_UNIT_TYPE`):

- **Infantry:** 2 res4 hexes.
- **Armor:** 5 res4 hexes.
- **Naval:** 10 res4 hexes.
- **Air:** Strike anywhere in the battle footprint (the strategic 3-hex radius does not apply). One air action per unit per beat.

**Terrain caps and LOS** (`tacticalTerrainCombatModifiers.ts`):

- Forest, urban, or rubble on the **attacker's** cell caps **infantry and armor** to effective range **1**.
- Mountain along the implicit H3 grid path blocks **armor and naval** shots. **Infantry is exempt.** Air strikes and ferry are not blocked by mountains. If no path can be derived, the shot is blocked (fail closed), except icosahedron face-crossing pairs which use a BFS fallback.
- Return fire uses the same range + LOS rules (planning parity).
- **Air-strike AA:** tactical infantry may counter-fire when an air strike targets their hex, because infantry has a positive tactical ranged baseline.
- Legal targets include enemy-occupied cells **and** strikeable infrastructure (urban, airport, seaport, or active non-rubble road/rail).

Ranged attacks use the same A&A-style dice as strategic combat. Casualty assignment follows the standard fixed priority. With the origin bonuses on, a unit on a cell matching its birth country or birth terrain kind adds 1 (Low) or 2 (High) to its rolls there (§4.9, "Origin bonuses").

**Tactical ranged target selection:** When standing-order or draft ranged rows are expanded from strategic parent units to tactical sub-units, targets must resolve to **enemy-occupied (or strikeable-infra) res4 cells** that pass tactical range and mountain LOS — not the res1-centroid footprint anchor. Sanitization re-targets invalid opponent draft rows to the closest legal enemy cell before dropping them. Naval may bombard adjacent land sub-units when range and LOS allow.

### 12.6 Tactical turn structure

The tactical game uses **WEGO** simultaneous resolution — the same model as the strategic game. Each beat:

1. **Planning:** Both sides issue movement, ranged, air strike, ferry, and sealift orders. The LLM is consulted at most once per beat under event-driven policy. `tacticalTurnNumber` increments each beat.
2. **Embark.**
3. **Air strike phase.**
4. **Ranged phase.**
5. **Movement phase** (first-leg truncation as in §12.4).
6. **Ferry** (tactical air ferry is footprint-bounded and only between intact airport cells; not the strategic 4-hex airport hop). If the destination is illegal and the origin airport is gone, the air unit is destroyed; if the origin is still intact, it stays.
7. **Cargo sync.**
8. **Melee phase.**
9. Casualties removed. Next beat, or battle end.

There is no production step in a beat.

### 12.7 Visibility

**Visibility in tactical battles is universal.** All sub-units on both sides are visible at all times regardless of terrain. There is no fog of war at the tactical level. The match's strategic fog setting does not change this.

### 12.8 Ending the tactical battle

A tactical battle ends in one of these ways:

1. **Annihilation:** One side has zero remaining sub-units. The UI shows an annihilation result. Remaining strategic parents on the winning side are not run through the less-than-half pass (the bail-out eliminator skips when one side is already gone).
2. **Human voluntary exit:** The player clicks the tactical HUD exit control. Remaining sub-units on **both** sides are mapped back using the **strict less-than-half** rule in §12.9. There is **no** extra dice-with-modifiers fight on exit. The LLM has no separate bail-out action.
3. **Failed start:** If placement cannot put at least one sub-unit on each side, the battle never begins.

### 12.9 Mapping sub-units back to strategic units

After a **human voluntary exit**, each strategic parent is destroyed when `survivors * 2 < baseline`, where baseline is the count placed at battle start (or the theoretical multiplication count on legacy snapshots). **Exact half survives.** Fewer than half is destroyed.

Strategic units remain binary — alive or dead. There are no partial-strength units.

On annihilation, the empty side's parents are already gone with their last sub-units; the surviving side's parents remain.

### 12.10 LLM play at the tactical level

When the AI plays a tactical battle, the LLM receives a tactical briefing: full visibility, res4 operational map, unit status, Best Options for this beat, and the same WEGO order envelope minus strategic-only tails (no `assign_order`, production, or memory writes). Standing orders do not move sub-units. See [ai-commander-prompts/tactical-prompt.md](ai-commander-prompts/tactical-prompt.md).

---

## 13. Display (animation)

### 13.1 Strategic resolution animation

During the resolution phase, the client animates so that combat and death overlays stay on the correct units:

1. **Air strike indicators** — Highlight at hexes where air strikes occurred; units drawn at **pre-move** positions.
2. **Air strike casualties** — Red X at casualty hexes; infrastructure destruction indicators.
3. **Ranged lightning** — Yellow lightning at ranged combat hexes; units at **pre-move** positions. Shot lines may be drawn from attacker to target.
4. **Ranged casualties** — Red X at ranged removal hexes.
5. **Movement** — Ground and naval units interpolate from source to destination. Air ferries appear at the new airport (or show destruction if ferry failed and origin was lost). Embarked follow-moves travel with the carrier.
6. **Melee lightning** — Yellow lightning at melee hexes; units at **post-move** positions.
7. **Melee casualties** — Red X at melee removal hexes. Air units destroyed by base capture show destruction at their airport hex.

Air strike overlays complete before ranged overlays begin. Ranged overlays never "chase" moved units; melee overlays appear only after movement is complete.

### 13.2 Tactical battle animation

Tactical battle animation follows the same principles at the res4 hex grid scale. Movement uses interpolation between res4 hexes. Ranged fire shows directional indicators. Casualties use the same red X overlay.

The tactical battle UI displays the res4 hex grid for the parent res1 hex with terrain coloring, road/rail overlays, sub-unit markers by type, and an exit control that triggers voluntary-exit mapping (§12.8).

---

## 14. Win conditions (live scenario)

The shipped scenario id is `region_vs_region`. Details: [region-vs-region.md](region-vs-region.md). After combat, production, and control updates, `evaluateRegionControlWinnerAtEndOfTurn` may name a winner:

1. **Control:** You control every res1 hex in the enemy home region, and the enemy does not symmetrically control yours.
2. **Urban elimination:** The enemy home region's urban count sums to zero, and your home region still has at least one urban hex. Mutual zero (scorched earth both homes) is not an urban-only win.

If one side has no remaining strategic units, the match also ends (force elimination in finalize). Both home-region outlines stay visible on the map regardless of fog.
