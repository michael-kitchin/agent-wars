# Multi-commander games: execution plan (start here)

Audience: a **lower-quality coding agent**. This file is the entry point. It holds the goal, the owner's decisions, the architecture, the working rules, and the order of work. The phases themselves are in five stage documents listed under [Stages](#stages). Read this whole file before you open a stage document, and re-read [Working rules](#working-rules) before every phase.

Goal: one machine runs a free-for-all match with up to four sides. Either one human plays against one to three AI commanders, or nobody plays and two to four AI commanders fight while the human watches (Observe mode). Each AI side has its own model, reasoning effort, and doctrine. A side that loses its home is knocked out: its land turns neutral, its units become black neutral garrisons that defend in place, and the match goes on until one side is left (regional maps) or the turn limit is reached (global map).

Mockups of every new screen are next to this file as `multi-commander-4-expected-*.png`. They are the target look. Where an image and this text disagree, this text wins; the known differences are listed in [Expected images](#expected-images).

---

## Contents

- [Scope](#scope)
- [Working rules](#working-rules)
- [Environment](#environment)
- [Verification bar](#verification-bar)
- [Glossary](#glossary)
- [Owner decisions (frozen)](#owner-decisions-frozen)
- [Engineering decisions (frozen unless the owner overrides)](#engineering-decisions-frozen-unless-the-owner-overrides)
- [Architecture](#architecture)
- [Stages](#stages)
- [Expected images](#expected-images)
- [Documentation map](#documentation-map)
- [Known pre-existing problems this work touches](#known-pre-existing-problems-this-work-touches)
- [Size and risk](#size-and-risk)

---

## Scope

**In scope**

- A seat model that replaces the two hard-coded players (`'human'` and `'opponent'`) with up to four seats.
- New-game setup for two to four sides on both the Global and Regional tabs, including Observe mode.
- Per-seat AI commanders: model, reasoning effort, and a new doctrine setting (Aggressive, Balanced, Cautious, Random).
- Simultaneous planning and resolution for any number of sides, including three-sided melee.
- Knockout, neutral garrisons, and neutral land.
- Two win rules: last side standing (regional), most city hexes at the turn limit (global).
- Every interface change shown in the mockups: seat colors, top bar, Commanders tab, Reports, tactical battles list, battle header, game-over standings, Observe mode.

**Out of scope** (future versions; do not start any of these)

- AI commanders reading each other's messages (dispatches) or the human chatting with them.
- Save and load.
- Networking and more than one human.
- Alliances.
- Difficulty levels.
- Tactical battles that do not involve the human, or that involve more than two parties.

---

## Working rules

These apply to every phase in every stage document.

1. **One phase per change set**, in the order given. Do not start a phase until the previous one passed its verification bar and the human said go.
2. **Stop and report after each phase**: files touched, the test result, the output of every search the phase asks for, and any doc you updated. Then wait.
3. **If a phase fails verification, revert that phase entirely.** Do not patch forward into the next phase.
4. **If a phase's diff grows beyond the files that phase names, stop and report** before going further. A phase may touch a file it does not name only when the compiler forces it (a renamed type, a changed signature). List those files in your report.
5. **If a line number, a symbol, or a quote in a plan disagrees with the code, trust the code, stop, and report the discrepancy.** Line numbers in these documents are hints from the date the plan was written.
6. **Never commit or push** (`.cursor/rules/11-no-commit-or-push.mdc`).
7. **Never put plan identifiers in version-controlled files** (`.cursor/rules/12-no-plan-identifiers.mdc`). Stage numbers, phase numbers, and words like "Stage 2" or "Phase 3.4" must not appear in code, comments, tests, test names, or `doc/`.
8. **Follow every rule in `.cursor/rules/`.** The ones that matter most here:
   - `01-reliable-code.mdc`: reliable, understandable code.
   - `02-backend-logging.mdc`: debug on every new or updated public backend method, error on every caught exception, trace on getters that do not change state. Use `logDebug`, `logError`, and `logTrace`.
   - `03-testing-standards.mdc`: test happy paths and essential failures; test contracts, not implementation details.
   - `04-orienting-comments.mdc`: every new or changed field and function gets an orienting comment (Purpose, When to use, Expected outcome, Exceptions), in the style of the file you are editing.
   - `09-file-size-limits.mdc`: 600 lines desirable, 1000 hard. When a file you edit would pass 600 lines, put the new code in a new module next to it.
   - `10-argument-limits.mdc`: at most 6 named arguments; use a parameter object beyond that.
   - `13-mutable-and-immutable.mdc`: `readonly` and `const` wherever a value is not reassigned.
   - `14-naming-conventions.mdc` and [doc/naming-conventions-contract-v1.md](../doc/naming-conventions-contract-v1.md): names. `npm test` runs `naming:check`.
9. **Follow [AGENTS.md](../AGENTS.md)** for `doc/`. Each phase names the documents it must update. When a phase changes behavior that a `doc/` file describes and the phase forgot to name it, update it anyway and say so in your report.
10. **Do not add a backward-compatibility shim, a feature flag, or a second code path** unless a phase tells you to. Every phase leaves exactly one way to do each thing.
11. **Do not use the strings `'opponent2'`, `'opponent3'`, `'opponent4'`, or `'neutral'` as literals outside `src/shared/seatIds.ts` (new) and tests.** Use the constants and helpers from that module. The literal `'human'` and `'opponent'` stay legal only where a phase says so.
12. **No live model calls during development.** Tests never call OpenRouter. Manual checks use "No model" commanders unless the phase says otherwise. Only the last phase of the last stage plays a paid game, and the human does it.

---

## Environment

- **Shell:** Windows PowerShell, at the repository root `F:\Projects\Personal\agent-wars-public`. Run one command at a time; do not chain commands with `&&`.
- **Searches:** every search in these plans is a single PowerShell command. Paste it as one line. They all have this shape (here: every non-test TypeScript file under `src` that contains the text `'opponent'`):

  ```powershell
  Get-ChildItem -Path src -Recurse -Filter *.ts | Where-Object { $_.Name -notlike '*.test.ts' } | Select-String -SimpleMatch -Pattern "'opponent'"
  ```

  `-SimpleMatch` searches for the literal text. Without it, `-Pattern` is a regular expression. When a phase asks for a search result in your report, paste the output, or write "no output".
- **Line endings:** the working tree uses Windows line endings (CRLF). Keep each file's existing line endings. New files use CRLF like their neighbors.
- **Build output:** `static/renderer.js` is a committed build output. It changes whenever `npm run build:renderer` or `npm run ui:smoke` runs. Leave it changed; do not revert it.
- **No API key** is needed for any phase except the owner's play test at the very end.

---

## Verification bar

Every phase ends with this, plus anything the phase adds:

```powershell
npm test
```

`npm test` rebuilds native code for Node, builds `src/main`, lints, checks names, type-checks the renderer against its baseline, runs every compiled `dist/**/*.test.js`, and checks third-party notices. A new `*.test.ts` under `src/main` or `src/shared` is picked up automatically. Do not edit `package.json` to register a test.

Rules for the gate:

- Do not run `npm run check:circular` as a pass/fail gate. It already fails on cycles this work does not touch. Do not create a new cycle either: when you add an import between two modules that did not import each other, check that the reverse import does not exist.
- Do not refresh `scripts/circular-deps-baseline.json`.
- Do not refresh `scripts/renderer-typecheck-baseline.json` to hide a new error. The baseline may only shrink. If a renderer phase fixes one of the 47 known errors, run `npm run dump:renderer-types-baseline` and say so in your report.
- When a phase edits any file under `src/renderer` or `static/`, also run `npm run build:renderer`.
- When a phase says **Manual check**, prepare everything the human needs (the command, the setup, the steps, and what to look for), then stop. The human runs `npm start` and reports back. Do not mark the phase done until the human confirms.
- When a phase says **UI smoke**, run `npm run ui:smoke -- --label <phase-topic>` and report each FAIL line. The label is a short topic word, never a phase number.

---

## Glossary

| Term | Meaning |
| --- | --- |
| **Seat** | One side of a match. A match has two to four seats. Every unit, standing order, fog record, memory row, and AI setting belongs to a seat or to Neutral. |
| **Seat id** | The string stored in `units.player`, `res_s_control.controller_player_id`, `standing_orders.player_id`, and every other player column. See [E1](#engineering-decisions-frozen-unless-the-owner-overrides). |
| **Seat order** | 1 to 4. It decides the seat's color and its place in lists. Seat 1 is the human whenever there is one. |
| **Human seat** | The one seat a person plays. Its id is `'human'`. A match in Observe mode has none. |
| **AI seat** | A seat played by an AI commander. |
| **Commander** | An AI seat's settings: model, reasoning effort, doctrine. A commander with no model runs standing orders only, as today. |
| **Doctrine** | A short block in the AI's prompt that sets its temperament: Aggressive, Balanced, or Cautious. Random draws one at game start. |
| **Active seat** | A seat that has not been knocked out. |
| **Knocked out** | A seat that lost. See [D12](#owner-decisions-frozen). |
| **Neutral** | Not owned by any seat. In the interface, a known hex with no seat owner reads "Neutral", whether or not a garrison holds it. |
| **Neutral owner** | The owner id `'neutral'`. Units of a knocked-out seat take it, and so does the land that seat held. It is not a seat: it has no fog, no commander, no production. |
| **Neutral garrison** | A unit owned by Neutral. It defends in place, except a loaded ship, which sails ashore and then defends ([D15](#knockout-and-neutral)). |
| **Owner** | A seat id or the Neutral owner. Turn resolution takes one order set per owner. |
| **Party** | One owner present in a contested hex. A tactical battle has exactly two parties: the human and one other owner. |
| **Observe mode** | A match with no human seat. The human watches. |
| **City hex** | A strategic hex whose current urban cell count is above zero. |
| **Home** | A seat's home region: a side group on a regional map, a UN subregion on the global map. |

---

## Owner decisions (frozen)

The project owner made these decisions. Do not re-litigate them and do not "improve" them during implementation.

### Setup

- **D1. Seat counts.** Two to four seats. With a human: the human plus one to three AI seats. In Observe mode: two to four AI seats and no human seat.
- **D2. Homes.**
  - Regional: every seat takes a different side group of the chosen map. A map with three side groups allows at most three seats. Overlapping homes are allowed where the data has them (`intersectingHomeRegionHexes` already exists).
  - Global: every seat takes a different UN subregion. In each seat's region list, regions another seat already took are disabled and labeled with that seat's row name (for example "Southern Asia · Opponent 1"). Two seats may never share a region.
- **D3. Seat colors follow seat order.** Seat 1 teal, seat 2 rose, seat 3 orange, seat 4 blue. Exact values are in the table below. In Observe mode, side 1 takes teal.

  | Seat | Map, order lines, token | Force bars | Text, dice chips |
  | --- | --- | --- | --- |
  | 1 | `#115E59` | `#1B8A82` | `#7DCEC8` |
  | 2 | `#9D174D` | `#B02A62` | `#F0B4C8` |
  | 3 | `#C2410C` | `#EA580C` | `#FDBA74` |
  | 4 | `#2563EB` | `#3B82F6` | `#A9C1F5` |
  | Neutral | token `#141414`, held-hex outline `#1F1F1F` | `#9CA3AF` | symbols and ring `#D9D9D9` |

- **D4. Unit names.** The human's units use ordinals ("1st Infantry"). Every AI seat uses Roman numerals ("XI Armored"). Nouns stay Infantry, Armored, Fleet, Squadron. When a match has three or more seats, a unit shown to anyone other than its owner carries its side's short name: "W. Turkey · XI Armored". Neutral units read "Neutral · II Infantry".
- **D5. Commanders.** Each AI seat has a model, a reasoning effort (only when the model supports it), and a doctrine: Aggressive, Balanced, Cautious, or Random. Random draws one of the three at game start; the draw stays hidden until game over, where it shows as "Random, drew Balanced". A commander popover has a "Use for every opponent" button that copies its three settings to every AI seat.
- **D6. Tool groups** (the Opponent tab's groups today) apply to every commander alike.

### Play

- **D7. Planning.** All seats plan at the same time. The turn resolves when the human presses Ready (or, in Observe mode, when auto-advance or the human starts the next turn) and every commander is ready or has timed out. A commander that does not reply within the consultation wall clock (`AI_CONSULTATION_WALL_CLOCK_MS`, 5:00 today) runs its standing orders that turn, and its card says "Timed out". A commander with no model runs standing orders only.
- **D8. Melee with three or more sides in one hex.** Every unit rolls once, as today: the side first in the turn's shuffled order rolls attack values and every other side rolls defense values. Each side then assigns its hits one at a time. For each hit, pick one enemy side at random, weighted by how many of its units in the hex are not yet marked as casualties this round. Within that side, the usual casualty order applies (lowest printed defense, then casualty priority). Hits beyond the last living enemy unit are lost. If exactly one side is left, it takes the hex; otherwise the hex stays contested and the fight continues next turn. Two-sided melee does not change.
- **D9. Tactical battles** belong to the human only, in a hex where exactly two parties are present: the human and one AI seat, or the human and Neutral. Every other contested hex resolves on the world map, including AI against AI and any hex with three or more parties. Observe mode has no tactical battles.
- **D10. Messages.** Each commander writes one message per consultation, as today. Whoever is watching sees every message and can filter Reports by sender. Commanders never read each other's messages.

### Knockout and Neutral

- **D11. Neutral garrisons defend in place.** A neutral unit carries a `defend` standing order on the hex it stands on. It does not move, except a loaded ship ([D15](#knockout-and-neutral)). Each turn it fires at the nearest unit of any seat in range: armor and naval with ranged fire, air with air strikes from its base airport within its strike radius. Infantry has no world-map range, so neutral infantry fights only in melee there; in a tactical battle every neutral sub-unit fires through the tempo sweep. The standing-order generator already picks that nearest other owner (`u.player !== playerId`). Use it. Do not add a second targeting rule.
- **D12. A seat is knocked out at the end of a turn** when any of these holds. Record every reason that holds, in this order:
  - (a) `home_control`: one other seat meets the existing home-control rule against it. On a regional map that seat controls hexes holding at least 75% of this seat's home city cells (the map's `controlWinMinUrbanShare`); on the global map it controls every hex of this seat's home. This is `computeHomeControlProgress(...).controlWinMet`, unchanged.
  - (b) `no_city_hexes`: the seat controls no city hex anywhere.
  - (c) `home_cities_destroyed`: the seat's home has no intact urban cells left (today's urban-elimination rule).

  These rules apply to every match, including a two-sided one. All knockouts of one turn are decided together, from the same end-of-turn state. If applying them would leave no active seat, none of them happens that turn (today's "mutual" rule). Every active seat qualified: every active AI seat, and the human seat when the match has one. An Observe match has no human seat, so the same case is every active AI seat. The spared seats stay active. On both map types the match ends immediately and those seats are ranked by city hexes ([D19](#victory)). When that turn is also the global turn limit, the end reason is `turn_limit`. Otherwise it is `mutual_elimination`. If the human does not qualify, the AI knockouts still apply, and one seat left is still last side standing.
  `outBy` is one seat even when several reasons are recorded. When (a) holds, it is the first other active seat in seat order that met the control rule. Otherwise it is the active seat, other than the victim, that controls the most of the victim's home city cells. Ties go to the lower seat order. When that largest count is 0, `outBy` is null.
- **D13. What a knockout does.**
  - Every hex the seat controls becomes Neutral. Build queues and build progress on those hexes are cleared, as on any change of control. Only another seat can start a queue there again, after capturing the hex.
  - Every unit the seat owns becomes a neutral garrison ([D11](#knockout-and-neutral)).
  - The seat's standing orders, callbacks, pending AI orders, memory, and fog records are deleted.
  - The seat's commander stops for good. Its card shows "Out, turn N".
- **D14. Neutral never builds.** Neutral land has no queue, and a city that neutral troops capture builds nothing.
- **D15. Loaded ships, and neutral land capture.**
  - A neutral ship that carries troops sails for the nearest hex (by sailing turns) where troops can go ashore and that has no unit of any seat on it.
  - If no such hex can be reached, it sails for the nearest hex where troops can go ashore even though a seat's units hold it, and the troops land and attack.
  - On arrival the troops go ashore. The ship and the troops then defend in place. The landing hex follows the capture rule below.
  - A ship already on a hex where troops can go ashore unloads at once.
  - A ship with no water route to any such hex is deleted together with its troops.
  - A neutral ship with no troops defends in place.
  - Neutral infantry and armor take every empty hex they enter, including a hex they only pass through. A neutral ship does not take hexes by sailing. Seat traversal is unchanged: `CONTROL_UNIT_TYPES` is still infantry, armor, and naval, and a two-sided match with no neutral land movement keeps today's empty-hex results. At the end of the turn:
    - A hex with exactly one owner present takes that owner. Neutral counts. Two or more owners leave the controller as it is.
    - An empty hex that neutral infantry or armor entered becomes Neutral, even when a seat also moved through it, and even when the hex was never owned.
    - An empty hex Neutral did not enter flips only when exactly one seat moved through it.
- **D16. Labels.** "Neutral" means a known hex not owned by any seat, with or without a garrison. "Unknown" means out of view.
- **D17. Human knocked out.** A dialog shows the human's place and offers "Watch the rest" (switch to Observe mode with View as and auto-advance) or "End game" (go to the standings).

### Victory

- **D18. Win rules.**
  - Regional: last side standing.
  - Global: most city hexes held at the end of the turn limit. A global match also ends early when one side is left. This applies to every global match, including two-sided ones.
  - Both maps: when every active seat would be knocked out on the same turn, cancel those knockouts and end the match. Rank the seats that were still active by city hexes. On the global turn-limit turn the end reason stays `turn_limit`. On any other turn it is `mutual_elimination`.
- **D19. Places.** The last side standing is 1st. Seats knocked out in the same turn share a place, equal to the number of seats still active after that turn plus one. At the turn limit, and when a mutual wipe ends the match, active seats are ranked by city hexes held (ties share a place) above every seat already knocked out. When several seats share first, the result line names every one of them in seat order. When the human ends the game early from the knockout dialog, the remaining active seats are ranked by city hexes held at that moment.

### Observe mode

- **D20. View as.** A dropdown in the top bar: "All sides, no fog", then one entry per seat. Choosing a seat shows the map through that seat's fog (when fog of war is on). A checkbox in the footer, "Start the next turn when every commander is ready", turns on auto-advance.

---

## Engineering decisions (frozen unless the owner overrides)

These were made while planning, to make the work reliable. The owner reviews them with this plan; after that, treat them like owner decisions.

- **E1. Seat ids.** The human seat keeps `'human'`. AI seats are `'opponent'`, `'opponent2'`, `'opponent3'`, `'opponent4'`, numbered in AI order (the first AI seat in seat order is `'opponent'`). In Observe mode the four ids are `'opponent'` through `'opponent4'`. The Neutral owner is `'neutral'`. Why: a two-sided match keeps exactly today's database values, so the roughly 450 test fixtures that use `'human'` and `'opponent'` stay valid, and every refactoring phase can be checked by the existing suite.
- **E2. One roster.** A new `seats` table is the single source of truth for who plays, their homes, their commanders, and how they finished. The two `game_config` keys `scenario_region_human` and `scenario_region_ai` go away.
- **E3. Unit id prefixes.** `h1` for the human seat; `a1` to `a4` for AI seats by AI index (`'opponent'` is `a1`, `'opponent2'` is `a2`). A unit keeps its id when it turns neutral. Neutral never creates units.
- **E4. Neutral land uses the controller value `'neutral'`.** Land nobody ever owned keeps `NULL`. Both read "Neutral" in the interface. Neutral land draws the black held-hex outline; never-owned land draws as it does today.
- **E5. Neutral targeting has no fog.** Neutral orders are generated from the omniscient snapshot.
- **E6. Strategy text.** Today the human sees the AI's strategy next to its message. With several commanders that leaks plans. With a human seat, Reports show messages only. In Observe mode, each message entry also shows that commander's strategy.
- **E7. Commander status lives in the main process.** Main keeps one status per AI seat (planning, ready, timed out, no model, out) and the renderer polls it. The renderer no longer infers status from its own request state.
- **E8. Each AI seat's precomputed plan carries all of its orders**, including air strikes and ferries. Today the precomputed path drops both (see [Known pre-existing problems](#known-pre-existing-problems-this-work-touches)).
- **E9. Knockout attribution.** [D12](#knockout-and-neutral) stores every matching reason and one `outBy`. When `home_control` is among the reasons, `outBy` is the first other active seat in seat order that met the control rule. Otherwise `outBy` is the active seat that controls the most of the victim's home city cells; ties go to the lower seat order; `outBy` is null when that count is 0.
- **E10. Balanced is today's opponent.** Balanced adds nothing to the prompt: today's shared strategy block already is the balanced doctrine, so a Balanced commander plays exactly as the current opponent does. Aggressive and Cautious each add a block after it. A seat whose commander was never given a doctrine uses Balanced, and new-game rows start with Balanced. Why: the project has fought passive AI play before; the default must not change how today's opponent behaves.
- **E11. Turn limit options** on the Global tab: 20, 30, 40, 50 turns; default 30.
- **E12. Commanders consult concurrently**, one request per AI seat, all at once.
- **E13. Game-over result line.** The mockup's "It took Baghdad on turn 23." needs a city name the engine does not track. Use "It knocked out {Side} on turn {N}." instead (see the interface stage).
- **E14. Short side names.** A pure function makes them: cut the display name at the first " & ", ", ", or " and "; then shorten a leading compass word ("Northern", "North" → "N.", and the same for South, East, West, and "Central" → "C."). "Western Turkey" → "W. Turkey", "Eastern Turkey & Caucasus" → "E. Turkey", "Levant & Cyprus" → "Levant", "Southern Asia" → "S. Asia".

---

## Architecture

### Seat roster

`src/shared/seatIds.ts` (new) owns the id strings and the predicates (`isAiSeatId`, `isHumanSeatId`, `isNeutralOwnerId`, `aiSeatIdForIndex`, `aiIndexForSeatId`). `src/shared/seatRoster.ts` (new) owns the roster types and pure helpers (ordering, active seats, enemies of a seat, short names). The main process stores the roster in the new `seats` table and puts a read-only copy in every `GameStateSnapshot` as `seats`. Nothing else stores who plays.

```text
seats (one row per seat)
  seat_id          'human' | 'opponent' | 'opponent2' | ...
  seat_order       1..4 (color and list order)
  kind             'human' | 'ai'
  home_region      regional: the side group's display name (what resolveSideGroupHomeNames stores today). Global: the UN subregion name. Short names are computed with shortSideName; they are not stored.
  model_id, reasoning_effort, doctrine_choice, doctrine     (AI seats only)
  out_turn, out_by, out_reasons, place                     (filled at knockout / game end; out_reasons is a JSON array)
  consultation_count, cost_usd                              (AI seats only)
```

### Turn flow with seats

```text
planning ── each AI seat consults concurrently ──► per-seat plan (or standing orders, or timeout)
   │
Ready (human, or auto-advance in Observe mode)
   │
   ▼
orders by owner: human pending orders + one set per active AI seat + one Neutral set
   │
executeReadyStrategicTurn: embark → air → ranged → movement → cargo sync → ferry → melee
   │
finalize: control → production → end-of-turn outcome (knockouts, winner, places)
          → knockout consequences (land and units to Neutral) → fog per active seat
```

### What changes where

| Area | Today | After |
| --- | --- | --- |
| Who plays | Two string ids, two `game_config` keys | `seats` table; `GameStateSnapshot.seats` |
| Homes | `humanHomeRegionHexes`, `aiHomeRegionHexes` | `homeRegionHexesBySeat` |
| Fog | `FOG_PLAYERS = ['human', 'opponent']` | One pass per active seat |
| Control | Traversal recorded for two players | Traversal recorded per seat; Neutral infantry and armor also capture hexes they enter ([D15](#knockout-and-neutral)) |
| Production | Two cap arrays | Caps per seat; Neutral skipped |
| Turn orders | One AI order set | One set per owner |
| Melee | Two sides; three or more in cyclic pairs | Two sides unchanged; three or more by [D8](#play) |
| Winner | `evaluateRegionControlWinnerAtEndOfTurn` returns one of two | End-of-turn outcome: knockouts, places, winner |
| AI consult | One controller, one status, one model | One per AI seat |
| Prompt | "the human", "the enemy home" | Every other seat and Neutral, by name |
| Interface | Two chips, two colors, Opponent tab | Up to four chips and colors, Commanders tab, standings, Observe mode |

---

## Stages

Work the stages in order. Each stage document starts with its own goal, its phase list, and its exit check. A stage is done when its last phase passes and the human confirms.

| Stage | Document | What it delivers | How it is verified |
| --- | --- | --- | --- |
| 1 | [multi-commander-1-seats-execution-plan.md](multi-commander-1-seats-execution-plan.md) | The seat model. The engine can create and resolve a 3- or 4-seat match in tests. Two-sided results stay as they are through this stage. | `npm test`; new multi-seat tests; one manual two-sided game |
| 2 | [multi-commander-2-engine-execution-plan.md](multi-commander-2-engine-execution-plan.md) | Three-sided melee, knockout, Neutral, win rules, standings, tactical parties. | `npm test`; new scenario tests that run several turns with no model |
| 3 | [multi-commander-3-commanders-execution-plan.md](multi-commander-3-commanders-execution-plan.md) | One AI commander per seat: settings, prompts for many enemies, doctrine, concurrent consults, per-seat status and cost. | `npm test`; prompt tests; flow tests with a fake model; one manual two-sided game with "No model" |
| 4 | [multi-commander-4-interface-execution-plan.md](multi-commander-4-interface-execution-plan.md) | Every screen in the mockups. | `npm test`; `npm run build:renderer`; UI smoke; manual checks against the expected images |
| 5 | [multi-commander-5-finish-execution-plan.md](multi-commander-5-finish-execution-plan.md) | Removal of the last two-player leftovers, the documentation sweep, and the owner's paid test game. | `npm test`; grep audits; the owner's play test |

Stages 1 to 3 change no screen except where a phase says so. Until the new-game screen arrives in stage 4, the app still starts two-sided matches, and those must keep working at the end of every phase.

---

## Expected images

All images are in this folder. Map backgrounds are composites of real screenshots; ignore map art details. Use the images for layout, wording, colors, and states.

| Image | Shows |
| --- | --- |
| `multi-commander-4-expected-new-game.png` | New game, regional, four sides, with the Opponent 1 commander popover open |
| `multi-commander-4-expected-new-game-global.png` | Global tab, three sides, region list open with taken regions disabled, turn limit |
| `multi-commander-4-expected-new-game-observe.png` | Observe only ticked: four AI sides |
| `multi-commander-4-expected-commanders-tab.png` | Turn 3, Commanders tab, two commanders still planning, stack callout with an enemy side |
| `multi-commander-4-expected-commander-states.png` | Commander card states: Planning, Ready, No model, Timed out, Out |
| `multi-commander-4-expected-reports-knockout.png` | Turn 9, Reports after a side was knocked out, a neutral hex tooltip, Notice and Messages toasts |
| `multi-commander-4-expected-battles-list.png` | Tactical battles list with three eligible battles and two world-map hexes |
| `multi-commander-4-expected-battle-header.png` | Battle header against one of several opponents |
| `multi-commander-4-expected-battle-header-neutral.png` | Battle header against a neutral garrison |
| `multi-commander-4-expected-seat-colors.png` | Seat colors, Neutral, and unit names |
| `multi-commander-4-expected-top-bar-turn-limit.png` | Top bar in a global turn-limit match, with the Cities tooltip |
| `multi-commander-4-expected-observer.png` | Observe mode with the View as dropdown open |
| `multi-commander-4-expected-game-over.png` | Game over standings |

Known differences between the images and this plan (the plan wins):

- Game over: the result line reads "It knocked out {Side} on turn {N}." ([E13](#engineering-decisions-frozen-unless-the-owner-overrides)).
- The rail tab is labeled "Command" and its panel is titled "Commanders". The images agree; today's tab is "Opponent".
- The images show cost and model names from invented data. Use real values.

---

## Documentation map

Each phase names the documents it updates. This table is the overview, so nothing is missed.

| Document | Changes in stage |
| --- | --- |
| `doc/combat-rules-v3.md` | 2 (three-sided melee, knockout, Neutral, win rules), 5 (sweep) |
| `doc/hybrid-ai.md` | 3 (per-seat consults, status, timeouts, cost) |
| `doc/ai-commander-prompts/*` | 3 (prompt wording, doctrine) |
| `doc/how-to-play.md` | 4, 5 |
| `doc/ux-specification.md` and `doc/ux/*.md` | 4 (each surface), 5 (sweep) |
| `doc/ui-style-guide.md` | 4 (seat palette, Neutral) |
| `doc/README.md` | 1 (engine constants: seat limits), 2 (win rule symbols), 5 (index sweep) |
| `doc/naming-conventions-contract-v1.md` | 1, only if a new naming pattern is introduced |

---

## Known pre-existing problems this work touches

Fix only the ones a phase names. Report any other you find; do not fix it.

1. **Precomputed AI plans lose air strikes and ferries.** `buildReadyPayload` in `src/renderer/gameplay/readyHandler.ts` never sends `precomputedAiAirStrikeOrders` or `precomputedAiFerryOrders`, and `applySuccessfulPrecomputedAiResult` in `src/renderer/openRouter/precomputedAiState.ts` never stores them. The `ai_pending_orders.strategy_text` column already holds those extra orders as JSON (`airStrikeOrders`, `ferryOrders`, `embarkOrders`). It does not hold the prose strategy. Stage 3 fixes the drop as part of per-seat plans ([E8](#engineering-decisions-frozen-unless-the-owner-overrides)) and must not write the prose into that column.
2. **`memoryUpdates` in the orders envelope appear never to be applied.** Out of scope. Keep the seat id plumbing correct so a later fix is easy; do not wire it up.
3. **Standing orders and production are written inside `parseOrdersResponse`**, which can run twice per consult (reply and repair). Out of scope. Pass the seat id through; do not restructure.
4. **The 3+-sided melee branch in `runMeleePhase` has never been tested.** Stage 2 replaces it.

---

## Size and risk

This is the largest change the project has attempted. About 130 non-test files under `src` contain the player literals, and the turn flow assumes one AI opponent at every layer. Expect roughly 35 phases.

The main risks and how the plan contains them:

- **Silent behavior change in two-sided play.** Stages 1 and 3 keep two-sided database ids identical ([E1](#engineering-decisions-frozen-unless-the-owner-overrides)), so the existing suite guards orders, combat, and seeding. Stage 2 does change two-sided outcomes on purpose: [D12](#knockout-and-neutral) and the global turn limit apply to two-sided matches, and stage 2's new tests cover those cases. The old winner tests do not. Any phase that must change an existing test says which one and why. If you find yourself editing an existing test the phase did not name, stop and report.
- **Prompt drift.** Prompt wording changes only in stage 3, in named phases, with `doc/ai-commander-prompts/` updated in the same change.
- **Concurrency bugs in consults.** Stage 3 moves commander status to the main process and tests the gather step with a fake model before any interface depends on it.
- **Scope creep.** Everything under [Out of scope](#scope) stays out. If a phase seems to need one of those, stop and report.
