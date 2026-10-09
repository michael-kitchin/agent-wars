# Combat Execution and Resolution Rules

*Version 3.2 — October 2026 (aligned to engine 2.5.0)*

This document describes combat, movement, production, fog, sealift, and optional tactical battles. **Live engine symbols under `src/` are first authority.** Constants cited here are the values in those symbols as of 2.5.0.

Rules are divided into two layers: **strategic** (the primary game) and **tactical** (optional zoom-in battles). On the global map those layers are H3 resolution 1 and resolution 4. The active map supplies both through `strategicH3Resolution` and `tacticalH3Resolution` in `src/shared/h3Resolutions.ts`. `GLOBAL_STRATEGIC_H3_RESOLUTION` and `GLOBAL_TACTICAL_H3_RESOLUTION` are the global values. Both layers use **WEGO** simultaneous resolution. A tactical battle pauses the rest of the strategic map until it ends.

**Stated needs addressed:**
1. **Offensive and defensive strengths** — §3 and §2 (unit roster).
2. **Ranged attack** — §2 and §7 (strategic); §12.5 (tactical baselines, terrain caps, mountain LOS).
3. **Zero player interaction at strategic resolve** — no confirmations; casualty assignment is engine-defined. Tactical entry during resolution is the one exception: a melee-intercept dialog (Fight / Ignore).
4. **Infrastructure destruction** — §8.
5. **Optional tactical battles** — §12.

---

## 1. Design principles

- **Simultaneous resolution:** The engine resolves all combat and movement in a defined phase sequence. No mid-combat input, except the melee-intercept choice to enter a tactical battle or continue strategic melee.
- **Dice-based hits:** Each unit rolls one d20; a hit is scored when the result is **less than or equal to** that unit's hit number (A&A style). The attack hit number is `min(17, max(2, attack − weather penalty − target cover) + origin bonus + tech attack bonus)`; the defense hit number is `min(17, defense + origin bonus + tech defense bonus)` (§4.9). Penalties and cover never take an attack below 2 before either bonus, and a roll of 18 to 20 always misses.
- **Automatic casualty assignment:** Hits remove units by **lowest defense first**, then type order **infantry → armor → naval → air** (`CASUALTY_PRIORITY_ORDER`).
- **Resolution order (strategic):** embark → air strikes → ranged → ground/naval movement → cargo sync → ferry → melee. Production, control, and fog refresh run after melee.
- **Resolution order (tactical beat):** embark → air strikes → ranged → movement → ferry → cargo sync → melee. No production step.
- **Participant IDs:** At the start of combat resolution, each side with at least one unit in any combat is assigned a unique random integer ID from the game RNG. Melee ordering uses these IDs.
- **RNG:** A single game seed plus turn number produces deterministic replay for a given order set.
- **Infrastructure destruction is permanent.** Destroyed urban cells, airports, and seaports do not rebuild.
- **Tactical battles are optional.** Contested strategic hexes can be fought on the tactical grid, or resolved with strategic dice.

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
| **Infantry** | 1 | 3 | 7 | 0 (melee only) | Land | 20 | min 1 urban hex |
| **Armor** | 2 | 10 | 7 | 1 (adjacent hex) | Land | 40 | min 2 urban hexes |
| **Naval** | 2 | 7 | 7 | 2 hexes | Water/coastal | 100 | min 10 urban hexes and 1 seaport |
| **Air** | 0 (ferry only) | 10 | 3 | 3 (strike radius) | Air | 60 | min 5 urban hexes and an airport |

Attack and defense are hit numbers on a d20: 3 hits 15% of the time, 7 hits 35%, and 10 hits 50%.

- **Range 0:** Unit only participates in same-hex (melee) combat.
- **Range 1:** Unit can attack an enemy in any **adjacent** hex (H3 grid distance 1; includes land–water boundary; see §6 for coastal bombardment).
- **Range 2:** Unit can attack enemies in hexes at distance 1 or 2. Range is H3 grid distance (same metric as movement).
- **Range 3 (air only):** Unit can strike any hex within 3 hexes of its base airport. Air units do not use incremental movement — they strike from their base and return in the same phase.
- **Move 0 (air):** Air units have no incremental movement. They reposition via ferry orders (up to 4 hexes between owned airports, one action per turn — see §4.4). Ferry range (4) is longer than strike range (3). A ferry into snow can be 2 hexes when the weather bonus is on (§4.9).
- **Cost:** Each strategic hex generates production points equal to its tactical urban-cell count per turn (`buildProductionIncomeRule`). On the global map those are res1 hexes and res4 cells. Points accumulate toward the queued unit; when accumulated points meet or exceed the cost, the unit spawns and excess carries over immediately. A hex produces as many units per turn as its rate and caps allow. Air also requires an airport at the hex; naval requires a seaport. A neutral-border hex produces nothing and cannot host an air or naval base. Urban cells on that hex stay on the map.

  Examples: a hex with 5 urban hexes produces one infantry (cost 20) every 4 turns. A hex with 10 urban hexes and a seaport queues a naval unit (cost 100): it spawns on turn 10 when accumulated production first reaches 100.

  The costs and urban minimums in the roster are the global map. `unitCostFor` and `buildMinimumUrbanCells` in `src/shared/gameRules.ts` read the active map. Infantry's urban minimum stays 1. Regional columns are in `src/shared/regionalRulesCatalog.ts` and are not used until a regional map is loaded.

  Air strikes that destroy urban cells permanently reduce the production rate. On the global map one strategic hit destroys 9 tactical urban cells (`strategicUrbanCellsDestroyedPerHit` in `src/shared/gameRules.ts`). On a regional map the same hit destroys that map's `strategicStrikeUrbanCells` from `src/shared/regionalRulesCatalog.ts`.

  Each new unit records where it was born: its strategic hex, and one tactical cell inside that hex when the hex has land. An intact urban cell is chosen when the hex has one; otherwise any land cell. Rubble is not intact urban. A hex with no land cell records no cell, uses that hex's own terrain, and has no country. The chosen cell also stores its terrain, whether it is intact urban, and its country from the naming data ([terrain pipeline](terrain-pipeline.md)). On the global map the unit's area id and area name are that country name. On a regional map the area is the origin unit of the birth cell: the stored id, the display name, and that origin's country code. The origin bonus matches the area id, which is the country name on the global map and the origin id on a regional map. Labels show the country once when the origin is the country, and the brief area name followed by that country when the origin is a subdivision. That country is the English name of the origin's country code from the loaded map's strategic country rows, not the birth cell's naming country. A missing name leaves a subdivision as the brief area name alone. The flag is the subdivision SVG when the origin's `iso_3166_2` has a file under `static/flags/subdivisions/`, otherwise the national flag for the country code. The origin drives the flag on unit names and the optional origin bonus and terrain bonus (§4.9). Hovering the flag lists the bonuses the unit was born with and does not repeat the birth place ([stack callout](ux/stack-callout.md)). Those lines stay the same after the unit moves. With the country and terrain bonuses off, the origin has no effect on dice and AI prompts do not mention an origin bonus.

- **Strategic movement** is a flat hex budget (`getMovementBudget`): infantry 1, armor 2, naval 2, air 0. Entering a hex does not cost extra movement. Armor that enters a rugged, arctic, or city hex ends its move there; armor already on that hex may leave. A longer route continues on the next turn, and the turn count includes that halt. With the weather bonus on, armor and naval can be shorter (§4.9). That shorter budget does not stack with the armor stop. Naval movement is restricted to water and coastal hexes (`NAVAL_MOVEMENT_PROMPT_RULE`).

---

## 3. Offensive and defensive strengths and weaknesses

### 3.1 Infantry

- **Strengths:** Cheap, defense 7, as high as any unit. Holds hexes and absorbs hits.
- **Weaknesses:** Attack 3. No strategic ranged attack; must be in the same hex to fight. Cannot return fire against strategic air strikes (strategic range 0).
- **Role:** Defensive anchor, zone control, screening, airport/infrastructure defense.
- **Tactical:** Gains ranged baseline 2 (see §12.5).

### 3.2 Armor

- **Strengths:** Attack 10. Can attack **adjacent** hexes (ranged 1). Move 2.
- **Weaknesses:** Defense 7, same as infantry.
- **Role:** Offensive punch, ranged pressure on adjacent hexes, exploitation.

### 3.3 Naval

- **Strengths:** Move 2, ranged 2. Attack 7, defense 7. Can carry land units (see §9).
- **Weaknesses:** Restricted to water and coastal hexes. No melee in land hexes; contributes from water via ranged attack.
- **Role:** Naval control, coastal bombardment, transport.

### 3.4 Air

- **Strengths:** Attack 10, strike range 3 from base. Can target enemy units **or** infrastructure. The only unit capable of destroying infrastructure. Grants a 3-hex visibility radius around its base (see §6).
- **Weaknesses:** Defense 3. No incremental movement; ferry consumes the unit's entire turn. Cannot participate in melee. Destroyed if an enemy ground unit captures its base airport hex, or if the airport is destroyed.
- **Role:** Reconnaissance, deep strike, infrastructure destruction, air superiority via airport strikes.

### 3.5 Cross-domain and terrain (summary)

- **Land vs. land:** Infantry and armor fight on land; both can melee in the same hex; armor can also fire into an adjacent hex.
- **Naval vs. naval:** In water hexes, naval units can melee (same hex) or use range 2.
- **Naval vs. land:** Naval can use range 2 to hit land units within 2 hexes. Armor in a land hex may attack naval in an adjacent water hex; infantry may not on the strategic map. See §6 (Coastal bombardment).
- **Air vs. ground/naval:** Air units strike during the air strike phase (before ranged). When targeting units, defending ground/naval units with **strategic** range ≥ 1 in the target hex may return fire at their attack value — no range-to-base check. Infantry cannot return fire against air on the strategic map. In a tactical battle, defending sub-units with a tactical ranged baseline (including infantry) may counter-fire; see §12.5. When targeting infrastructure, only the infrastructure's fixed counter-fire roll applies.
- **Ground vs. air (base attack):** Air units do not participate in melee. If an enemy ground unit enters a hex containing an airport with a based air unit, the air unit is destroyed (see §6).
- **Strategic terrain combat modifiers:** Terrain cover (§4.9, "Terrain cover"), plus city cover of 2 against ground and naval fire and 1 against air strikes, and rugged cover of 2 against ground and naval fire. Each column uses the higher of those values. A target hex whose main terrain is forest, mountain, or wetlands lowers ranged and air-strike hit numbers. Strategic ranged and air strikes are not blocked by terrain or intervening units.
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

- **Roll:** One die per unit (d20, result 1–20). Each roll draws once from the seeded game RNG (`createCombatDieRoller` in `src/main/combatDice.ts`). The roll site also records the face and hit number for the playback dice chips (§13.1) without drawing again, so showing dice never changes a result (`rollCombatDieAgainst` in `src/main/combatDiceRecording.ts`).
- **Hit:** For **attack** (including return fire), hit if `roll ≤ min(17, max(2, attack − weather penalty − target cover) + origin bonus + tech attack bonus)`. For **defense** (melee only), hit if `roll ≤ min(17, defense + origin bonus + tech defense bonus)`. The weather penalty, cover, origin bonus, and tech bonus are each 0 unless the rules below apply (`attackHitThreshold` and `defenseHitThreshold` in `src/main/combatHitThresholds.ts`).
- **Floor and cap:** The floor of 2 applies after penalties and cover and before the origin and tech bonuses, so a shot keeps at least a 10% chance and a qualifying unit gets its full bonuses. The cap of 17 means a roll of 18, 19, or 20 always misses.
- **Return fire (ranged phase):** A defending unit returns fire only if at least one attacker hex is a legal reverse shot under planning rules. **Strategic ground** (infantry/armor/naval): strategic ranged range + H3 grid distance. Infantry strategic range is 0, so infantry never returns fire on the strategic map. **Tactical ground:** tactical ranged baselines with terrain caps and mountain LOS (same as direct-fire validation), including infantry. **Air** in the ranged phase: strike-planning rules — intact airport at base, and on the strategic map within air strike range of the attacker hex; in a tactical battle, airport only (engagement hexes are already in footprint). Air-strike phase counter-fire (§8) is separate and still has **no** range-to-base check.
- **Casualty assignment:** When a side receives N hits, remove N of its units using **lowest defense first**. Ties: **infantry → armor → naval → air**.

#### Origin bonus and terrain bonus (optional)

Two new-game dropdowns, **Origin bonus** and **Terrain bonus**, each offer Off, Low, and High, and default to Low. A match saved before levels existed plays at Low. Each dropdown is set independently. When a unit qualifies where it stands at the moment of a roll, it adds that bonus's amount to its attack or defense value for that roll (hit if `roll ≤ value + amount`). The number of dice never changes.

| Level | Added to a qualifying roll |
|---|---|
| Low | +2 |
| High | +4 |

The highest printed attack is 10, so origin alone reaches 14, under the cap of 17. The highest defense hit number from origin alone is 11.

- **Origin bonus (strategic and tactical):** the unit's area id equals the place id where it rolls. On the global map that id is the country name, matched by the canonical name and not by code. On a regional map that id is the origin-unit id. On the strategic map, a hex's place id is the majority value among its tactical cells: the country name on the global map, or the origin id on a regional map. Ties go to the value that sorts first. A hex with no counted cells has no place id. In a battle, a cell's place id is that cell's own value, the same one used for unit births.
- **Terrain bonus (tactical only):** the unit's birth terrain kind equals the cell's effective terrain kind. Urban and rubble are flags, not kinds, and never affect the match. The strategic map ignores this flag.
- **No stacking:** a unit that qualifies on both counts adds only the larger of the two amounts. For example, country High and terrain Low add 4.
- **Who qualifies:** a unit without a recorded origin never qualifies. A missing birth area skips the country test. A missing birth terrain skips the terrain test. Tactical sub-units use their parent unit's origin.
- **Where a unit stands:** air strikes and ranged fire use pre-move positions; melee uses the melee hex or cell. An air unit is judged at its base, whatever it strikes. Cargo shares its carrier's position.
- **Rolls that change:** ranged fire and return fire (including standing-order defend fire), both melee rolls, air strikes on units and on infrastructure, air-strike counter-fire by defending units, and tactical ranged fire at infrastructure.
- **The origin bonus does not change:** infrastructure's fixed counter-fire, every casualty sort and air-strike victim pick (they keep the printed defense values), movement, ranges, enter costs, ferry range, sub-unit counts, and production. Weather, below, is a separate option.

`estimate_combat` uses the same effective values. `assess_unit`, `assess_hex`, the briefing Unit Status table, and the AI combat rules paragraph report the bonus only while a flag that applies in that mode is on ([ai-tools.md](ai-tools.md)).

#### Weather bonus (optional)

**Weather bonus** is a new-game dropdown offering Off, Low, and High, defaulting to Low, with a starting month under the options. The dialog opens on a random month, and the player can pick another month or draw again. A global turn is one month, shown as `November, Year 3`. A regional turn is one week, shown as `November 22nd, Year 1`, and the match starts on the 1st of the selected month in a leap year. The year advances when that start month comes around again. February has 29 days in Years 1, 5, 9, and so on, and 28 days otherwise. Weather changes when the date enters a new month. Every beat of a battle stays on that date and uses the weather of the enclosing hex. The date is shown whether or not this bonus is on.

Weather is Mild, Rain, Snow, or Heat, from a fixed monthly climate, not a roll. A month is snow when its mean temperature is at or below 0°C; otherwise rain when precipitation is at least 120 mm; otherwise heat when the mean is at least 23°C; otherwise mild. A hot wet month displays as rain and still counts as heat. Land hexes are sampled at the centroid. A water hex copies the nearest land hex within two res1 steps, and is mild all year when no land is that close ([terrain pipeline](terrain-pipeline.md)).

A unit is tagged for rain, snow, or heat when its birth hex has that condition in at least 3 of 12 months. Mild is never a tag. At most two tags. When three qualify, the two with more months are kept; equal counts keep snow, then heat, then rain. Tags are shown in the order snow, rain, heat. No birth hex means no tags. Sub-units inherit the parent.

Penalties apply only to units that lack the tag. They never raise a printed stat. A match with no saved weather setting plays with the bonus off. A match saved before levels existed plays at Low. An unreadable start month is January. Turn 1 of a January match is January, Year 1. On a regional map that is January 1st.

| Rule | Low | High |
|---|---|---|
| Weather that slows untagged armor | snow, rain | snow, rain, heat |
| Weather that slows untagged naval | snow | snow, rain |
| Strategic movement when slowed | 1 hex | 1 hex |
| Tactical point budget cap when slowed | 2 | 1 |
| Armor ranged attack in snow or heat | -3 | -5 |
| Air strike when base or target is snow, rain, or heat the unit lacks | -3 | -5 |
| Infantry open-ground enter cost in snow or rain | 2 | 2 |
| Strategic ferry into snow | 2 hexes | 2 hexes |

- **Strategic movement** is always infantry 1, armor 2, naval 2, air 0, with the weather bonus off. At Low or High, armor and naval in weather that slows them move 1 hex. The weather is the hex the unit occupies now, so it can still enter a worse hex at full speed and is slowed on the next turn. Route and distance estimates use that same budget for the whole path.
- **Tactical movement:** in weather that slows it, armor's or naval's budget becomes the level's cap (2 at Low, 1 at High), then the lower of that and the existing forest or urban budget. A slowed unit's budget is never below 1, and a march always makes at least one cell of progress. Infantry's budget stays 2. Snow or rain raises the cost of entering open ground (plains, desert, wetlands, arctic, coastal) to 2. Roads, rubble, and urban costs do not change.
- **Attack:** armor ranged attack, including return fire and air-strike counter-fire, is lower in snow or heat by the level's penalty (3 at Low, 5 at High). An air strike is lower by the same amount once when the base or the target is snow, rain, or heat the unit lacks. The attack is at least 2 after the penalty and any cover, and before the origin and tech bonuses. High origin and High weather do not cancel exactly: home armor firing in snow ends at `max(2, 10 − 5) + 4 = 9`, one below its printed 10. Rain does not cut armor attack. Infantry attack is unchanged.
- **Unchanged:** defense, melee dice, casualty order, and tactical ferry. A strategic ferry into snow is 2 hexes instead of 4 when the unit lacks the snow tag, at either level.

`estimate_combat` uses the same attack thresholds. The turn line names the date whether or not this bonus is on. With the bonus on, the combat paragraph states the penalties for the chosen level.

#### Tech bonus (optional)

**Tech bonus** is a new-game dropdown offering Off, Low, and High, defaulting to Low. It sits on the first bonus line, to the right of Origin bonus. A match saved with no tech row plays with the bonus off. A saved flag with no level plays at Low.

A unit's tier is fixed from the generated urban-cell count of its birth strategic hex, not from the live count after air strikes destroy urban cells. The Advanced cutoff is `advancedTechMinUrbanCells()`: 21 urban cells on the global map, and that map's catalog threshold when a regional map is loaded. That many or more is Advanced. Fewer, a missing birth hex, or an unloaded count is Basic. The tier does not follow the hex the unit stands on now, and it does not change when the unit moves. Tactical sub-units use the parent unit's birth hex.

| Level | Advanced attack | Advanced defense | Basic |
|---|---|---|---|
| Low | +2 | 0 | 0 |
| High | +2 | +2 | 0 |

The points are added after the floor of 2, in the same place as the origin bonus, and the cap of 17 still applies. Origin and tech are different bonuses and both apply. Real armor with High origin and High tech attacks at 16. Defense at High tech is the printed defense plus 2, so infantry and armor defend at 9 before any origin bonus.

- **Rolls that change:** the same attack rolls as the origin bonus, including unit counter-fire. High also changes melee defense.
- **Unchanged:** casualty order and air-strike victim picks (they keep printed defense), infrastructure counter-fire, movement, range, and production.

The unit-flag tooltip lists Tech for a Basic or Advanced unit, with that tier's icon and word. The world-hex tooltip and the single-hex build popup use that same icon and word for the tier of units the hex produces, from the hex's generated urban count, including after its cities are destroyed. The multi-hex build popup lists each selected tier once, Basic then Advanced, with that same icon and word. A match with tech off omits the unit line, the world-hex line, and both build-popup lines. A hex that produces no units omits its line, and the multi-hex line is omitted when no selected hex produces units. A zoomed cell and a battle cell omit the world-hex line ([hex tooltips](ux/hex-tooltips.md), [build popup](ux/build-popup.md), [multi-hex build popup](ux/multi-hex-build-popup.md)). With the option off, the combat paragraph does not mention tech. With it on, `assess_unit` reports `techLevel`, `estimate_combat` reports effective values plus `techBonus`, and the briefing Bonus cell names the clause.

#### Terrain cover

Cover lowers the shooter's attack hit number based on the **target's** terrain. It is always on; there is no setting. Values live in `TERRAIN_COVER_BY_CATEGORY` and `URBAN_OR_RUBBLE_TERRAIN_COVER` (`src/shared/terrainCoverRules.ts`).

| Target terrain | Against ground and naval fire | Against air strikes |
|---|---|---|
| Forest | 2 | 1 |
| Mountain | 2 | 0 |
| Wetlands | 1 | 0 |
| Urban or rubble (battle cells only) | 2 | 1 |
| Everything else | 0 | 0 |

- **Applies to:** ranged fire at units and air strikes on units, on the strategic map and in battles. Cover is subtracted together with any weather penalty, before the floor of 2.
- **Never applies to:** melee, return fire, anti-air counter-fire, air strikes on infrastructure, battle ranged fire at infrastructure, and infrastructure counter-fire.
- **Shared by the target:** cover belongs to the target hex or cell, not to each defender. Every unit there shares it, including fleets and embarked cargo in a coastal hex whose main terrain is forest or mountain. It is applied once per shot, before hits are assigned by casualty order.
- **Strategic source:** the target hex's main terrain, `hexes.terrain_kind`, which is the dominant detail-cell kind stored at seeding and never changes during a match. A city hex also has cover 2 against ground and naval fire and 1 against air strikes. A rugged hex also has cover 2 against ground and naval fire. Each column uses the higher of the terrain cover and those values. The urban and rubble flags do not add cover on the strategic map.
- **Battle source:** the target cell's effective terrain kind (a cell without its own kind takes the battle hex's kind, as movement does), plus its urban and rubble flags. When a cell has both, the larger cover applies in each column.

`estimate_combat` subtracts the same cover from ranged attack values, and the AI combat rules paragraph always states it. Hex tooltips include that cover on the Effects line, with an up icon for 1 and a double up icon for 2, labeled Ground & Naval Cover and Air Cover. The effects tooltip names the cover source while aiming at covered units ([hex tooltips](ux/hex-tooltips.md)).

#### Reference odds

Single-roll hit chances, useful for checking tests and play.

| Situation | Hit number | Chance |
|---|---|---|
| Armor ranged, clear | 10 | 50% |
| Armor ranged, High origin | 14 | 70% |
| Armor ranged, untagged Low snow | 7 | 35% |
| Armor ranged, untagged High snow | 5 | 25% |
| Armor ranged, High snow and High origin | 9 | 45% |
| Armor ranged at a forest hex, clear / Low snow / High snow | 8 / 5 / 3 | 40% / 25% / 15% |
| Naval bombarding a forest coast | 5 | 25% |
| Air strike, untagged High weather | 5 | 25% |
| Air strike on units in forest | 9 | 45% |
| Battle infantry firing at an urban cell | 2 (floor) | 10% |
| Infantry melee defense, High origin | 11 | 55% |
| Melee, 1 armor attacking 1 infantry (average over roles): defender lost / attacker lost | — | 42.5% / 25% |

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
   c. For unit targets: air unit rolls attack (hit on roll ≤ 10 minus the
      target's air cover). If hit, assign casualty to target hex using
      casualty priority. Defending units with range ≥ 1 in the target hex
      return fire (roll ≤ attack value, no cover); no range-to-base check.
      Any hit destroys the air unit.
   d. For infrastructure targets: see §8.3.
   e. Apply all casualties and infrastructure destruction immediately.
5. Ranged phase (pre-move positions, post-air-strike casualties):
   Build ranged attacks from declared orders, standing-order DEFEND rows,
   and the tempo sweep. Group by defender hex; process in deterministic order.
   For each ranged engagement (one defender hex D, set of attacker hexes):
   - All units in attacker hexes that have D in range each roll once,
     with D's ground-and-naval cover subtracted from their attack.
   - Return fire: defending units in D that pass planning-parity reverse
     reach each roll once (attack value, no cover).
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
- **Cover never blocks:** terrain cover (§4.9) lowers hit numbers but never makes a shot illegal.
- **Line of sight (tactical):** Mountain along the implicit grid path blocks armor and naval shots. Infantry is exempt. Air strikes and ferry are not blocked by mountains. See §12.5.
- **Reproducibility:** A single RNG seed for the entire game so that replay is deterministic.
- **Air unit base capture:** If an enemy ground unit enters a hex containing an airport with a based air unit, the air unit is destroyed during the post-melee check. The air unit does not fight in melee.
- **Air unit destroyed during air strike phase:** If air unit A strikes air unit B's airport and destroys it, and air unit B has not yet resolved its own strike (higher H3 index), air unit B is destroyed before it can act.
- **Multiple air units at same airport:** Multiple air units may be based at the same airport. If the airport is destroyed, all co-located air units are destroyed.
- **Ferry to occupied airport:** An air unit may ferry to an airport that already has air units. No stacking limit for air units at airports.
- **Self-strikes (scorched earth):** A player may order an air unit to strike their own infrastructure. Self-striking an airport with your own air units based there destroys those air units. Counter-fire rules apply normally.
- **Multiple strikes on same hex:** Multiple air units may strike the same target hex in the same turn. Each strike resolves independently. Two urban strikes on the global map destroy up to 18 tactical urban cells (9 per hit, capped at remaining). On a regional map each hit destroys that map's catalog count. Two strikes on the same airport: the first destroys it; the second finds no airport and misses.
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

1. The air unit rolls d20. Hit if roll ≤ 10 (attack value), less the target's air cover (§4.9): 9 against forest, urban, or rubble.
2. If hit, assign one casualty to the target hex using the standard casualty priority.
3. **Counter-fire:** Every defending unit in the target hex with **strategic** range ≥ 1 rolls d20; hit if roll ≤ that unit's attack value. Cover never lowers counter-fire. If any counter-fire roll hits, the air unit is destroyed. There is no range-to-base check.
   - Armor (range 1, attack 10): returns fire, hitting on 1–10 (50%).
   - Naval (range 2, attack 7): returns fire, hitting on 1–7 (35%).
   - Infantry (range 0): cannot return fire against air on the strategic map.
   - Air units at the target hex: cannot return fire (air units only act during their own strike order).

These §8.1 counter-fire rules use **strategic** range. In a tactical battle, defending sub-units with a tactical ranged baseline (including infantry) may counter-fire; see §12.5.

**Target selection:** Players order air strikes against "units" as a generic target type. Casualty priority assigns the hit automatically.

### 8.2 Air visibility

Each air unit grants its owning player visibility of all hexes within 3 hexes of its base airport. This visibility includes terrain, occupying units, build queues, and infrastructure status. It is continuous and does not require the air unit to take an action.

Air is **not** the only source of extended visibility. Ground and naval units see a disk of radius 1 (infantry) or 2 (armor, naval) around their hex. Air's 3-hex disk is still the largest.

### 8.3 Air strike vs. infrastructure

An air unit may target infrastructure at a hex within its 3-hex strike radius instead of targeting enemy units. The target hex may be enemy-controlled, neutral, or owned by the striking player. Three infrastructure target types exist. **Infrastructure counter-fire is the same whether or not the hex is occupied.** Units in the hex do not participate in counter-fire against infrastructure strikes.

Cover never applies to strikes on infrastructure or to infrastructure counter-fire. The fixed counter-fire numbers are `INFRASTRUCTURE_COUNTER_FIRE_THRESHOLD` in `src/main/combatDice.ts`.

**Target: Urban hex.** The air unit rolls d20, hit if roll ≤ 10. On hit, tactical urban cells at the target strategic hex are permanently destroyed: **9** on the global map (`strategicUrbanCellsDestroyedPerHit()`), or that map's catalog value on a regional map, or all remaining if fewer remain. Counter-fire: roll d20; the air unit is destroyed if roll ≤ 3 (15% risk).

**Target: Airport.** The air unit rolls d20, hit if roll ≤ 10. On hit, the airport is permanently destroyed. Any air units based at the destroyed airport are also destroyed immediately. Counter-fire: roll d20; the air unit is destroyed if roll ≤ 7 (35% risk).

**Target: Seaport.** The air unit rolls d20, hit if roll ≤ 10. On hit, the seaport is permanently destroyed. No new naval units can be produced at this hex. Naval units already at sea are unaffected. Counter-fire: roll d20; the air unit is destroyed if roll ≤ 3 (15% risk).

In a **tactical** battle, air may also strike strikeable infrastructure inside the footprint (urban, airport, seaport, or an active road/rail corridor that is not rubble), without the strategic 3-hex radius.

### 8.4 Infrastructure destruction is permanent

Destroyed urban hexes, airports, and seaports do not rebuild. This applies globally.

### 8.5 Counter-fire summary

| Target type | Air attack value | Counter-fire source | Counter-fire threshold |
|-------------|-----------------|---------------------|----------------------|
| Enemy units | 10 (50%), less air cover | Each defending unit with range ≥ 1 in target hex rolls independently | Defender's attack value (no range-to-base check) |
| Urban hex | 10 (50%), destroys 9 tactical cells on the global map, or the regional catalog value | Ground defenses (fixed roll, unaffected by hex occupation) | ≤ 3 (15%) |
| Airport | 10 (50%) | AA defenses (fixed roll, unaffected by hex occupation) | ≤ 7 (35%) |
| Seaport | 10 (50%) | Seaport defenses (fixed roll, unaffected by hex occupation) | ≤ 3 (15%) |

The values in §8 are the printed values. With an origin bonus on (§4.9), a qualifying air unit's strike roll and a qualifying defender's counter-fire roll each add the bonus amount (2 at Low, 4 at High). An Advanced unit also adds its tech bonus (§4.9). Infrastructure counter-fire never changes.

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
- **Strategic terrain modifiers beyond cover:** Armor stop and strategic cover are live on both maps (§3). Tactical terrain modifiers are live (§12).
- **Unit hit points:** Instead of one hit = one unit lost.
- **Infrastructure rebuilding:** If permanent destruction proves too punishing.
- **Additional unit types.**
- **Player-facing save/load and turn replay** (milestone 2.6).
- **AI-initiated tactical bail-out** as a distinct order (not implemented; only the human can voluntarily exit).

---

## 11. Summary (strategic level)

- **A&A-style:** One d20 per unit, hit when roll ≤ attack (when attacking) or ≤ defense (when defending in melee). Attack is floored at 2 before any bonus; every hit number is capped at 17.
- **Terrain cover:** The target's forest, mountain, or wetlands (plus urban and rubble in battles) lowers ranged and air-strike attack (§4.9).
- **Origin bonus and terrain bonus (optional):** +2 (Low) or +4 (High) to that value for a unit rolling in its birth country; in battles, also on its birth terrain kind. The two never stack; the larger amount applies.
- **Caps:** Small 12/8/8/6 infantry/armor/naval/air, scaled by game size. Costs 20 / 40 / 100 / 60.
- **Air strikes:** Air units strike first (range 3 from base airport), targeting units or infrastructure. One action per turn: strike or ferry (range 4).
- **Infrastructure destruction:** Urban hexes, airports, and seaports can be permanently destroyed by air strikes. No rebuilding.
- **Ranged:** Naval 2 hexes, armor 1 hex; infantry melee only on the strategic map. Return fire uses planning-parity reverse reach.
- **Fog:** Infantry vision 1, armor 2, naval 2, air 3. Stale intel lasts 2 turns.
- **Sealift:** Explicit cargo assignment. Fatal transport loss when the carrier is destroyed. LLM opponent movement orders auto-debark.
- **WEGO:** embark → air strike → ranged → movement → cargo sync → ferry → melee; automatic casualty assignment; tempo sweep fires unordered legal shots unless `hold_fire`.

---

## 12. Tactical game (optional battles at res4)

The tactical game is a separate combat layer. The battlefield is the enclosing strategic hex's own tactical cells plus three rings of neighboring tactical cells. Units deploy on the original entry edge of the enclosing hex. They may move into the margin and end there. After the battle, strategic units still occupy the enclosing hex. Infrastructure damage applies only to the enclosing hex's own tactical cells. A shot in the margin does not change any strategic hex's urban, airport, or seaport counts. Origin bonus uses each cell's country, or its regional origin area, including a margin cell. Weather is the enclosing hex's weather for the whole battle. While a tactical battle is in progress, the rest of the strategic map does not resolve. Tactical beats use the same WEGO model as the strategic game.

### 12.1 Triggering a tactical battle

Two entry paths:

1. **Planning-time magnifier.** During strategic planning, contested **explored** strategic hexes show a tactical-entry control on the map. Clicking it starts a battle for that hex (`startTacticalBattleForEnclosingHex`). The strategic turn stays in planning until the battle ends.
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

Sub-units are placed on the enclosing hex's own tactical cells, at the edge corresponding to the direction from which the parent strategic unit entered that hex (`getPreviousStrategicH3IndexForUnit`). The three neighboring rings are extra ground, including behind that line, and units are not deployed there. If a unit was already in the hex, placement uses a default edge. Road/rail corridors can allow infantry/armor to spawn on otherwise blocked cells. Urban and rubble cells are occupiable. Armor is blocked by mountains, wetlands, arctic, and water unless a transport override applies.

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
- Legal targets include enemy-occupied cells anywhere in the footprint, including a margin cell, **and** strikeable infrastructure (urban, airport, seaport, or active non-rubble road/rail) on the enclosing hex's own tactical cells. A margin city or road still slows movement and still gives cover. It is not a legal infrastructure target, and a shot there does not change a strategic hex.

Ranged attacks use the same A&A-style dice as strategic combat. Casualty assignment follows the standard fixed priority. With the origin bonus or the terrain bonus on, a unit on a cell in the area where it was built, or on a cell whose terrain kind matches its birth terrain, adds 2 (Low) or 4 (High) to its rolls there (§4.9, "Origin bonus and terrain bonus"). That area is its birth country on the global map and its origin area on a regional map. An Advanced unit adds its tech bonus on top (§4.9, "Tech bonus").

**Terrain cover in battles:** a shot at units on a forest, mountain, wetlands, urban, or rubble cell takes that cell's cover (§4.9, "Terrain cover"). The attacker-cell range cap above and the target-cell cover are separate rules and can both apply to one shot. Cover never applies to ranged fire at infrastructure. Infantry firing at an urban cell drops from 3 to the floor of 2.

**Tactical ranged target selection:** When standing-order or draft ranged rows are expanded from strategic parent units to tactical sub-units, targets must resolve to **enemy-occupied (or strikeable-infra) res4 cells** that pass tactical range and mountain LOS — not the res1-centroid footprint anchor. Sanitization re-targets invalid opponent draft rows to the closest legal enemy cell before dropping them. Naval may bombard adjacent land sub-units when range and LOS allow.

### 12.6 Tactical turn structure

The tactical game uses **WEGO** simultaneous resolution — the same model as the strategic game. Each beat:

1. **Planning:** Both sides issue movement, ranged, air strike, ferry, and sealift orders. The LLM is consulted at most once per beat under event-driven policy. `tacticalTurnNumber` increments each beat.
2. **Embark.**
3. **Air strike phase.**
4. **Ranged phase.**
5. **Movement phase** (first-leg truncation as in §12.4).
6. **Ferry** (tactical air ferry is only between intact airport cells of the enclosing hex, not a neighbor airport in the margin, and not the strategic 4-hex airport hop). If the destination is illegal and the origin airport is gone, the air unit is destroyed; if the origin is still intact, it stays.
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
5. **Movement** — Ground and naval units that are still alive interpolate from source to destination. A unit removed before movement does not move. Air ferries appear at the new airport (or show destruction, without gliding, if the ferry failed and the origin was lost). Embarked follow-moves travel with the carrier.
6. **Melee lightning** — Yellow lightning at melee hexes. A unit that reached its destination is drawn there. A unit removed on its origin is still on that hex.
7. **Melee casualties** — Red X at melee removal hexes. Air units destroyed by base capture show destruction at their airport hex.

Air strike overlays complete before ranged overlays begin. Ranged overlays never "chase" moved units; melee overlays appear only after movement is complete.

A unit removed during the air-strike stage, including by anti-air or infrastructure counter-fire, stays through that stage's red X and is not drawn again, including on the flight home. A unit removed by ranged fire, including return fire, stays through the ranged red X and is not drawn from movement onward. A melee victim stays through the melee red X. It is drawn moving only when it dies on the march destination, and a death on the origin does not glide. An unknown casualty hex shows the unknown-battle marker and does not gain the removed unit's icon. A survivor on that hex stays.

Dice chips listing every die rolled in the air strike, ranged, and melee phases sit on top of every other playback layer. Each phase's chips appear with its lightning and stay up for twice the time from that lightning through its casualties, which can run past the other stages. They are not drawn on hexes that were outside the player's vision both before and after the turn. See [resolution-playback.md](ux/resolution-playback.md).

### 13.2 Tactical battle animation

Tactical battle animation follows the same removal rule as §13.1. A battle has no unknown casualty hexes. Movement uses interpolation between that battle's tactical hexes. Ranged fire shows directional indicators. Casualties use the same red X overlay. The same dice chips sit on top of every other playback layer, for twice the time from lightning through casualties, on the battle's tactical cells.

The tactical battle UI displays the battlefield from the opening of §12, with each cell's own terrain, road and rail overlays, and sub-unit markers. Airport and seaport marks are the enclosing hex's own cells. An exit control triggers voluntary-exit mapping (§12.8).

---

## 14. Win conditions (live scenario)

The shipped scenario id is `region_vs_region`. Details: [region-vs-region.md](region-vs-region.md). After combat, production, and control updates, `evaluateRegionControlWinnerAtEndOfTurn` may name a winner:

1. **Control:** You control every strategic hex in the enemy home, and the enemy does not symmetrically control yours.
2. **Urban elimination:** The enemy home's tactical urban count sums to zero, and your home still has at least one urban cell. Mutual zero (scorched earth both homes) is not an urban-only win.

If one side has no remaining strategic units, the match also ends (force elimination in finalize). Both home-region outlines stay visible on the map regardless of fog.
