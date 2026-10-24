# Example tactical prompt

One tactical prompt from a single consultation, laid out for reading on GitHub. The operational map is in a code block so its columns stay aligned. The closing JSON example is indented here; the capture prints that object on one line.

The catalog is [tactical-prompt.md](tactical-prompt.md). The builders under `src/main/openRouter/` win if this snapshot disagrees with them. This file is a reading copy of that one consultation. Changed sentences (identity, legend, loss labels, roster line, narrative, and message) follow the builders. This capture does not record a home name, so the role line uses the builder's fallback. A named three-seat prompt is asserted by `src/main/openRouter/promptSeats.test.ts`.

---

You command your side in a WEGO (simultaneous movement) hex wargame with 2 sides. Every other side is your enemy, and so are neutral garrisons. Strategic turn: 6, date: June, Year 1, tactical beat: 4, phase: planning.

Your goal is to engage and defeat enemy forces in this battle. Review the rules, below, for how to order this.

Tactical battle map: the enclosing strategic hex's tactical cells plus up to three neighboring rings (cells beyond a regional map's edge are not part of the battle). Positions are two-character tactical briefing hex codes (A–Z and 0–9) from the operational map and Unit Status table — copy exactly; never invent codes. Distances are tactical hex steps where shown.

Final JSON: use tactical briefing hex codes for cells and enemy sub-unit ids for targetUnitId. Never emit raw H3 strings or latitude/longitude pairs.

Combat: d20 per shot — an attack hits on a roll at or below its attack value and a defensive melee roll hits at or below its defense value, after the changes below. Penalties and cover never lower an attack value below 2 before bonuses, and no value exceeds 17. infantry: 3 attack / 7 defense, range 2; armor: 10 attack / 7 defense, range 5; naval: 7 attack / 7 defense, range 10.

Hits land on the lowest-defense unit in the target stack first, then in the fixed type order infantry, armor, naval, air.

Origin bonus is on: a unit on a cell in the area where it was built adds 2 to every attack or defense value it rolls there. That area is its birth country in a global game and its origin area in a regional game.

Terrain bonus is on: a unit on a cell whose terrain kind matches its birth terrain kind adds 2 to every attack or defense value it rolls there; urban and rubble do not change a cell's terrain kind.

Terrain bonus movement: an armor unit may enter one cell of its birth terrain kind that it otherwise could not enter, unless that kind is water, and a naval unit born on wetlands may enter one wetlands cell the same way. That entry uses the rest of the beat and the unit stops there; the next beat it may continue normally or make another such entry. Routes, distances, and beat estimates use these entries only when they arrive in fewer beats.

Roads, rails, urban cells, rubble, and seaport rules are unchanged, so a road or rail through blocked terrain still allows several cells per beat.

The two bonuses do not stack; the most is +2. Casualty order still uses the printed defense values.

Tech bonus is on. An Advanced unit, born in a hex with at least 21 urban cells, adds 2 to its attack. A Basic unit adds nothing. The tech bonus does not change defense. Casualty order still uses printed defense.

Weather bonus is on: the date is on the turn line, weather changes when that date enters a new month, and every beat of a battle shares the enclosing hex's weather.

Armor strategic movement is 1 in snow or rain, and naval strategic movement is 1 in snow. In battle, armor's point budget is 2 in snow or rain and naval's is 2 in snow; infantry pays 2 to enter open ground in snow or rain.

Armor ranged attack is 3 lower in snow or heat, including return fire and air-strike counter-fire. An air strike is 3 lower once when its base or its target is snow, rain, or heat the unit lacks. A strategic ferry into snow is 2 hexes.

None of these penalties applies to a unit tagged for that weather; a tag is earned by the birth hex. Weather does not change defense, melee, or casualty order.

The Unit Status Weather column names the weather where that unit stands. Birth tags, when the unit has any, follow in parentheses.

Terrain cover: ranged fire at a forest, mountain, urban, or rubble cell needs a roll 2 lower, or 1 lower for wetlands. An air strike on units in a forest, urban, or rubble cell needs a roll 1 lower. Melee, return fire, anti-air fire, and shots at infrastructure ignore cover.

This beat resolves as embark, then air strikes, then ranged fire, then movement, then ferry, then cargo sync, then melee, with no production step. Ranged uses pre-move positions. At most one ranged_attack per unit from beat-start range; use exactly one of targetHexCode (enemy cell from the map) or targetUnitId (not your move destination).

Infantry and armor fire at their tactical baselines (infantry 2, armor 5); forest, urban, or rubble on the attacker's cell caps infantry and armor to range 1. Mountain along the line of sight blocks armor and naval shots (infantry is exempt). Air strikes and ferry are not blocked by mountains. Close to melee when out of range.

If a legal ranged_attack is available this beat, take it — ranged attacks resolve from beat-start positions and do not prevent movement in the same beat. Drop invalid attacks before submit.

Clear of weather, the point budget is 2 points for infantry, 4 for armor, 3 for naval, and air does not march.

Infantry or armor whose current cell is urban or rubble has a 1-point budget this beat, not the type baseline. Armor in forest is penalised to the infantry baseline.

Entering an intact road cell costs 1/2 point and an intact rail cell costs 1/3 point, for every terrain, for infantry and armor. That cell may be entered from a neighbor that is not on the line, including terrain the unit could not otherwise enter, and a blocked line cell may be left only onto terrain the unit can enter without a line or onto another intact line cell.

Entering an urban cell with no road or rail costs 1. Rubble with no road or rail costs 2. Rubble on a road or rail costs 1 where the unit could already enter, and does not open blocked terrain. A non-air unit always retains at least one point.

A destination beyond this beat's budget is clamped to the first reachable leg rather than rejected; when the planner cannot use the destination at all but a neighbouring footprint cell still closes on it, the engine may take that single step instead.

Friendly units may stack on the same cell. Copy a move/melee Target Hex even when it holds an enemy — that is how contact is made this period. Approach Target Hexes omit stay-put friendlies; a cell a friendly is leaving this period is a legal dest.

# Commander's Briefing

Tactical beat 4: you command 13 sub-unit(s); enemy sub-units in this battle: 4 (full visibility). 6 of your sub-units are in or near direct combat range. 6 sub-unit(s) face a critical threat and require immediate attention. Review the unit status table, attention flags, and operational map below, then issue explicit_move and ranged_attack as needed this beat.

## Unit Status and Threats

| Unit ID | Type | Hex | Bonus | Weather | Nearest enemy + distance | Threat severity | Action needed |
|---------|------|-----|-------|---------|---------------------------|-----------------|---------------|
| a1-i1-s1 | infantry | FD | +2 origin | Mild (Snow) | h1-t1-s3 @ 7 (current) | low | no |
| a1-i1-s2 | infantry | FD | +2 origin | Mild (Snow) | h1-t1-s3 @ 7 (current) | low | no |
| a1-i1-s3 | infantry | FD | +2 origin | Mild (Snow) | h1-t1-s3 @ 7 (current) | low | no |
| a1-i1-s4 | infantry | FD | +2 origin | Mild (Snow) | h1-t1-s3 @ 7 (current) | low | no |
| a1-i1-s5 | infantry | FD | +2 origin | Mild (Snow) | h1-t1-s3 @ 7 (current) | low | no |
| a1-i1-s6 | infantry | FD | +2 origin | Mild (Snow) | h1-t1-s3 @ 7 (current) | low | no |
| a1-i1-s7 | infantry | FD | +2 origin | Mild (Snow) | h1-t1-s3 @ 7 (current) | low | no |
| a1-t1-s3 | armor | KL | +2 terrain | Mild (Snow) | h1-t1-s3 @ 1 (current) | critical | yes |
| a1-t1-s4 | armor | KL | +2 terrain | Mild (Snow) | h1-t1-s3 @ 1 (current) | critical | yes |
| a1-t2-s1 | armor | KL | — | Mild (Snow) | h1-t1-s3 @ 1 (current) | critical | yes |
| a1-t2-s2 | armor | KL | — | Mild (Snow) | h1-t1-s3 @ 1 (current) | critical | yes |
| a1-t2-s3 | armor | KL | — | Mild (Snow) | h1-t1-s3 @ 1 (current) | critical | yes |
| a1-t2-s4 | armor | KL | — | Mild (Snow) | h1-t1-s3 @ 1 (current) | critical | yes |

## Attention Flags

- a1-t1-s3 faces a critical threat (nearest enemy: h1-t1-s3, distance 1).
- a1-t1-s4 faces a critical threat (nearest enemy: h1-t1-s3, distance 1).
- a1-t2-s1 faces a critical threat (nearest enemy: h1-t1-s3, distance 1).
- a1-t2-s2 faces a critical threat (nearest enemy: h1-t1-s3, distance 1).
- 6 unit(s) have a legal attack this beat — order a ranged_attack for each and choose the targets yourself: a1-t1-s3, a1-t1-s4, a1-t2-s1, a1-t2-s2, a1-t2-s3, a1-t2-s4.

# Operational Map

Each cell: top = tactical hex code, bottom = terrain + overlay.

Terrain: x = land, . = water.

Overlay: * = your units, ! = enemy units, including neutral garrisons, # = contested.

Features: A/a airport, S/s seaport, B/b both, U/u urban only; uppercase = your control.

Odd rows are indented one space. Use only hex codes from this map or tables.

```text
P6 PN O3 OI NZ       LZ K8 KJ JR IZ                                                                                       
x. x. x. x. x.       x. x. x. x. x.                                                                                       
    P8 PQ O6 OL N0 ND MQ L2 LC KK JS I2 IA HI GQ                                                                           
    x. x. x. x. x. x. x. x. x. x. x. x. x. x. x.                                                                           
QQ QB PS O8 ON N3 NH MT L4 LE KN JW I4 IB HL GU F2                                                                        
x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x.                                                                        
    QS QD PU PA OQ N5 NJ MW L7 LH KP JY I7 IF HN GV F5 FF                                                                  
    x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. xU x. x.                                                                  
   QU QF PW PD OS N7 NM MZ MA LK KS J1 I9 IH HQ GY F7 FG ES                                                               
   x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x.                                                               
       QW QH PZ PF OU OA NO M1 MD LN KV J3 JC IJ HS G1 F9 FJ EV D7                                                         
       x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. xU                                                         
      QY QJ P1 PI OX OC NQ M3 MG LP KY J7 JF IM HV G3 GB FM EX EA                                                         
      x. x. x. x! x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x.                                                         
             QK P3 PK O0 OF NT M6 MI LS K0 J9 JH IP HY G6 GE FO EZ EC DP                                                   
             x. x. xU x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x.                                                   
            QM P4 PL O1 OH NW M9 ML LV K3 KC JK IS H0 G9 GH FR E1 EE DR C5 CL                                             
            x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x.                                             
             Q0 QO P7 PO O4 OJ NX NB MO LY K7 KF JN IU H3 HB GK FU E4 EG DT C8 CN B2                                       
             x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x.                                       
            Q1 QR QA PR O7 OM N1 NE MP L0 LA KI JQ IY H6 HE GM FV E6 EI DW DA CP B4 BL                                    
            x. x. x. x. x. x. x. x. x. x. x. x! x. x. x. x. x. x. x. x. x. x. x. x. x.                                    
                Q2 QT QE PV PB OP N4 NI MU L5 LD KL JU I1 H9 HH GP FY E8 EK DX DC CS B7 BN A4                              
                x. x. x. x. x. x. x. x. x. x. x. x* xU x. x. x. x. x. x. x. x. x. x. x. x. x.                              
               Q3 QV QG PY PE OT N8 NL MY L9 LI KQ JX I5 IC HK GS F1 FB EN D0 DE CT B8 BQ A7 AR                           
               x. x. x. x. x. x. x. x. x. x. x. x. x. xU x. x. x. x. x. x. x. x. x. x. x. x. x.                           
                   Q4 QX QI P0 PH OW OB NP M2 MC LM KU J2 JA IG HO GW F3 FD EP D3 DH CW CB BR A8 AS                        
                   x. xU x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x* x. x. xU x. x. x. x. x.                        
                     QZ QL P2 PJ OZ OE NS M5 MH LQ KX J5 JD IL HT G0 F8 FH ER D5 DJ CZ CE BU BB AU AF                     
                     xU xU x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. xU xU xU x. x. x. x. x.                     
                            QN P5 PM O2 OG NU M8 MK LU K2 KA JI IO HW G4 GD FL EW D8 DL C0 CG BW BE AW AH AA               
                            x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. xU xU xU x. x. x. x. x. x.               
                           QP P9 PP O5 OK NY NA MM LW K6 KE JM IT H1 G8 GG FP E0 EB DO C3 CI BY BG AY AJ AB               
                           x. xU x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x.               
                                  QC PT O9 OO N2 NF MR L1 K9 KG JO IX H5 HD GL FT E3 EF DS C6 CK B0 BH AZ AK AC            
                                  x. x. xU xU x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x.            
                                    PX PC OR N6 NK MV L6 LF KM JT I0 H7 HF GO FX E7 EJ DV C9 CO B3 BJ A1 AM AD            
                                    x. x. xU x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x.            
                                           PG OV N9 NN M0 MB LJ KR JZ I6 ID HJ GR FZ E9 EM DZ DD CR B6 BM A3 AO AE         
                                           x. x. x. x. x. x. xU x. x. x. x. x. x. x. x. x. x. x. x. x. x. xU x. x.         
                                             OY OD NR M4 MF LO KW J4 JB II HP GX F4 FC EO D1 DF CV CA BP A6 AQ            
                                             x. x. x. x. x. x. xU xU xU x. x. x. x. x. x. x. x. x. x. x. x. x.            
                                                       NV M7 MJ LT K1 J8 JG IN HU G2 GA FI ET D4 DI CX CC BS A9 AT         
                                                       x. x. x. x. x. x. xU x. x. x. x. x. x. x. x. x. x. x. x. x.         
                                                         NC MN LX K5 KD JL IR HZ G7 GF FN EY D9 DM C1 CF BV BC AV AG      
                                                         x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x.      
                                                             NG MS L3 LB KH JP IW H4 HC GJ FS E2 ED DQ C4 CJ BZ BF AX AI   
                                                             .. x. x. x. x. x. x. x. xA xU x. x. x. x. x. x. x. x. x. x.   
                                                               MX L8 LG KO JV I3 H8 HG GN FW E5 EH DU C7 CM B1 BI A0 AL   
                                                               .. x. x. x. x. x. x. xU xU x. x. x. xU x. x. x. x. x. x.   
                                                                      ME LL KT J0 I8 IE HM GT F0 FA EL DY DB CQ B5 BK A2 AN
                                                                      .. x. x. x. x. x. x. xU x. x. x. xU x. x. x. x. x. x.
                                                                        LR KZ J6 JE IK HR GZ F6 FE EQ D2 DG CU B9 BO A5 AP
                                                                        .. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x. x.
                                                                               K4 KB JJ IQ HX G5 GC FK EU D6 DK CY CD BT BA
                                                                               .. x. x. x. x. x. x. x. x. x. x. x. x. x. x.
                                                                                       IV H2 HA GI FQ       DN C2 CH BX BD
                                                                                       x. x. x. x. x.       x. x. x. x. x.
```

Units at featured hexes: PI(A), KI(U)

### Best Options This Turn

| Unit IDs | Action | Target Hexes | Target Units | Target Infrastructure |
| --- | --- | --- | --- | --- |
| a1-i1-s1, a1-i1-s2, a1-i1-s3, a1-i1-s4, a1-i1-s5, a1-i1-s6, a1-i1-s7 | approach | F3 | h1-t1-s3, h1-t2-s3 | — |
| a1-i1-s1, a1-i1-s2, a1-i1-s3, a1-i1-s4, a1-i1-s5, a1-i1-s6, a1-i1-s7 | approach | F1 | h1-t1-s3, h1-t2-s3 | — |
| a1-i1-s1, a1-i1-s2, a1-i1-s3, a1-i1-s4, a1-i1-s5, a1-i1-s6, a1-i1-s7 | approach | GW | h1-t1-s3, h1-t2-s3 | — |
| a1-i1-s1, a1-i1-s2, a1-i1-s3, a1-i1-s4, a1-i1-s5, a1-i1-s6, a1-i1-s7 | approach | GS | h1-t1-s3, h1-t2-s3 | — |
| a1-i1-s1, a1-i1-s2, a1-i1-s3, a1-i1-s4, a1-i1-s5, a1-i1-s6, a1-i1-s7 | approach | GP | h1-t1-s3, h1-t2-s3 | — |
| a1-t1-s3, a1-t1-s4, a1-t2-s1, a1-t2-s2, a1-t2-s3, a1-t2-s4 | ranged | KI | 2 armor | urban |
| a1-t1-s3, a1-t1-s4, a1-t2-s1, a1-t2-s2, a1-t2-s3, a1-t2-s4 | move/melee | KI | 2 armor | urban |

## Recent Turn Notes

Turn 1:
- Message: Your armor sits there waiting for me. That's the last mistake you'll get to make.
- Strategy: Advance every unit toward the enemy armor in two columns, with a lone infantry on the flank, to set up contact next beat.

Turn 2:
- Message: Enjoy your last quiet moments, commander. My armor is already on its way.
- Strategy: Advance all armor and the flank infantry toward the enemy armor cluster, and move the main infantry body up behind them to set up contact.
- Enemy Losses: Melee attack: h1-t1-s4, h1-t2-s4
- Your Losses: Melee attack: a1-i1-s8

Turn 3:
- Message: Your armor is already finished. You just haven't realized it yet.
- Strategy: Focus all armor fire on the enemy armor in KL, then close to melee there to destroy it.
- Enemy Losses: Ranged attack: h1-t1-s2, h1-t2-s2
- Your Losses: Return fire: a1-t1-s1, a1-t1-s2

## Active Callbacks

| Event | Details |
| --- | --- |
| — | None. Omitting callbacks or sending [] leaves this list empty. You have no self-chosen triggers; under event-driven policy only engine-forced consultations remain unless you subscribe now. |

Strategic context:
- Your priority is to engage enemy forces and inflict losses when advantageous
- Your strategy is:
    (1) Use speed, surprise, and initiative to break the enemy's cohesion and morale
    (2) Attack the enemy's weaknesses (gaps) and avoid their strengths (surfaces)
    (3) Create maximum disruption with minimum force
- Your message is:
    Address your enemies in character, as their enemy commander. Deliver a one-line taunt or threat meant to unnerve them. Psychological warfare only — do not reveal real orders, hex codes, unit ids, or operational intent.

# Available Tools

Use the Commander's Briefing above for assessments and possible unit actions. Copy Best Options This Turn approach and move/melee Target Hexes into explicit_move; copy ranged Target Hexes or Target Units into ranged_attack; pick one row per sub-unit per action.

Never copy a Target Hex from a row that does not list that sub-unit.

Use plan_route only for dests not listed for that sub-unit.

1. plan_route(unitId, destination, options?) - Path and orderToHexCode. Skip this tool when the dest is already a Best Options This Turn Target Hex for that unit (copy approach/move/melee into explicit_move, ferry into ferryOrders). Otherwise copy orderToHexCode into explicit_move.destination.
2. check_distance(from, to, unitType) - Quick distance and turn estimate between two hexes. Use to compare options; skip plan_route when the dest is already a Best Options Target Hex for that unit.
3. assess_unit(unitId, radius?) - Battle briefing on one sub-unit: enemies and friendlies within radius cells, which enemies it can shoot and which can shoot it this beat, whether it can make melee contact this beat, and beats to reach each unit.
4. estimate_combat(engagementType, attackers, targetHex, defenders?) - Predict a ranged or melee engagement under battle range, terrain, and line-of-sight rules, from beat-start positions. Returns win probability, expected casualties, and an assessment. Does not cover air strikes. Always check before committing to an attack.

HOW TO USE THESE TOOLS EFFECTIVELY:

- The Commander's Briefing above already contains unit status, attention flags, and possible unit actions for this tactical beat. Use the briefing to decide targets and priorities.
- Use assess_unit on sub-units near the enemy to understand the tactical picture. Skip assessment for sub-units far from all enemies. Sub-units of one parent on the same cell match, so assess one of them; assess another sub-unit on that cell when its parent differs.
- Use estimate_combat before any ranged or melee attack. Do not guess at combat odds.
- Batch independent tool calls: when you need the same tool for several units or hexes, request all of those calls together in one reply as parallel tool calls instead of one call per reply. Wait for a result only when the next call's arguments depend on it.
- Every sub-unit with a legal shot should be given a ranged_attack, and you choose each target, because attacks resolve from beat-start positions and firing does not consume the move.
- Standing orders do not move sub-units in battle, so a sub-unit with a move option and no order is idle for the beat.
- Best Options This Turn Target Hexes are already this-beat legal destinations. Copy a Target Hex from a row listing that sub-unit into explicit_move.destination (approach or move/melee); copy a ranged Target Hex or Target Unit into a ranged_attack entry.

  Each sub-unit gets at most one move and one shot: pick one row per action type and copy its Unit IDs into one unitIds array; do not copy overlapping rows that relist the same sub-unit.

  Never copy a Target Hex from a row that does not list that sub-unit; if that sub-unit has no row, call plan_route or leave it idle. Call plan_route only for a destination the table does not list for that sub-unit.
- A destination beyond this beat's point budget is clamped to the first reachable leg rather than rejected.

  Infantry or armor whose current cell is urban or rubble has a 1-point budget this beat.

  Entering an intact road cell costs 1/2 point and an intact rail cell costs 1/3 point, for every terrain, for infantry and armor. That cell may be entered from a neighbor that is not on the line, including terrain the unit could not otherwise enter, and a blocked line cell may be left only onto terrain the unit can enter without a line or onto another intact line cell.

  Entering an urban cell with no road or rail costs 1. Rubble with no road or rail costs 2. Rubble on a road or rail costs 1 where the unit could already enter, and does not open blocked terrain.
- Infantry and armor fire at tactical baselines of 2 and 5; forest, urban, or rubble caps them to range 1. Mountain along the line of sight blocks armor and naval. Air strikes and ferry are not blocked by mountains. Close to melee when out of reach.
- Hits land on the lowest-defense unit in the target stack first, then in the fixed type order infantry, armor, naval, air.
- Friendly units may stack on the same cell. Copy a move/melee Target Hex even when it holds an enemy — that is how contact is made this period. Approach Target Hexes omit stay-put friendlies; a cell a friendly is leaving this period is a legal dest.
- Unit-scoped callbacks use sub-unit ids; the response replaces the entire subscription list, so omit the array or send [] to clear every subscription this beat; all of them are also cleared when the battle ends. An empty Active Callbacks table means you have no self-chosen triggers; under event-driven policy only engine-forced consultations remain unless you subscribe now.
- The model is consulted when a subscribed event fires or when the engine forces a consultation; a beat it is not consulted for is a beat in which its sub-units issued nothing.
- The message field is a taunt or threat and must not reveal orders, cells, unit ids, or intent.

Enemy units (currently observed): Enemy: h1-t1-s1 (armor) at PI; h1-t1-s3 (armor) at KI; h1-t2-s1 (armor) at PI; h1-t2-s3 (armor) at KI

Submit your final JSON only (one compact JSON object, no markdown fence, no extra whitespace, no comments).

```text
{
  "message": "<one-line taunt or threat>",
  "strategy": "<one-line>",
  "orders": [ ... ],
  "callbacks": [...]
}
```

Strict schema: top-level must be a JSON object with "message" (string), "strategy" (string) and "orders" (array); do not return a top-level array.

The "message" field is a one-line in-character taunt or threat addressed to your enemies (psychological warfare only: do not reveal real orders, hex codes, unit ids, or operational intent).

The "strategy" field is a one-line summary of your plan for this beat.

The "orders" array is processed in list order. Each entry includes "action" and "unitId" or "unitIds" (copy several ids from one Best Options row into unitIds instead of one object per unit).

Actions: explicit_move, ranged_attack.

explicit_move (include "destination": briefing hex code for this beat's march; auto-debarks embarked cargo before marching), ranged_attack (include exactly one of targetHexCode or targetUnitId; every type with a tactical reach, infantry included). Do not emit assign_order or cancel_order for tactical sub-unit ids.

The top level must be a JSON object; a top-level array is invalid. Do not use top-level movementOrders or rangedAttacks (legacy).

An entry missing a required field is dropped without comment. More than one ranged action for the same unit in the same period is not honoured. Raw H3 strings and latitude/longitude pairs are never valid field values. A ranged action's target must not be the acting unit's own move destination. Friendly stacking is legal; a cell holding an enemy is legal as move/melee contact.

Do not emit assign_order or cancel_order for tactical sub-unit ids. memoryUpdates and productionOrders are not accepted this beat.

Strategic hex codes are never valid field values this beat.

For each explicit_move entry: set "destination" to a Target Hex from that unit's Best Options This Turn approach or move/melee row (copy the two-character code exactly), or to the exact orderToHexCode from that unit's plan_route result when the dest is not listed there.

Tactical marches use terrain-weighted MP budgets per beat; when a finite-cost path exists, the server applies at most the first leg toward each explicit_move destination (same truncation as human Ready).

When the continuity planner rejects the full destination but a footprint neighbor still advances you on the H3 grid toward that hex, the server may take that one-step fallback.

Copy a Best Options This Turn approach or move/melee Target Hex for that unit, or plan_route's orderToHexCode, not a guessed adjacent code.

Include optional "callbacks" for re-consultation: use tactical sub-unit ids (not strategic parent ids) for unit-scoped events (e.g. unit_destroyed, unit_engaged); subscriptions are evaluated after each tactical beat when event-driven mode is on and are cleared when the battle ends. Each response replaces the whole callbacks list; omit the array or send [] to clear every subscription.

Legal events and their parameters: turns (n: fires after n turns have passed since the subscription); unit_engaged (unitId: fires when that unit takes part in combat); unit_destroyed (side or unitId: fires when an own or enemy unit, or a named unit, is destroyed); threat_escalation (unitId, severity: fires when that unit's threat reaches the named severity); infrastructure_destroyed (targetType, hex (omit both for an unfiltered watch): fires when urban, airport, or seaport infrastructure at that briefing hex is destroyed; omitting targetType and hex watches any).

In battle, unit-scoped events use sub-unit ids, not strategic parent ids. 

Example (illustrative only — use briefing hex codes and unit ids from this operational map, not these placeholders). Emit compact JSON with no markdown fence:

```json
{
  "message": "This close, hesitation is already a casualty.",
  "strategy": "Close with observed enemies this beat using explicit moves and fire.",
  "orders": [
    {
      "action": "explicit_move",
      "unitIds": [
        "a1-t1-s1",
        "a1-t1-s2"
      ],
      "destination": "CD"
    },
    {
      "action": "ranged_attack",
      "unitIds": [
        "a1-t1-s1",
        "a1-t1-s2"
      ],
      "targetUnitId": "h1-i1-s1"
    }
  ],
  "callbacks": [
    {
      "event": "infrastructure_destroyed",
      "params": {
        "targetType": "airport",
        "hex": "CD"
      }
    }
  ]
}
```
