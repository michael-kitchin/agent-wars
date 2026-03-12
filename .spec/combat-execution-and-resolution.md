# Combat Execution and Resolution Rules

*Version 1.0 — March 2026*

This document describes proposed combat execution and resolution rules for the game, using **Axis & Allies 2**-style combat as a template. Rules are designed for **WEGO** turn resolution: all combat is resolved by the engine in a single resolution phase with **no player-to-player interaction or confirmations**. No retreat declarations, no casualty choices by players — the engine applies deterministic procedures and (where specified) dice rolls.

**Stated needs addressed:**
1. **Offensive and defensive strengths and weaknesses** — §3 and §2 (unit roster) define attack/defense values, range, and roles; §3.4 summarizes cross-domain and terrain.
2. **Ranged attack capabilities** — §2 (range 0/1/2), §7 (summary table): naval 2 hexes, armor adjacent (1 hex), infantry melee only.
3. **Zero player interaction / WEGO streamlining** — No confirmations or back-and-forth: resolution order (ranged then melee), casualty assignment (fixed priority), and attacker/defender ordering (participant IDs assigned at combat start) are all engine-defined. Single resolution phase after movement.

---

## 1. Design principles

- **Simultaneous resolution:** After all movement orders are applied, the engine detects combats and resolves them in a defined order. No mid-combat input from any player.
- **Dice-based hits:** Each unit rolls one die; a hit is scored when the result is **less than or equal to** that unit’s attack or defense value (A&A style).
- **Automatic casualty assignment:** When hits are scored, the engine assigns casualties using a fixed priority (e.g. lowest defense first). No player chooses which unit is lost.
- **Ranged and melee:** Some units can attack at range (naval: 2 hexes; armor: 1 hex). Melee is same-hex only. Ranged and melee are both resolved in the same resolution phase under a defined sequence.
- **Participant IDs:** At the start of combat resolution, each side (player) that has at least one unit in any combat is assigned a unique random integer ID by the game RNG. All ordering for that resolution phase (attacker/defender in melee, tie-breaks, multi-player melee order) uses these IDs. This supports an arbitrary number of players.
- **RNG:** A single seed is used for the entire game so that replay is deterministic.

---

## 2. Unit roster (current)

The game currently has three unit types. Stats below are proposed for combat.

| Unit type | Move | Attack | Defense | Range | Domain |
|-----------|------|--------|---------|--------|--------|
| **Infantry** | 1 | 1 | 2 | 0 (melee only) | Land |
| **Armor** | 2 | 3 | 2 | 1 (adjacent hex) | Land |
| **Naval** | 2 | 2 | 2 | 2 hexes | Water |

- **Range 0:** Unit only participates in same-hex (melee) combat.
- **Range 1:** Unit can attack an enemy in any **adjacent** hex (H3 grid distance 1; includes land–water boundary; see §6 for coastal bombardment).
- **Range 2:** Unit can attack enemies in hexes at distance 1 or 2 (e.g. naval gunfire). Range is measured by H3 grid distance (same metric as movement).

---

## 3. Offensive and defensive strengths and weaknesses

### 3.1 Infantry

- **Strengths:** Cheap, high defense (2) so they absorb hits well. Best used to hold hexes and absorb attacks.
- **Weaknesses:** Low attack (1) — only a roll of 1 scores a hit. No ranged attack; must be in the same hex to fight.
- **Role:** Defensive anchor, zone control, screening.

### 3.2 Armor

- **Strengths:** High attack (3) — hits on 1–3. Can attack **adjacent** hexes (ranged 1), so it can strike without entering the target hex. Good mobility (move 2).
- **Weaknesses:** Defense 2, same as infantry; no extra durability. Vulnerable to concentrated fire if exposed.
- **Role:** Offensive punch, ranged pressure on adjacent hexes, exploitation.

### 3.3 Naval

- **Strengths:** Move 2, ranged 2 — can strike enemies up to 2 hexes away (e.g. shore bombardment or sea combat). Attack 2, defense 2.
- **Weaknesses:** Restricted to water; cannot enter land hexes. No melee in land hexes; only contributes from water via ranged attack.
- **Role:** Naval control, coastal bombardment, striking land or sea targets from distance.

### 3.4 Cross-domain and terrain (summary)

- **Land vs. land:** Infantry and armor fight on land; both can melee in the same hex; armor can also fire into an adjacent hex.
- **Naval vs. naval:** In water hexes, naval units can melee (same hex) or use range 2 to hit other naval units in nearby water hexes.
- **Naval vs. land:** Naval can use range 2 to hit land units in hexes within 2 of the naval unit (e.g. coastal hexes). Armor in a land hex may attack naval in an adjacent water hex; infantry may not. See §6 (Coastal bombardment).
- **Terrain modifiers (optional / future):** Not required for first implementation. Later, armor could suffer a penalty in certain terrain (e.g. forest/mountain); infantry could get a defensive bonus in forest. Left out of the core resolution below for simplicity.

---

## 4. Combat resolution procedure (WEGO, no player input)

Resolution uses **current unit positions** at each step. The engine runs in this order:

1. **Ranged phase (pre-move positions)**  
   Using the **current** (pre-movement) positions:
   - Build ranged attacks: for each unit with range ≥ 1, determine enemy-occupied hexes within range; each (attacker hex, defender hex) is a ranged attack.
   - Resolve all ranged engagements (naval at 2 hexes, armor at 1 hex). Apply casualties and remove eliminated units. No melee yet.

2. **Apply all movement orders**  
   Move every unit that has a movement order to its destination. Positions are now final for the turn.

3. **Melee phase (post-move positions)**  
   Using the **post-movement** positions:
   - Build melee combats: each hex that has units from two or more sides is one melee engagement.
   - Resolve all same-hex combats in a deterministic order.

This order ensures ranged attacks are resolved when the target is still where the player aimed; movement is applied only after ranged resolution. Casualties are applied immediately after each engagement so that later engagements see updated unit counts. Within each phase, process engagements in a **deterministic order** (e.g. by defender hex H3 index ascending in ranged phase; by hex H3 index ascending in melee phase). With a single game seed, replay is deterministic.

3. **One round per phase**  
   For simplicity, use **one round of fire per phase** per combat (or per attack):  
   - Ranged phase: each eligible attacker rolls once per eligible target hex (or per target unit, depending on scale). **Return fire:** defending units that have ranged capability (range ≥ 1) and for which at least one attacking unit's hex is within that defender unit type's range each roll once (**attack** value); those hits are assigned to attacker hexes. Hits are applied via automatic casualty rules.  
   - Melee phase: same — one round of rolls, then apply hits.  
   No “continue or retreat” — no player choices. If both sides remain in the same hex after melee, they will fight again in the **next turn’s** resolution (no multi-round within the same resolution).

4. **Hit and casualty rules**  
   - **Roll:** One die per unit (d6, result 1–6).  
   - **Hit:** For **attack** (including return fire), hit if `roll ≤ attack value`. For **defense** (melee only), hit if `roll ≤ defense value`.  
   - **Return fire (ranged phase):** Only defending units with range ≥ 1 may return fire. A defending unit returns fire only if at least one attacker hex is within that unit type's range (H3 grid distance). Each such defender rolls once (attack value); hits are assigned to attacker hexes. Infantry (range 0) does not return fire at range.  
   - **Casualty assignment (automatic):** When a side receives N hits, remove N of its units in that combat using a **fixed priority** so no player chooses. Remove units in order of **lowest defense value first** (so high-value units survive when possible). Ties: use unit-type order **infantry → armor → naval**. If the combat is ranged and the “defender” is a hex with mixed unit types, apply the same priority to that hex’s stack.

5. **Elimination**  
   When a unit is chosen as a casualty (one hit = one unit removed), it is removed from the map. No capture, no retreat step — just removal.

This gives a single, predictable resolution pass: ranged first, then melee, one round each, with deterministic casualty assignment.

---

## 5. Detailed resolution flow (single resolution phase)

High-level flow: **ranged at current positions → apply movement → melee at post-move positions**.

```
1. Set phase to resolution (existing behavior).
2. Get current unit positions (before any movement). Assign participant IDs for this resolution phase (each side gets a unique random integer from the game RNG).
3. Ranged phase (pre-move positions):
   Build ranged attacks from declared orders and current positions. Group by defender hex; process engagements in deterministic order (e.g. defender hex H3 index ascending).
   For each ranged engagement (one defender hex D, set of attacker hexes):
   - All units in attacker hexes that have D in range each roll once. Attacker hits = sum of hits (roll ≤ attack).
   - Return fire: Defending units in D with range ≥ 1 roll once (attack value) if an attacker hex is in range. Defender return-fire hits = sum of those hits.
   - Assign attacker hits to D using casualty priority; remove casualties from DB.
   - Assign defender return-fire hits to attacker hexes (most units remaining, then lowest H3 index); apply casualty priority; remove casualties.
4. Apply all movement orders: update every unit that has an order to its destination hex.
5. Get unit positions after movement. Melee phase (post-move positions):
   Build melee combats: hexes that have units from two or more sides. Process hexes in deterministic order (e.g. H3 index ascending).
   For each melee hex: order sides by participant ID; resolve one round (attacker rolls attack, defender rolls defense); assign hits by casualty priority; remove casualties from DB.
6. Game-over check, clear pending orders, advance turn, set phase back to planning, save (existing behavior).
```

No player input during steps 2–6. Ranged resolution uses **pre-move** positions so ranged targets are where the player aimed; melee uses **post-move** positions.

---

## 6. Edge cases and clarifications

- **Stacking:** If multiple friendly units are in one hex, they all defend together in melee. When they attack (ranged or melee), each unit rolls. No stacking limit is assumed unless specified elsewhere.
- **Ranged vs. same hex:** A unit with range 1 or 2 can still participate in melee if it is in the same hex as the enemy. So armor in a hex with enemy infantry both (a) can be resolved in ranged phase as attacker against **other** hexes, and (b) participates in melee in its own hex. No double-counting: each unit rolls once per phase (e.g. once in ranged for its chosen target or none, once in melee if in a contested hex).
- **Coastal bombardment:** Naval at range 2 can target land units in hexes within 2 (typically coastal). **Rule:** Armor in a land hex may attack naval units in an adjacent water hex (range 1). Infantry (range 0) cannot attack naval.
- **Multiple attackers on one hex:** When several hexes attack the same defender hex, resolve as one combined engagement (see §5 step 5). Assign defender return-fire hits to attacker hexes one at a time: choose the attacker hex with the most units remaining (ties: lowest H3 index); within that hex apply casualty priority.
- **Arbitrary number of players:** Participant IDs are assigned once per side at the start of combat; melee with three or more sides in one hex uses the round-robin sub-engagement order (see §5 step 6). Ranged engagements are unchanged (attacker hexes vs defender hex; a defender hex may contain units from multiple sides; casualty priority applies to the stack).
- **Line of sight / blocking:** Ranged attacks are not blocked by terrain or intervening units. Any enemy-occupied hex within the attacker's range (H3 grid distance ≤ range) is a valid target. Implementations need not model line of sight for the initial combat system.
- **Reproducibility:** Use a single RNG seed for the entire game so that replay is deterministic (same orders and same seed produce the same outcome). Optional: support a “deterministic” mode (e.g. average or fixed roll) for testing.


- **Map and terrain:** Water bodies are generated as blobs (seeded disks around random centers) at game start rather than rings. Land units are placed only on land hexes, naval only on water hexes.

---

## 7. Ranged attack capabilities summary

| Unit    | Range (hexes) | Can strike |
|---------|----------------|------------|
| Infantry| 0              | Same hex only (melee). |
| Armor   | 1              | Same hex (melee) or **any adjacent hex** (land or water). |
| Naval   | 2              | Same hex (melee) or **any hex at distance 1 or 2** (land or water). |

So: **naval can strike out to 2 hexes** (e.g. coastal or sea targets). **Armor can strike adjacent hexes only.** Infantry is melee-only.

---

## 8. Optional extensions (later)

- **Multi-round melee:** In the same resolution, allow multiple rounds of melee in the same hex until one side is eliminated or a cap (e.g. 3 rounds) is reached. Still no player choices — engine runs rounds automatically.
- **Terrain modifiers:** E.g. armor attack/defense reduced in mountain/forest; infantry defense bonus in forest.
- **Unit hit points:** Instead of one hit = one unit lost, give units HP and weapon strength; same dice principle, different casualty math.
- **Air and other units:** When adding aircraft, give them range and attack/defense; fit into the same “ranged phase then melee phase” and automatic casualty assignment.

---

## 9. Summary

- **A&A-style:** One die per unit, hit when roll ≤ attack (when attacking) or ≤ defense (when defending in melee).  
- **Ranged:** Naval 2 hexes, armor 1 hex; infantry melee only. Defenders with range may return fire (attack roll) when attackers are within range.  
- **WEGO-friendly:** One resolution phase after movement; ranged then melee; automatic casualty assignment by fixed priority; no player-to-player interaction or confirmations.

This gives a concrete, implementable combat system that matches the current unit set and can be extended to the fuller roster (mechanized, artillery, aircraft, submarine, transport) in later milestones.

---

## 10. Display (animation)

During the resolution phase, the client animates in five steps so that combat and death overlays stay on the correct units:

1. **Ranged lightning** — Yellow lightning at hexes where ranged combat occurred; units are drawn at **pre-move** positions (including removed ranged casualties so they remain visible).
2. **Ranged casualties** — Red X at hexes where ranged units were removed; same pre-move positions.
3. **Movement** — Units interpolate from source to destination hexes.
4. **Melee lightning** — Yellow lightning at hexes where melee combat occurred; units are drawn at **post-move** positions (including removed melee casualties).
5. **Melee casualties** — Red X at hexes where melee units were removed; same post-move positions.

Ranged overlays therefore never “chase” moved units; melee overlays appear only after movement is complete.
