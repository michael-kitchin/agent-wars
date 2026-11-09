# Milestone 0.4 — Combat and Victory: Execution Plan

*Version 1.0 — March 2026*

This document is an execution plan for implementing **Milestone 0.4** from the [Strategic Development Plan](development-plan.md), using the [Combat Execution and Resolution Rules](combat-execution-and-resolution.md). It is written for a coding agent and is organized in phases that are **independently verifiable or verifiable with previously completed phases**. Each phase produces reliable, understandable code suitable for future developers.

---

## Scope Summary

**Deliverable:** Add deterministic combat resolution and a win condition so that a complete WEGO game can be played against the LLM opponent. Combat follows the combat spec (participant IDs, ranged then melee, automatic casualty assignment, single game RNG seed). Both human and AI players declare movement and **ranged attacks** during planning; resolution applies movement, then combat (ranged phase then melee phase), then advances the turn. UI shows combat hexes during resolution and improved stacking visuals.

**In scope:**

1. **Combat resolution engine** — Implement full resolution per [combat-execution-and-resolution.md](combat-execution-and-resolution.md): after movement, assign participant IDs, resolve ranged (from declared attacks only), then melee, remove casualties. One d6 per unit, hit when roll ≤ attack/defense; casualty priority lowest defense first, then infantry → armor → naval.
2. **Ranged attack declarations** — Human (UI) and AI (prompt) must be able to declare ranged attacks (unit + target hex). Only units with range ≥ 1 (armor: 1, naval: 2) can declare; target must be in range and contain an enemy. Declarations are submitted with movement orders and used in the ranged phase.
3. **Win condition** — Eliminate all enemy units (or, optionally, control objective hexes for N turns). Game state exposes winner/game-over; UI reflects it.
4. **Resolution-phase combat indicator** — During the resolution (update) phase, superimpose a **yellow, pulsing, hex-sized lightning bolt** over each hex where combat occurred.
5. **Stacking and unit marker visuals:**
   - When more than one unit is on a hex (combat or not): **layer a second unit icon** on top of and slightly offset from the first to signify stacking; add a **small total unit count** in the **lower-right corner of the hex** (black font, small but readable, with a light border to distinguish from background).
   - When units in a stack are **mixed type**: the symbol at the **center of the unit marker** is an **asterisk** (*), same size as current unit labels.
   - When units from **multiple players** are in a stack: stack icons are **filled light grey with a black border**.

**Technical constraints:**

- **Prerequisite:** Milestone 0.3 is complete (Electron, TypeScript, map, terrain, units, WEGO, LLM opponent, **sql.js** game state). Do not switch to better-sqlite3; reuse existing IPC, preload, and renderer patterns.
- **Combat spec:** Follow [combat-execution-and-resolution.md](combat-execution-and-resolution.md) for attack/defense values, range, participant IDs, ranged-then-melee order, casualty priority, and RNG (single seed per game).
- **No player interaction during resolution:** All combat decisions (who attacks whom in melee, casualty assignment) are engine-defined; no prompts or confirmations mid-resolution.

**Out of scope for 0.4:** Terrain modifiers to combat, multi-round melee, fog of war, save/load, multiple maps. Win condition is “eliminate all enemy units” (objective hexes optional and can be deferred).

**Code quality goals:** Reliable and understandable code; simple, explicit logic; consistent naming; each phase independently verifiable where possible. Follow project rules (logging, comments, nullability, tests only for essential contracts).

---

## Compliance with project rules

Implementing agents must follow the project's coding rules. "Backend" means the **Electron main process**; "renderer" is the frontend.

- **Comments:** All new and updated **public, non-overriding** methods must have an **orienting comment** (why, when to use, how to use, results and exceptions).
- **Logging:** Use the **existing logging API**. **Debug** for public method invocations, **error** for caught exceptions, **trace** for getter-style methods. Do not check log level before calling unless building large strings inline.
- **Testing:** Test only **happy paths and essential failure cases**; **code contracts**, not implementation details. No tests for trivial delegation or DTOs.
- **Nullability:** Use TypeScript strict null checks; document optional/nullable where the type alone is insufficient.

Apply the [UI Style Guide](ui-style-guide.md) for UI changes. No copyright requirement on spec docs or generated code for this milestone.

---

## Prerequisites (Before Phase 1)

- **Milestone 0.3:** Implemented and runnable: map, terrain, units, WEGO, LLM opponent, OpenRouter, game state in sql.js. App runs with `npm run build` and `npm start`.
- **Combat spec:** Read [combat-execution-and-resolution.md](combat-execution-and-resolution.md) (unit roster §2, resolution procedure §4, detailed flow §5, edge cases §6).

No code in Prerequisites; verification is that 0.3 runs and the implementer has read the combat spec.

---

## Phase 1: Game RNG seed and combat constants (main process)

**Goal:** Introduce a single RNG seed for the entire game (for deterministic replay) and define combat constants (attack, defense, range by unit type) in one place. No combat logic yet; no schema change required if the seed can be stored in existing turn_state or a new key-value table.

**Tasks:**

1. **Seed storage:** Add a way to store and read the **game seed** (e.g. integer or string). Options: (a) add a `game_seed` column or row to `turn_state`, or (b) add a small `game_config` table with key-value (e.g. `game_seed`). On first game init (no seed present), generate a random seed (e.g. `Math.floor(Math.random() * 2**31)`) and persist it. Expose a getter (e.g. `getGameSeed(): number`) and ensure the same seed is used for the whole game. Document where the seed is stored.
2. **Seeded RNG:** Add a simple **seeded random number generator** (e.g. mulberry32 or similar) that takes the game seed and returns a function `next(): number` in [0, 1). Use this for all combat dice and participant ID assignment so replay with the same seed and same orders yields the same outcome. Do not use `Math.random()` for combat or participant IDs.
3. **Combat constants:** Define in one module (e.g. `combatConstants.ts` or inside a combat module) the **attack**, **defense**, and **range** by unit type per the combat spec: infantry 1/2/0, armor 3/2/1, naval 2/2/2. Export a small API (e.g. `getAttack(unitType)`, `getDefense(unitType)`, `getRange(unitType)`) or a single map. Reference this from the combat resolution logic in a later phase.
4. **Casualty priority:** Document or implement the **unit type order for tie-break**: infantry → armor → naval (same as spec). Can be an ordered list or enum order used when choosing which unit to remove.

**Verification:**

- Run the app; start a new game. Inspect DB or call getter: game seed exists and is stable. A script or unit test that calls the seeded RNG with a fixed seed produces a deterministic sequence. Combat constants match the spec table.

**Exit condition:** Game has a single persistent seed; seeded RNG and combat constants are in place and referenced from a single source of truth.

---

## Phase 2: Schema and orders for ranged attacks (main process)

**Goal:** Extend the data model so that both movement orders and **ranged attack** orders can be stored for the planning phase. Ranged order = (unitId, targetH3Index). Validate that the unit has range ≥ 1, target is within range (H3 grid distance), and target hex contains at least one enemy unit.

**Tasks:**

1. **Schema:** Add a table or extend existing tables to store **pending ranged attacks**. Option A: new table `pending_ranged_orders` with `unit_id` and `target_h3_index` (one row per unit that declares a ranged attack). Option B: add columns to `pending_orders` if you prefer a single orders table (e.g. `target_h3_index` nullable; non-null means ranged attack to that hex). Choose one and document. Clear ranged orders when resolution runs (same as movement orders).
2. **Types:** Extend the orders API so that **submitted orders** can include both movement and ranged: e.g. `MovementOrder[]` and `RangedAttackOrder[]` where `RangedAttackOrder = { unitId: string, targetH3Index: string }`. Or a single structure with optional `targetH3Index` for movement orders. Keep backward compatibility: if no ranged orders are sent, behavior is as today (movement only).
3. **Validation:** Implement **validateRangedAttack(unitId, targetH3Index, options?: { allowedPlayer?: string })**: unit exists and belongs to `allowedPlayer` (for human orders use `'human'`, for AI use `'opponent'`), unit has `getRange(unitType) >= 1`, target hex is on map, H3 grid distance from unit’s current hex to target ≤ unit’s range, and target hex contains at least one unit owned by a different player. Return success or a reason string. Reuse terrain/domain rules from the combat spec (e.g. naval can target land within range; armor can target water within 1). No need to validate “friendly fire”; spec says enemy-occupied hex.
4. **Storage:** When `submitOrders` is extended (Phase 4), accept optional ranged orders; validate each; store in `pending_ranged_orders` (or equivalent). **Human orders:** reject the entire batch (movement + ranged) if any order is invalid, so the player can fix and resubmit. **AI orders** (submitted via ready() in Phase 6): drop invalid ranged (and invalid movement) but retain and execute valid ones. One ranged declaration per unit per turn (at most one target per unit).

**Verification:**

- From main process or a test: insert units, call validation for a valid ranged attack (e.g. armor vs adjacent enemy hex) and an invalid one (out of range, or infantry). DB or in-memory store can persist ranged orders and clear them on resolution.

**Exit condition:** Schema and validation for ranged attacks are in place; no UI or combat resolution yet.

---

## Phase 3: Combat resolution engine (main process)

**Goal:** Implement the full combat resolution sequence per the combat spec. Run it **after** applying movement in `ready()`. Use only **declared** ranged attacks (from pending_ranged_orders) for the ranged phase; melee is implicit (all same-hex multi-side hexes). Participant IDs, dice, and casualty assignment are all engine-driven.

**Tasks:**

1. **Entry point:** From `ready()`, after applying all movement orders (updating unit positions), call a new function e.g. `runCombatResolution()`. Pass the current game state (units, hexes, map) and the list of **declared ranged attacks** (unitId, targetH3Index) for human and AI. Do not read phase or orders from DB inside combat; receive all inputs as arguments. Return a result object: `{ combatHexes: string[], removedUnitIds: string[] }` (hexes where combat occurred, and units that were eliminated). Apply removals by deleting those units from the DB (or marking dead, per your schema choice).
2. **Participant IDs:** At the start of combat resolution, collect all distinct **player** (side) IDs that have at least one unit in any combat. Combat is defined as: (a) any hex that will be a ranged target, (b) any hex that after movement has units from two or more sides. Assign each such side a unique random integer using the seeded RNG (e.g. draw without replacement from a shuffled list of integers, or assign random ints and re-map to unique ids). Use these IDs for the rest of the resolution (melee attacker/defender order, round-robin when 3+ sides).
3. **Ranged phase:** Build ranged engagements from **declared** ranged attacks only. Group by defender hex (target). For each defender hex D (process in deterministic order, e.g. H3 index ascending): collect all (attacker hex, unit ids) that declared an attack on D. Attacker hex = current position of each attacking unit. For each such engagement: (a) all attacking units roll once (d6, hit if roll ≤ attack); (b) all units in D roll once (d6, hit if roll ≤ defense); (c) assign attacker hits to D using casualty priority (lowest defense first, then infantry→armor→naval); remove those units from the game state for this resolution; (d) assign defender hits to attacker hexes (one at a time to the hex with most units remaining, ties: lowest H3 index); apply casualty priority within each hex; remove units. After each engagement, update the in-memory unit list so later engagements see updated counts.
4. **Melee phase:** Build list of hexes that still have units from two or more sides (after ranged). Process hexes in deterministic order (e.g. H3 index ascending). For each hex: order sides by participant ID. If two sides: lower ID is attacker, other defender; one round of attack vs defense rolls; assign hits by casualty priority; remove casualties. If three or more sides: round-robin sub-engagements (side k attacks side (k+1) mod N in ID order); process in order, each sub-engagement one round, assign hits to defender, remove casualties.
5. **Dice:** One d6 per unit per roll. Use seeded RNG: `Math.floor(seedNext() * 6) + 1`. Hit when `roll <= attackValue` (when attacking) or `roll <= defenseValue` (when defending).
6. **Removals:** After both phases, delete (or mark removed) all units that were chosen as casualties. Persist to DB. Return `combatHexes` (all hexes that had either a ranged engagement or a melee engagement) and `removedUnitIds` for the renderer.
7. **Integration with ready():** After applying movement, load human and AI ranged orders from DB (or from arguments if AI ranged is passed in). Call `runCombatResolution(...)`. Apply unit removals. Clear `pending_orders` and `pending_ranged_orders`. Then increment turn and set phase back to planning. Return (or attach to result) `combatHexes` so the renderer can show the lightning bolt during resolution animation.

**Verification:**

- Unit tests or a small script: set up a state with two units in the same hex (different sides), run combat resolution, assert one or both can be removed and combatHexes includes that hex. Set up ranged (armor vs adjacent enemy hex), run resolution, assert ranged phase runs and casualties are applied. Same seed + same setup yields same outcome.

**Exit condition:** Combat resolution runs after movement; ranged (from declarations) and melee are implemented per spec; casualties are removed; combat hexes and removed units are returned.

---

## Phase 4: IPC and ready() contract for combat and ranged (main + preload)

**Goal:** Extend IPC so the renderer can submit ranged attacks with movement orders and receive combat hexes for the resolution animation. AI ranged orders are requested from the LLM and passed into ready().

**Tasks:**

1. **submitOrders:** Extend the handler to accept an optional second argument or an extended payload: e.g. `submitOrders({ movementOrders: MovementOrder[], rangedAttacks?: RangedAttackOrder[] })` or `submitOrders(movementOrders, rangedAttacks)`. Validate movement and ranged (Phase 2). **If any human order (movement or ranged) is invalid, reject the entire batch** with a clear reason so the player can fix and resubmit. Do not store partial orders on validation failure.
2. **ready():** Continue to request AI movement orders from OpenRouter. In a later phase (Phase 6) AI will also return ranged attacks; for this phase, AI ranged can be empty. After applying movement, load human and AI ranged from storage (and in Phase 6 from AI response). Run combat (Phase 3). Return a result that includes at least: `success`, `reason?`, and for the renderer: `combatHexes?: string[]` (H3 indices where combat occurred this resolution), and optionally `removedUnitIds?: string[]`. Preserve existing fields (`aiMoves`, `aiOrderCount`, etc.) so the resolution animation still works.
3. **Preload:** Update the type or signature for `ready()` so the renderer can depend on `combatHexes` in the resolved value. Expose any new types (e.g. `RangedAttackOrder`) if the renderer needs to submit them.
4. **getGameState:** Optionally include a **last resolution result** (e.g. `lastCombatHexes: string[]`) so that if the renderer refreshes state during the resolution animation it can still draw the lightning bolt. Alternatively, the renderer keeps the result of `ready()` in local state for the duration of the animation; document the chosen approach.

**Verification:**

- From renderer (or test), call submitOrders with movement + ranged; call ready(); response includes combatHexes when combat occurred. No regression to existing movement-only flow.

**Exit condition:** IPC and ready() support ranged submission and return combat hexes; preload types are updated.

---

## Phase 5: Human UI — declare ranged attacks (renderer)

**Goal:** In the planning phase, the human player can declare a ranged attack for a unit with range ≥ 1: choose a target hex (enemy-occupied, within range). The declaration is shown in the UI and submitted with movement orders.

**Tasks:**

1. **Eligibility:** When the selected unit has range ≥ 1 (armor or naval), show an option to **declare a ranged attack** (e.g. a “Ranged attack” button or mode). Entering “ranged mode” lets the user click a **target hex**; validate in the renderer (or via a main-process validator) that the target is in range and has an enemy. If the user clicks an invalid hex, show feedback (e.g. toast or sidebar message). One ranged target per unit per turn; declaring a new target replaces the previous for that unit.
2. **Display:** Show the ranged declaration in the UI (e.g. a different line or icon from the movement arrow: from unit to target hex, or a small “target” badge on the target hex). Differentiate from movement so the player sees both “move to X” and “ranged attack at Y” when both are set.
3. **Submit:** When the user clicks Ready, include the list of ranged attacks (unitId, targetH3Index) in the payload to submitOrders. If the server rejects (e.g. invalid ranged), show the error and do not call ready().
4. **Clear:** When orders are cleared or after resolution, clear ranged declarations from local state. After resolution, refresh game state so unit positions and surviving units are correct.

**Verification:**

- Select an armor or naval unit; declare a ranged attack on an enemy hex in range; see it in the UI; submit with Ready; after resolution, combat runs and (if applicable) casualties appear. Declaring ranged on an out-of-range or friendly hex is rejected or prevented.

**Exit condition:** Human can declare and submit ranged attacks; UI and submit path are correct.

---

## Phase 6: AI prompt and response for ranged attacks (main process)

**Goal:** The LLM is prompted to return both movement orders and optional ranged attacks. Invalid ranged attacks are dropped (with optional logging). AI orders are merged with human orders and used in resolution.

**Tasks:**

1. **Prompt:** Extend `buildSystemPrompt` (or equivalent) to describe **ranged attacks**: which units have range (armor: 1, naval: 2), that they may optionally declare a target hex (enemy, within range), and the JSON shape for ranged (e.g. `rangedAttacks: [{ "unitId": "...", "targetH3Index": "..." }]`). Include in the prompt the list of valid ranged targets per unit (enemy-occupied hexes within range), analogous to “can move to” for movement.
2. **Response parsing:** Extend the parser to read **ranged attacks** from the LLM response (in addition to movement orders). Validate each ranged attack (unit exists, opponent-owned, target in range, target has enemy). Drop invalid entries; log drop reasons at debug. Do not reject the whole response; apply valid movement and valid ranged.
3. **ready() integration:** When requesting AI orders, pass the returned ranged attacks into the combat resolution (e.g. merge with human pending_ranged_orders when calling runCombatResolution). Store or pass AI ranged in the same way human ranged is stored so the combat engine sees both.

**Verification:**

- With a model that can follow instructions, run a turn where the AI has an armor or naval unit and an enemy in range; AI response includes rangedAttacks; after resolution, combat is applied. Invalid ranged (wrong hex, wrong unit) are dropped and resolution still succeeds.

**Exit condition:** AI can declare ranged attacks via prompt; invalid ones are dropped; combat uses both human and AI ranged declarations.

---

## Phase 7: Win condition and New game (main process + UI)

**Goal:** Detect when one side has eliminated all enemy units (or when objective hexes are held for N turns, if implemented). Expose game-over state and show winner in the UI. Provide a New game (or Reset) action that re-initializes the game so the player can play again.

**Tasks:**

1. **Check:** After combat resolution (and unit removals), check whether any side has **zero units** remaining. If so, the other side(s) win. If you support only two sides for 0.4, “eliminate all enemy units” = the side with units left wins. Store or return the winner (e.g. `gameOver: true`, `winner: 'human' | 'opponent' | null`). Add `game_over` and `winner` (or equivalent) to turn_state or a small table so getGameState can return it.
2. **getGameState:** Include `gameOver?: boolean` and `winner?: string` (or similar) in the snapshot so the renderer can show “You win” / “You lose” or “Game over”.
3. **UI:** When game is over, show a clear message (e.g. overlay or sidebar), disable Ready and order submission, and show a "New game" (or "Reset") button or control.
4. **New game / Reset:** Implement a reset path (e.g. IPC handler `newGame()` or `resetGame()`): re-initialize units (re-run the same seed logic used at first launch: clear units table, re-seed 3–5 units per side on valid hexes), clear `game_over` and `winner`, reset turn number and phase to planning, clear pending orders and pending ranged orders. Optionally generate a new game seed for the new game or keep the same seed; document the choice. Expose the action via preload so the renderer can call it when the user clicks "New game".

**Verification:**

- Manually or via script: remove all units of one side; after resolution, getGameState returns gameOver and winner. UI shows the result and a New game control. Click New game; state resets, units are re-placed, game is playable again.

**Exit condition:** Win condition is detected and exposed; UI shows game over and a New game action that resets the game.

---

## Phase 8: Renderer — combat lightning bolt during resolution (renderer)

**Goal:** During the resolution (update) phase, draw a **yellow, pulsing, hex-sized lightning bolt** over each hex where combat occurred. Use the combat hexes returned from ready() and keep them in renderer state. **Duration:** Same as the movement animation (e.g. RESOLUTION_FADE_MS)—lightning bolt is visible for the full resolution fade, then cleared.

**Tasks:**

1. **State:** When ready() resolves, store `combatHexes: string[]` (H3 indices) in renderer state for the resolution animation. Keep it for the same duration as the movement animation (e.g. RESOLUTION_FADE_MS or until the next redraw that clears it). Clear combat hexes when starting a new planning phase or when refreshing state after animation ends.
2. **Asset:** Implement a **hex-sized lightning bolt** shape (e.g. a simple zigzag or stylized bolt) that fits within a hex. Draw it centered on the hex using the same transform as the hex grid (getHexCanvasCenter or equivalent). Color: **yellow** (e.g. `#f0d000` or style-guide accent). **Pulsing:** vary opacity or scale over time (e.g. sine wave or step) so the bolt is clearly visible and “active” during resolution. Use requestAnimationFrame or the same timer as the resolution fade so the pulse is smooth.
3. **Draw order:** Draw the lightning bolt **after** hexes and **after** (or before) unit markers so it is visible; prefer after units so it sits on top and reads as “combat here.” Ensure it does not obscure unit count or stacking info (Phase 9).

**Verification:**

- Trigger a resolution that causes combat (e.g. two units in same hex or ranged attack). During the resolution animation, each combat hex shows a yellow pulsing lightning bolt. After the animation, the bolt is gone.

**Exit condition:** Combat hexes show a yellow pulsing lightning bolt for the duration of the resolution phase.

---

## Phase 9: Renderer — stacking and unit marker visuals (renderer)

**Goal:** When multiple units occupy a hex, show stacking (layered icon, count badge). When types are mixed, use an asterisk in the center. When multiple players share a hex, use light grey fill and black border.

**Tasks:**

1. **Per-hex unit grouping:** When drawing units, group them by `h3Index`. For each hex with at least one unit, compute: (a) total count, (b) whether types are mixed (more than one unit type), (c) whether players are mixed (more than one player).
2. **Stacking (count > 1):** For hexes with more than one unit, draw the **first unit icon** at the hex center (or primary position). Draw a **second unit icon** on top and **slightly offset** (e.g. 6–10 px in x and/or y) so the stack is visually distinct. In the **lower-right corner of the hex** (relative to hex center or hex bounds), draw the **total unit count** as text. Font: **black**, **small but readable** (e.g. 10–12 px), with a **light border** (e.g. 1 px stroke in white or light color) so it stands out from the background. Use the same coordinate transform as the hex so the count stays in the hex corner when panning/zooming.
3. **Mixed type:** When the stack has **mixed unit types** (e.g. infantry and armor), the **center symbol** of the unit marker is an **asterisk (*)** instead of I/A/N. Same font size as current unit labels (e.g. bold 14 px). Single-type stacks keep the usual I, A, or N.
4. **Multi-player stack:** When the stack has units from **multiple players**, draw the stack icons with **light grey fill** and a **black border** (instead of player colors). The count badge and asterisk rule still apply when applicable.
5. **Single unit:** Single unit on a hex is unchanged (player color, unit type letter, no count badge). No offset second icon.
6. **Ghost units:** If resolution animation draws ghost units at previous positions, apply the same stacking rules to ghost hexes (count, mixed type, multi-player) based on the units that were at that hex before the move.

**Verification:**

- Place multiple units on one hex (same player, same type): see two layered icons and count in lower-right. Place mixed types: center shows *. Place units from two players on one hex: icons are light grey with black border. Single unit unchanged.

**Exit condition:** Stacking, count badge, mixed-type asterisk, and multi-player grey styling are implemented and readable.

---

## Phase 10: Polish, logging, and documentation

**Goal:** Consistent logging, orienting comments, and README/verification matrix update for 0.4.

**Tasks:**

1. **Logging:** Add **debug** logs for combat resolution entry, participant ID assignment, each phase (ranged/melee), and unit removals. **Error** logs for any caught exceptions in combat or validation. **Trace** for getters (e.g. getGameSeed, getAttack/getDefense/getRange). Do not log the raw game seed in production if it would allow replay prediction; optional debug-only seed logging is acceptable.
2. **Comments:** Add **orienting comments** for all new/updated public methods (combat engine, validation, renderer drawing helpers). Document the resolution sequence (movement → participant IDs → ranged → melee → removals) and the source of truth (combat spec).
3. **README:** Update the README with: Milestone 0.4 adds combat (ranged + melee), win condition, ranged declaration for human and AI, combat and stacking visuals. How to declare a ranged attack (human). That the game uses a single seed for replay.
4. **Verification matrix:** Add a table at the end of this document (or in README) mapping each phase to a short verification step.
5. **Lint:** Ensure all new and modified files pass the project linter.

**Verification:**

- New developer can read the README and understand combat and ranged. Logs appear at appropriate levels when exercising combat and submission. No regressions in Phases 1–9.

**Exit condition:** Codebase is consistent, documented, and lint-clean; 0.4 scope is complete and verifiable.

---

## Verification matrix

| Phase | Verification |
|-------|--------------|
| 1 | Game seed exists and is stable; seeded RNG is deterministic; combat constants match spec. |
| 2 | Ranged order schema and validation in place; invalid ranged rejected or dropped as designed. |
| 3 | Combat resolution runs after movement; ranged (from declarations) and melee run per spec; casualties removed; combatHexes and removedUnitIds returned. |
| 4 | submitOrders accepts ranged; ready() returns combatHexes; IPC and preload updated. |
| 5 | Human can declare and submit ranged attacks; UI shows declaration and submits with Ready. |
| 6 | AI prompt describes ranged; parser returns rangedAttacks; invalid AI ranged dropped; combat uses AI ranged. |
| 7 | Win condition detected when one side has no units; getGameState exposes gameOver/winner; UI shows result and New game; reset re-initializes units and state. |
| 8 | Yellow pulsing lightning bolt on combat hexes during resolution animation. |
| 9 | Stacking: layered icon + count in lower-right; mixed type = asterisk; multi-player = light grey + black border. |
| 10 | Logging and comments in place; README updated; lint passes; no regression. |

---

## Risk and clarification notes

- **Ranged vs. melee same hex:** A unit in a hex with enemies can both declare a ranged attack on **another** hex and participate in melee in its own hex. The spec says each unit rolls once per phase (ranged phase for its declared target, melee phase if in a contested hex). The engine uses only **declared** ranged targets for the ranged phase; melee is implicit. A unit that does not declare a ranged attack still participates in melee if it ends up in a multi-side hex.
- **AI ranged parsing:** If the LLM returns malformed rangedAttacks (wrong shape, missing fields), drop the whole ranged array or per-entry validate and drop invalid; document the choice. Prefer per-entry so one bad entry does not kill all AI ranged.
- **Lightning bolt asset:** If a bitmap/SVG is used, ensure it scales with hex size and stays visible at min zoom. A procedural (canvas-drawn) bolt is often easier to keep hex-sized.
- **Stacking and combat:** Combat can create or remove stacks (casualties). Draw stacking from the **current** game state after resolution; during the resolution animation, ghost units may show old stacks and new positions show new stacks.
- **Objective hexes:** Win condition in the development plan optionally includes “control a set of objective hexes for N turns.” Phase 7 above focuses on “eliminate all enemy units”; add objective-hex logic in Phase 7 or a follow-up if desired.

---

## Questions for the product owner (optional)

- **Ranged (answered):** Human must fix invalid orders; batch rejected. AI: invalid orders dropped, valid retained.
- **New game (answered):** In scope; Phase 7 includes New game / Reset.
- **Lightning bolt duration (answered):** Same as the movement animation.

If not specified elsewhere, the implementing agent should choose sensible defaults and document them.
