# Example strategic prompt

One strategic prompt from a single consultation, laid out for reading on GitHub. The operational map is in a code block so its columns stay aligned. The closing JSON example is indented here; the capture prints that object on one line.

The catalog is [strategic-prompt.md](strategic-prompt.md). The builders under `src/main/openRouter/` win if this snapshot disagrees with them. This file is a reading copy of that one consultation. The reply is [example-strategic-response.md](example-strategic-response.md).

---

You are the enemy commander in a WEGO (simultaneous movement) hex wargame. Current turn: 40, date: April, Year 4, phase: planning.

Your goal is to win the game, and to achieve this you must control all enemy home region hexes or destroy all enemy home region production capacity. Enemy units can be destroyed through ranged and melee combat, and production capacity can be destroyed through air strikes. Review the rules, below, for how to order this.

Global Earth map, H3 resolution 1. Positions are two-character briefing hex codes (A–Z and 0–9) from the operational map and Unit Status table — copy exactly; never invent codes. Distances are hex counts where shown.

Final JSON: use briefing hex codes for cells; standing-order pursue uses enemy unit id (targetUnitId). Never emit raw H3 strings or latitude/longitude pairs.

Combat: d20 per shot — an attack hits on a roll at or below its attack value and a defensive melee roll hits at or below its defense value, after the changes below. Penalties and cover never lower an attack value below 2 before bonuses, and no value exceeds 17. infantry: 3 attack / 7 defense, melee only; armor: 10 attack / 7 defense, range 1; naval: 7 attack / 7 defense, range 2; air: 10 attack / 3 defense, range 3.

Hits land on the lowest-defense unit in the target stack first, then in the fixed type order infantry, armor, naval, air.

Origin bonus is on: a unit in a hex in the area where it was built adds 2 to every attack or defense value it rolls there, including ranged fire, return fire, melee, and air-strike counter-fire. That area is its birth country in a global game and its origin area in a regional game. An air unit qualifies by the hex of its base, whatever it strikes. Casualty order still uses the printed defense values.

Tech bonus is on. An Advanced unit, born in a hex with at least 21 urban cells, adds 2 to its attack. A Basic unit adds nothing. The tech bonus does not change defense. Casualty order still uses printed defense.

Weather bonus is on: the date is on the turn line, weather changes when that date enters a new month, and every beat of a battle shares the enclosing hex's weather.

Armor strategic movement is 1 in snow or rain, and naval strategic movement is 1 in snow. In battle, armor's point budget is 2 in snow or rain and naval's is 2 in snow; infantry pays 2 to enter open ground in snow or rain.

Armor ranged attack is 3 lower in snow or heat, including return fire and air-strike counter-fire. An air strike is 3 lower once when its base or its target is snow, rain, or heat the unit lacks. A strategic ferry into snow is 2 hexes.

None of these penalties applies to a unit tagged for that weather; a tag is earned by the birth hex. Weather does not change defense, melee, or casualty order.

The Unit Status Weather column names the weather where that unit stands. Birth tags, when the unit has any, follow in parentheses.

Terrain cover: ranged fire at a hex whose main terrain is forest or mountain needs a roll 2 lower, or 1 lower for wetlands. An air strike on units in a hex whose main terrain is forest needs a roll 1 lower. Melee, return fire, anti-air fire, and strikes on infrastructure ignore cover. A city hex uses the higher of its terrain cover and city cover in each column. A rugged hex uses the higher of its terrain cover and rugged ground cover.

This turn resolves as embark, then air strikes, then ranged fire, then movement, then cargo sync, then ferry, then melee. Ranged uses pre-move positions. At most one ranged_attack per unit from turn-start range; use exactly one of targetHexCode (enemy cell from the map) or targetUnitId (not your move destination). Infantry has no strategic ranged_attack (melee only); use movement and melee. If a legal ranged_attack or air strike is available this turn, take it — these attacks resolve from turn-start positions and do not prevent movement in the same turn. Drop invalid attacks before submit.

Movement budgets in clear weather: 1 cell for infantry, 2 for armor and naval, and air never marches. When the weather sentence states a lower budget for a unit that lacks that weather, that lower number is this turn's budget. Armor that enters a rugged, arctic, or city hex ends its move there. Armor already on that hex may leave. A longer route continues on the next turn, and the turn count includes that halt. An explicit_move farther than this turn's budget is dropped, not shortened to the first step.

Friendly units may stack on the same cell. Copy a move/melee Target Hex even when it holds an enemy — that is how contact is made this period. Approach Target Hexes omit stay-put friendlies; a cell a friendly is leaving this period is a legal dest.

Naval units fire on land targets within 2 cells (range 2). Add ranged_attack when a naval unit is within 2 cells of an enemy at turn start. Naval units move on water/coastal hexes. To engage a land target, move to the nearest water or coastal cell within range.

An air unit may strike a target within 3 cells of its base (strike radius of 3) and may ferry up to 4 cells. It cannot strike and ferry in the same turn.

A unit that should not engage is given a fire-withholding standing order, which suppresses automatic engagement for that unit until replaced. Leaving a unit without an attack is not the same as ordering it to hold fire.

To move a naval unit toward a land target, copy a Best Options Target Hex for that naval unit if listed; otherwise call plan_route with that land unit's briefing hex code as the destination.

# Commander's Briefing

Turn 40: you command 31 unit(s); currently observed human units: 7. 13 of your units are in or near direct combat range. 1 unit(s) face a critical threat and require immediate attention. Review the unit status table, attention flags, and operational map below, then issue movement, ranged attacks, and air strikes as permitted this turn.

## Unit Status and Threats

A last-known enemy position is a report with an age; a report older than 2 turns is dropped rather than shown as old.

Nearest-enemy distances are march or sail path lengths when a path exists (otherwise a hop count). That length can be longer than one movement budget.

Best Options This Turn Target Hexes are the one-step destinations already inside this turn's budget, including weather. Copy a Target Hex into explicit_move. Do not copy a farther hex from the printed path; an explicit_move past the budget is dropped.

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
- 12 unit(s) have a legal attack this turn — order a ranged_attack or air strike for each and choose the targets yourself: a1-a4, a1-a5, a1-a6, a1-a7, a1-a8, a1-n4, a1-n5, a1-n6, a1-n7, a1-n8, a1-n9, a1-n10.

# Operational Map

Each cell: top = hex code, bottom = terrain + overlay.

Terrain: x = land, . = water.

Overlay: * = your units, ! = enemy units, # = contested, ? = undiscovered intel.

Features: A/a airport, S/s seaport, B/b both, U/u urban only; uppercase = your control.

Odd rows are indented one space. Use only hex codes from this map or tables.

```text
AB AA AC                                                                                                      
.? .? ..                                                                                                      
 AD AF AH AE AG                                                                                                
 .? .? .. x. .?                                                                                                
AK AI AN AM AJ AL                                                                                             
.? .? .? .? x. .?                                                                                             
 AU AX AT AP AV AO AQ AW AY AR AS                                                                              
 x? x? .A .. x. x. x. .. .? .? .?                                                                              
A0 A6 A1 A2 A5 A8 A7 A3 BA AZ A9 A4                                                                           
x? x? .? .U xA x. x. .. x. x. x? x?                                                                           
 BB BK BG BD BJ BM BH BI BL BF BC BE                                                                           
 x? x? x? x? x? .? xB xA .. .? .? .?                                                                           
B2 B1 B5 BZ BN BT B6 BU BO BY B0 BQ BV B3 B4 BX BW BR BP BS                                                   
x? x? x? x? x? .U .. .B xB xU .A .. .. .. .? .? .? x? x? x?                                                   
 CG B7 CA CI CB CC CN CK B9 CJ B8 CM CE CL CF CD CH                                                            
 x? x? x? .? .? .U .. .? .. xB xA x. .. .? x? x? x?                                                            
C2 C3 CV CS CX CT CZ C1 C4 CU CW CO CR C0 CY CQ CP                                                            
x? x? x? x? x? x? .? .? .? xA xA x. .. .. .? .? x?                                                            
 DL DR DO C8 DG C7 C6 DC DM DE DD DB DN DJ DK DQ DI DP DH DA C5 C9 DF DS                                       
 x? x? x? x? .? .? .? .U .. .? .B xA xB xB .B .A .? .? .? x? x? x? x? x?                                       
D6 EA DX DU D5 DT EB D7 D8 DZ ED DV D1 DW DY D2 D0 EC D4 D3 D9                                                
x? x? x? x? x? .? .? .? .? .. .. .? .. xA xA .. .? .? .? x? .?                                                
 EV EU EP EN EO EX EL EF ES ET EG E0 EE ER EJ EH EM EW EQ EY EK EI EZ                                          
 x? x? x? x? .? .? .? .u .. .. .B xB xA x* xB .* .. .. .? .? x? x? x?                                          
FI FN E2 FT FM FJ E6 FU FL FA E9 FD FR E1 FG E4 FS FQ E3 FO FH FE FP FB FC FK E8 E5 E7 FF FV                  
x? x? x? x? x? x? .? .? .? .? .? .u .. .. .. .. .U x* xA xB .S .B .. .? .? x? x? .? .? x? x?                  
 F4 GB F0 F7 F1 FY F8 FX F9 GF FZ GA GE F3 F2 F6 FW GD GC F5                                                   
 x? x? x? .? .? .. .. .. .U xB x* .. .. .. .? .? .? x? x? x?                                                   
GV GX G1 GO GH G7 G0 GS GN GI GM GQ G2 GR GG G4 G5 GZ GL GY GP GW G6 GU GJ GK GT G3                           
x? x? x? x? x? .? .? .? .? .? .. .U .. .. .. .. .B .B .* .. .? .? x? x? x? x? x? x?                           
 HF HE HN HA HP HH HW HR HS HX G9 HL HB HY HT H0 HC HV HI G8 HK HG HD HJ HU HO HM HQ HZ                        
 x? x? x? x? .? .? .? .? .? .u .* .S .. .. .. xB .B .* .* .. .. .. .? .? x? x? x? x? x?                        
IM H4 IQ IB IP IH H1 II IA H2 H3 IF IO H9 IK IL IE IN ID H8 H7 IC IJ H5 H6 IG                                 
.? .? .? x? .? x? x? .? .? .? .. .. .. .. .. .. .* .b .b .. .? .? x? x? x? x?                                 
 JD JA JK I6 IT JJ I9 I1 IY I2 I7 JH JB IR JF JE JL IV I8 JN IW IS JM IU I3 JI I4 I0 IX IZ I5 JC JG            
 .? .? .? .? .? .? .? .? .? .? .u .. .. .. .? .. .. .* .* .b .s .. .? .? .? x? x? x? x? x? x? x? .?            
JV J3 JS KD JX KC JZ JR J6 J4 J5 JW KA JU KF J1 J2 JT J0 KG JO J9 JQ JY KE J8 J7 KB JP                        
.? .? .? .? .? .? .? .? .? .? .? .. .. .. .? .? .. .B x# xu .. .. .? .? x? x? x? x? .?                        
 KW KP KV K4 KS K1 KU KL KM K0 KX KZ KY K3 KJ KQ K2 K5 K6 KH KN KT KI KK KO KR                                 
 .? .? .? .? .? .? .? .? .u .. .. .? .? .. .. .! xU xs .? .? .? .? x? x? x? .?                                 
LW LN K8 L1 LI LV LL K9 L6 LT LJ LC LH L3 LE L0 LD LX LM LR L2 LA LP LY L4 L7 K7 LB LF LG LK LO LQ LS LU LZ L5
.? .? .? .? .? x? .? .? .? .? .? .? .? .? .. .. .? .? .? .? .. .. x! xa x? .? .? .? .? .? .? x? x? x? x? .? .?
 MO ME MP MA MS MK MC MN MG MU MH MI MF MX MD MJ MB MM MQ MT MW L8 MV L9 ML MR                                 
 .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .b xu x? x? .? .? .? .? .? .?                                 
M9 M2 NJ M6 NF M5 NM NB M1 NO NG M3 NK MZ NH NP M8 NN M0 NC NL NQ NS NR NI MY M4 M7 NA ND NE                  
.? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .? .. xu x? x? .? .? .? .? x? x? x? .? .?                  
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

| Unit IDs | Action | Target Hexes | Target Units | Target Infrastructure |
| --- | --- | --- | --- | --- |
| a1-a4, a1-a5, a1-a6, a1-a7, a1-a8 | air strike | LP | 5 infantry | 8 urban hexes, 3 airports |
| a1-a4, a1-a5, a1-a6, a1-a7, a1-a8 | air strike | J0 | 1 infantry | 9 urban hexes, 1 seaport, 3 airports |
| a1-a4, a1-a5, a1-a6, a1-a7, a1-a8 | air strike | KQ | 1 infantry | 4 urban hexes, 1 seaport, 1 airport |
| a1-a4, a1-a5, a1-a6, a1-a7, a1-a8 | air strike | JN | — | 18 urban hexes, 4 seaports, 2 airports |
| a1-a4, a1-a5, a1-a6, a1-a7 | air strike | KG | — | 18 urban hexes |
| a1-a8 | air strike | ID | — | 6 urban hexes, 2 seaports, 2 airports |
| a1-i1, a1-t2 | approach | G5 | h1-i32, h1-i34 | 15 urban hexes, 2 seaports, 1 airport |
| a1-i1, a1-t2 | approach | GF | h1-i32, h1-i34 | 27 urban hexes, 1 seaport, 2 airports |
| a1-i2, a1-i3, a1-i17, a1-t3, a1-t4, a1-t5 | approach | GZ | h1-i32, h1-i34 | 14 urban hexes, 2 seaports, 3 airports |
| a1-i6, a1-n7, a1-n8, a1-n9, a1-n10 | move/melee | J0 | 1 infantry | 9 urban hexes, 1 seaport, 3 airports |
| a1-i6, a1-i12, a1-n4, a1-n5, a1-n6, a1-n10 | move/melee | KQ | 1 infantry | 4 urban hexes, 1 seaport, 1 airport |
| a1-i9 | approach | FH | h1-i32, h1-i34 | 14 urban hexes, 1 seaport |
| a1-i12 | move/melee | LP | 5 infantry | 8 urban hexes, 3 airports |
| a1-i13, a1-i14 | approach | FO | h1-i32, h1-i34 | 65 urban hexes, 2 seaports, 2 airports |
| a1-n4, a1-n5, a1-n6, a1-n10 | ranged | KQ | 1 infantry | 4 urban hexes, 1 seaport, 1 airport |
| a1-n7, a1-n8, a1-n9, a1-n10 | ranged | J0 | 1 infantry | 9 urban hexes, 1 seaport, 3 airports |
| a1-t2 | approach | H0 | h1-i32, h1-i34 | 25 urban hexes, 1 seaport, 5 airports |

## Supplemental Hex Intelligence

- LP: terrain land; passableBy: infantry, armor; origin Colombia notes: Adjacent to water - exposed to naval bombardment (range 2)
- J0: terrain land; passableBy: infantry, armor; origin Colombia notes: Adjacent to water - exposed to naval bombardment (range 2); Chokepoint - only 2 passable adjacent hexes
- KQ: terrain water; passableBy: infantry, armor, naval; origin Panama notes: Adjacent to water - exposed to naval bombardment (range 2)

## Recent Turn Notes

Turn 37:
- Message: Your southern line will break, and no reinforcement will reach you in time.
- Strategy: Hit the stacked enemy infantry at J0 with air and naval fire, hold J0 with our infantry, and advance the reserves toward IE and G5.
- Human Losses: Ranged attack: h1-i19; Melee attack: h1-i21; Air strike: h1-i20
- AI Losses: Melee attack: a1-i8, a1-i10, a1-i11

Turn 38:
- Message: Your defenses are hollow husks waiting to be shattered.
- Strategy: Bombard enemy positions with air and naval power while crushing the pocket at J0.
- Human Losses: Ranged attack: h1-i22; Melee attack: h1-i29, h1-i30, h1-i23
- AI Losses: Melee attack: a1-t6, a1-i5

Turn 39:
- Message: Your southern bastions will crumble into dust before our relentless advance.
- Strategy: Advance armor and infantry to contact while pounding enemy positions with coordinated air and naval strikes.
- Human Losses: Ranged attack: h1-i24, h1-i25; Melee attack: h1-i33
- AI Losses: Melee attack: a1-t7, a1-t8

# Production Status

Rules: infantry cost 20 (min urban 1), armor cost 40 (min urban 2), naval cost 100 (min urban 10 + min seaports 1), air cost 60 (min urban 5 + requires airport).

Deployment caps (per side): infantry 12, armor 8, naval 8, air 6.

Your current unit counts: infantry 12/12, armor 5/8, naval 8/8, air 6/6.

A controlled cell earns production points equal to its urban count each turn and spends them in queue order.

You are currently at maximum for: infantry, naval, air.

Do not queue types at maximum while other types can still be built; replace blocked queues with a still-available type. A hex whose available types are marked "all at cap" has no alternative — leave that queue as it is so it resumes when the cap frees up.

Production progress/spawn resolves after Ready, after combat and control resolution.

## Controlled Hex Queues

| Hex | Urban Hexes | Airports | Seaports | Available Unit Types | Current Queue |
| --- | --- | --- | --- | --- | --- |
| EJ | 80 | 8 | 4 | armor | — |
| FO | 65 | 2 | 2 | armor | — |
| ER | 50 | 4 | 3 | armor | — |
| FZ | 44 | 2 | 3 | armor | 1 air (blocked: at cap) |
| DN | 39 | 4 | 2 | armor | 1 naval (blocked: at cap) |
| EH | 39 | 4 | 4 | armor | 1 air (blocked: at cap) |
| E0 | 34 | 4 | 2 | armor | 1 air (blocked: at cap) |
| DJ | 33 | 4 | 4 | armor | 1 air (blocked: at cap) |
| E3 | 27 | 1 | 0 | armor | 1 air (blocked: at cap) |
| GF | 27 | 2 | 1 | armor | 1 air (blocked: at cap) |

# Your Strategic Memory

## Persistent (Active Strategic Context)

| Key | Updated Turn | Content |
| --- | --- | --- |
| — | — | — |

## Reminders Triggered This Turn

| Key | Tier | Recurring | Content |
| --- | --- | --- | --- |
| — | — | — | — |

Persistent: 0 of 5 slots used. Stored: 0 of 15 slots used.

Use memory_read to retrieve stored memories by key or tag. To add, update, or remove memories, use "memoryUpdates" in your final JSON (write/delete actions); there are no memory_write or memory_delete tools.

# Standing Order Status

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

## Units Without Standing Orders

| Unit ID | Unit Type | Suggested Destination |
| --- | --- | --- |
| — | — | — |

## Active Callbacks

| Event | Details |
| --- | --- |
| — | None. Omitting callbacks or sending [] leaves this list empty. You have no self-chosen triggers; under event-driven policy only engine-forced consultations remain unless you subscribe now. |

# Scenario Objective (Required)

- Scenario: region_vs_region
- Your home region: Northern America
- Enemy home region: South America
- Win at end of turn by either:
    (1) Controlling all hexes intersecting the enemy home region, OR
    (2) Eliminating all urban production (tactical urban hexes) in the enemy home region.
- Both home-region outlines are always visible on the map.

Strategic context:
- Your goals are:
    (1) Engage enemy forces to reduce their combat effectiveness
    (2) Disperse your units to maximize visibility
    (3) Maximize your own unit production
    (4) Protect your home region's production capacity
    (5) Degrade or eliminate the enemy home region's urban production capacity
- Your strategy is:
    (1) Use speed, surprise, and initiative to break the enemy's cohesion and morale
    (2) Attack the enemy's weaknesses (gaps) and avoid their strengths (surfaces)
    (3) Create maximum disruption with minimum force
- Your message is:
    Address the human player in character as their enemy commander. Deliver a one-line taunt or threat meant to unnerve them. Psychological warfare only — do not reveal real orders, hex codes, unit ids, or operational intent.
- Explored: 36 of 190 land hexes (19%)
- Controlled: 29 of 190 land hexes (15%)
- Your home region control: 69 of 69 hexes (100%)
- Your home region hexes are: AC, AH, AO, AP, AV, AE, AZ, BL, AQ, BA, AW, AJ, BH, BU, BT, B6, AT, A5, A2, BQ, CM, B0, CO, A3, BV, A7, BY, B8, CJ, CU, A8, BI, BO, CC, DQ, B3, CR, B9, DC, CN, DY, ER, EE, E3, CW, DN, DB, EG, DW, DD, FS, E0, EH, FE, EJ, FH, DK, DJ, GZ, FZ, GL, FO, G2, G9, GQ, F9, GF, FQ, HL
- Your control of the enemy's home region: 2 of 57 hexes (4%)
- Your enemy's home region hexes are: IW, K5, KG, J9, J0, K2, KQ, LP, JN, I8, LA, K7, MT, L4, L7, OL, NQ, NS, NL, MM, MQ, LY, O5, N9, OG, N1, OZ, MB, NC, M0, P2, PE, QR, PW, P7, PB, RZ, RB, QW, RA, RU, RV, SL, PT, QJ, QI, S8, SF, TY, SX, T5, TN, S2, VC, UO, UT, VH

# Air Operations Status

Air rules: strike range 3 from base, ferry range 4 airport-to-airport, one air action per unit per turn.

Air units: yours=6, enemy=0.

| Unit ID | Base Hex | Base Intact | Base Controlled | Enemy Unit Targets | Strikeable Urban | Strikeable Airports | Strikeable Seaports | Ferry Destinations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| a1-a1 | G9 | yes | yes | 0 | 0 | 0 | 0 | 0 |
| a1-a4 | HV | yes | yes | 7 | 9 | 7 | 7 | 22 |
| a1-a5 | HV | yes | yes | 7 | 9 | 7 | 7 | 22 |
| a1-a6 | HV | yes | yes | 7 | 9 | 7 | 7 | 22 |
| a1-a7 | HV | yes | yes | 7 | 9 | 7 | 7 | 22 |
| a1-a8 | IE | yes | yes | 7 | 7 | 7 | 6 | 22 |

Enemy infrastructure in your current strike envelope: airports=7, seaports=7.

Callback support: subscribe with event "infrastructure_destroyed" and parameters targetType plus the briefing hex code to be re-consulted after successful infra strikes.

# Naval Transport Status

Embark: coastal or land seaport (control not required), or a water seaport you control. Capacity: 1 armor or 2 infantry per naval unit.

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

# Available Tools

Use the Commander's Briefing above for assessments and possible unit actions. Copy Best Options This Turn approach and move/melee Target Hexes into explicit_move when you need a one-step move; copy ranged Target Hexes or Target Units into ranged_attack; copy ferry Target Hexes into ferryOrders; copy air strike Target Hexes into airStrikes; pick one row per unit per action.

Never copy a Target Hex from a row that does not list that unit.

Use plan_route only for dests not listed for that unit.

Standing-order status is already in the briefing; call query_orders only for a rare detail.

Use tools selectively for memory lookup (memory_read) and production queue checks/sets when needed.

1. plan_route(unitId, destination, options?) - Path and orderToHexCode. Skip this tool when the dest is already a Best Options This Turn Target Hex for that unit (copy approach/move/melee into explicit_move, ferry into ferryOrders). Otherwise copy orderToHexCode into explicit_move.destination. For naval units, you may pass a land unit's briefing hex code as destination; the route will be to the nearest water/coastal hex to that position so the naval can get in range.
2. check_distance(from, to, unitType) - Quick distance and turn estimate between two hexes. Use to compare options; skip plan_route when the dest is already a Best Options Target Hex for that unit.
3. memory_read(key?, tags?, tier?, all?) - Retrieve memories by key, tag, or tier.
4. query_orders(unitId?, all?) - Check standing order statuses.
5. query_production(hex?, all?) - Read production queue status and available unit types by controlled hex.
6. set_build_queue(hex, unitType, count) - Set one queue unit type/count and replace any previous entries for that hex.

HOW TO USE THESE TOOLS EFFECTIVELY:

- The Commander's Briefing above already contains unit status, attention flags, possible unit actions, and supplemental hex intelligence for this turn. Use the briefing to decide targets and priorities.
- Batch independent tool calls: when you need the same tool for several units or hexes, request all of those calls together in one reply as parallel tool calls instead of one call per reply. Wait for a result only when the next call's arguments depend on it.
- memoryUpdates / tiers: "persistent" entries appear in every briefing (limit 5); "stored" are retrieved via memory_read (limit 15).
- Production: use query_production to inspect controlled-hex queues and constraints; use set_build_queue to set one unit type/count for a queue (this replaces existing queue entries). If skipping tools, you may include productionOrders in final JSON.
- Win by controlling all enemy home region hexes, or by destroying all enemy home region production capacity. Those are the cells that matter.
- This turn resolves as embark, then air strikes, then ranged fire, then movement, then cargo sync, then ferry, then melee. A unit that fires can still move, and a ferried air unit arrives after ground movement.
- Every unit with a legal shot should be given a ranged_attack or air strike, and you choose each target, because the shot resolves from the turn-start position and does not consume the move.
- A unit that should not engage is given a fire-withholding standing order, which suppresses automatic engagement for that unit until replaced. Leaving a unit without an attack is not the same as ordering it to hold fire.
- Hits land on the lowest-defense unit in the target stack first, then in the fixed type order infantry, armor, naval, air.
- Best Options This Turn Target Hexes are already this-turn legal destinations. Copy a Target Hex from a row listing that unit into explicit_move.destination (approach or move/melee); copy a ranged Target Hex or Target Unit into a ranged_attack entry; copy a ferry Target Hex into ferryOrders; copy an air strike Target Hex into airStrikes.

  Each unit gets at most one move and one shot: pick one row per action type and copy its Unit IDs into one unitIds array; do not copy overlapping rows that relist the same unit.

  Never copy a Target Hex from a row that does not list that unit; if that unit has no row, call plan_route or leave it idle. Call plan_route only for a destination the table does not list for that unit.
- Friendly units may stack on the same cell. Copy a move/melee Target Hex even when it holds an enemy — that is how contact is made this period. Approach Target Hexes omit stay-put friendlies; a cell a friendly is leaving this period is a legal dest.
- For every unit listed under ## Units Without Standing Orders, add an orders[] entry with action assign_order. When Suggested Destination is a bare hex, march there. That hex may be the enemy-occupied hex. When an enemy is observed, it is a legal destination that closes on the nearest enemy. When no enemy is observed, that hex may lie beyond this turn's movement budget; it is still the march destination. Use pursue only when you supply an enemy unit id, not in place of that hex.

  When Suggested Destination starts with defend, assign defend on that hex, including an air unit that can strike. Do not march an air unit. When the cell is —, do not invent a march. Assign defend on its current hex only when an enemy is already observed and the unit is on that enemy or has no closing step. Never march to the unit's current Hex; that order is dropped as already arrived and the unit stays idle.

  Copy a Suggested Destination hex into explicit_move only when Best Options lists that same hex for that unit this turn. Otherwise, when you need a one-step explicit_move this turn, copy a Best Options approach or move/melee Target Hex for that unit. That hex is already inside this turn's movement budget, including weather. Do not copy a farther hex from the printed nearest-enemy path.
- Units with a healthy standing order do not need explicit orders from you unless you want to override their current mission this turn; the attention column marks stalled orders and marches whose next move recedes from the nearest enemy. A this-turn move/melee Target Hex is such an override — copy it even when the unit is already marching. After a unit fires, do not leave it on a standing march that recedes from that enemy: assign defend to hold contact, cancel the march, or remarch toward the enemy.
- For every air unit with no strike listed in Best Options, take its ferry Target Hex toward the fighting, but only when Air Operations Status shows that unit's Base Intact and Base Controlled columns as yes. Issue that ferry even when the unit is holding on defend. An air unit cannot strike and ferry on the same turn.
- Naval units cannot enter land cells; to engage a land target, move to the nearest water or coastal cell within range.
- When land force must cross water, embark at a legal cell, move the transport, then disembark; loading requires a coastal cell, a land seaport, or a controlled seaport on transit water. Use the # Naval Transport Status section for each naval unit (capacity, cargo already aboard, nearest embark hex). While embarked, explicit_move and disembark both clear cargo and march in one action.
- When a controlled cell can build and its queue is empty, queue something.

  Do not queue types at maximum while other types can still be built; replace blocked queues with a still-available type.

  A hex whose available types are marked "all at cap" has no alternative — leave that queue as it is so it resumes when the cap frees up.

  When every available type for that cell is capped, leave the queue alone so it resumes when the cap frees.
- Write a short persistent note naming this turn's objectives and the units assigned to them. Always include a memoryUpdates write this turn when persistent slots are unused. Do not persist enemy positions or rosters, which the briefing already supplies fresh each turn.
- Subscribe only to events from the engine's event vocabulary; the response replaces the entire subscription list, so repeat every subscription you still want. Omit the array or send [] to clear every subscription. An empty Active Callbacks table means you have no self-chosen triggers; under event-driven policy only engine-forced consultations remain unless you subscribe now.
- The model is consulted when a subscribed event fires or when the engine forces a consultation; a turn it is not consulted for is a turn in which it issued nothing.
- The message field is a taunt or threat and must not reveal orders, cells, unit ids, or intent.
- Rounds are limited and exhausting them submits nothing at all; once destinations are chosen, submit.

Human units (currently observed): h1-i31 (infantry) at LP; h1-i32 (infantry) at J0; h1-i34 (infantry) at KQ; h1-i35 (infantry) at LP; h1-i36 (infantry) at LP; h1-i37 (infantry) at LP; h1-i38 (infantry) at LP

Submit your final JSON only (one compact JSON object, no markdown fence, no extra whitespace, no comments).

```text
{
  "message": "<one-line taunt or threat>",
  "strategy": "<one-line>",
  "orders": [ ... ],
  "airStrikes": [ ... ],
  "ferryOrders": [ ... ],
  "callbacks": [...],
  "memoryUpdates": [...],
  "productionOrders": [...]
}
```

Strict schema: top-level must be a JSON object with "message" (string), "strategy" (string) and "orders" (array); do not return a top-level array.

The "message" field is a one-line in-character taunt or threat addressed to the human player (psychological warfare only: do not reveal real orders, hex codes, unit ids, or operational intent).

The "strategy" field is a one-line summary of your plan for this turn.

The "orders" array is processed in list order. Each entry includes "action" and "unitId" or "unitIds" (copy several ids from one Best Options row into unitIds instead of one object per unit).

Actions: assign_order, cancel_order, explicit_move, ranged_attack, embark, transport_move, disembark.

assign_order (include "order": { "type": "defend"|"march"|"pursue"|"patrol"|"hold_fire", ... } — required fields per type: "march" needs "destination" (one two-character briefing hex code); "defend" needs "defendHex" (one hex code); "patrol" needs "waypoints" (an array of two or more hex codes, visited in order then looped — a single "destination" is not a valid patrol); "pursue" needs "targetUnitId" (an enemy unit id string); "hold_fire" needs no extra fields. Air units never move hex by hex, so "march", "patrol", and "pursue" are rejected for them — use airStrikes for attacks, ferryOrders to reposition, or a "defend" order to keep striking targets in range), cancel_order, explicit_move (include "destination": briefing hex code for this turn's move; auto-debarks embarked cargo before marching), ranged_attack (include exactly one of targetHexCode or targetUnitId; units with a strategic ranged reach of at least one, never infantry), transport_move (include "navalUnitId" and "destination" hex code), disembark (include "unitId" and "destination" hex code — clears cargo assignment then moves in one action), embark (include "unitId" and "navalUnitId").

assign_order place fields are operational-map briefing hex codes, not plan_route orderToHexCode; they may be multi-turn goals. Best Options Target Hexes are this-turn dests only.

Optional top-level air actions: airStrikes[] entries use { "unitId" or "unitIds", exactly one of "targetHexCode" or "targetUnitId", "targetType": "units"|"urban"|"airport"|"seaport" }, ferryOrders[] entries use { "unitId" or "unitIds", "destination": "`<hex code>`" }.

The top level must be a JSON object; a top-level array is invalid. Do not use top-level movementOrders or rangedAttacks (legacy).

An entry missing a required field is dropped without comment. More than one ranged or air action for the same unit in the same period is not honoured. Raw H3 strings and latitude/longitude pairs are never valid field values. A ranged action's target must not be the acting unit's own move destination. Friendly stacking is legal; a cell holding an enemy is legal as move/melee contact. A march to the unit's current cell is dropped as already arrived. Air units cannot be given march, patrol, or pursue orders. Infantry cannot be given a strategic ranged_attack.

For each explicit_move entry: set "destination" to a Target Hex from that unit's Best Options This Turn approach or move/melee row (copy the two-character code exactly), or to the exact orderToHexCode from that unit's plan_route result when the dest is not listed there.

Include optional "callbacks" for re-consultation planning. Each response replaces the whole callbacks list; omit the array or send [] to clear every subscription.

Legal events and their parameters: turns (n: fires after n turns have passed since the subscription); unit_engaged (unitId: fires when that unit takes part in combat); unit_destroyed (side or unitId: fires when an own or enemy unit, or a named unit, is destroyed); unit_arrived (unitId: fires when that unit's standing march arrives); threat_escalation (unitId, severity: fires when that unit's threat reaches the named severity); infrastructure_destroyed (targetType, hex (omit both for an unfiltered watch): fires when urban, airport, or seaport infrastructure at that briefing hex is destroyed; omitting targetType and hex watches any).

Use optional "memoryUpdates" for memory writes/deletes (applied from JSON only; there are no memory_write or memory_delete tools). Memory write keys are at most 64 characters and may contain only letters, digits, hyphen, and underscore; content is at most 500 characters.

"productionOrders" entries MUST include "action" on every item. Required forms: {"action":"set_build_queue","hex":"`<two-char code>`","unitType":"infantry|armor|naval|air","count":1..99}. Any productionOrders item missing "action" or required fields is dropped. when at least one controlled hex has availableUnitTypes and an empty queue, or a queue blocked at cap while another type can still be built, include at least one set_build_queue this turn.

Do not queue types at maximum while other types can still be built; replace blocked queues with a still-available type.

A hex whose available types are marked "all at cap" has no alternative — leave that queue as it is so it resumes when the cap frees up. Each set_build_queue item fully replaces the chosen hex queue with one unit type/count.

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
