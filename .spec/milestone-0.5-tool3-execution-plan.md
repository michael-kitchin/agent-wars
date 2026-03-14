# Milestone 0.5 — Tool 3 (Combat Outcome Estimation) Execution Plan

**Spec reference:** [mcp-tools-spec.md](./mcp-tools-spec.md) § Tool 3: Combat Outcome Estimation  
**Version:** 1.1  
**Audience:** Coding agent (e.g. Cursor AI) implementing the feature

---

## 0. Compliance with Stated Needs and Workspace Rules

This plan is written so that:

- **Phases are independently verifiable:** Phase 1 (refactor combat resolution to expose single-engagement APIs + Tool 3 scaffold) is testable in isolation; Phase 2 (estimate_combat core) depends only on Phase 1; Phase 3 (dispatcher + OpenRouter) depends on Phase 2; Phase 4 (tests, cleanup, docs) verifies the full implementation.
- **Reliability and clarity:** Design clarifications (§2) fix RNG, return-fire, and parameter semantics; edge cases and error messages are specified so generated code is deterministic and understandable.
- **Future-developer clarity:** Orienting comments, **reuse of combat resolution** (single-engagement subroutines shared with the game) so simulation cannot drift from real combat, and consistent naming are required; Phase 4 calls out spec alignment and code quality.

Alignment with **workspace Code-Generation-Rules**:

| Rule | How the plan addresses it |
|------|---------------------------|
| **1. Reliable, understandable code** | Phase 1 refactors combat resolution to expose single-engagement APIs (one source of truth); Phases 2–4 build the tool and require orienting comments and spec alignment. |
| **2. Logging** | Plan requires: **debug** for public tool/executor entrypoints; **error** for caught exceptions and validation failures; **trace** for getter-style helpers that don't modify state. Use existing logger APIs; no log-level checks unless building large strings inline. |
| **3. Testing** | Plan limits tests to **happy paths and essential failure cases** (unit not found, out of range, no defenders, assumed attackers warning, assessment boundaries). No tests for OpenRouter dispatch, DTOs, or implementation details. |
| **4. Orienting comments** | Every new public, non-overriding method must have an orienting comment (why it exists, when/how to use it, results and exceptions). |
| **5. Spec/docs in .spec** | This plan and the MCP spec live in `.spec` as markdown. |

---

## 1. Scope and Prerequisites

### 1.1 What is being built

- **`estimate_combat(engagementType, attackers, targetHex, defenders?)`** — Predicts the outcome of a single engagement (ranged or melee) via Monte Carlo simulation. Returns attacker/defender summaries, expected hits and losses, win/loss probabilities, an assessment category, and a short deterministic reasoning string.

All inputs/outputs use `[lat, lng]` at the boundary; internally use H3 indices for range checks and reuse combat constants. The tool does **not** simulate a full turn (ranged → movement → melee); it simulates one engagement in isolation.

### 1.2 Prerequisites (must already exist)

- **Tool 1 (Pathfinding)** — For any distance/route needs; not required for core combat math.
- **Tool 2 (Assessment)** — Range-checking semantics align; Tool 3 may reuse `getGridDistance`-style logic (or use `h3-js` `gridDistance` + `combatConstants.getRange` directly to avoid circular deps).
- **Combat constants** — `getAttack`, `getDefense`, `getRange`, `casualtyPriorityIndex` from `combatConstants.ts`.
- **Combat resolution** — Tool 3 **reuses** the same resolution logic as the game. Phase 1 refactors `combatResolution.ts` to expose single-engagement subroutines (one ranged round, one melee round) that accept a `rollD6` callback; Tool 3 calls these with a simulation-only RNG so game RNG is never consumed and combat code cannot drift from simulation.
- **Game state shape** — `state.units` (id, player, unitType, h3Index), `state.hexes` (h3Index, terrain). Map/coords: `resolveToH3(lat, lng)`, `latLngByH3` (or equivalent) for converting target hex and for response positions.

### 1.3 Out of scope for this plan

- Full-turn simulation (ranged then movement then melee).
- Terrain combat modifiers (future extension).
- Fog of war or confidence/lastSeen in combat estimation (spec does not require them for Tool 3).

---

## 2. Design Clarifications (for reliable implementation)

### 2.1 Monte Carlo and RNG

- **Do not use the game’s combat RNG.** The simulation must use a separate source of randomness (e.g. `Math.random()` or a dedicated seeded RNG created per `estimate_combat` call) so that replay determinism of the actual game is never affected.
- **Default trials:** Use **1000** trials per call (`DEFAULT_TRIALS = 1000`). For each trial, pass a simulation-only `rollD6` (e.g. `() => Math.floor(Math.random() * 6) + 1`) into the single-engagement subroutine. No shared state with `createCombatRng` or the game seed.
- **Configurability:** Make N a named constant so it can be tuned or reduced in tests.

### 2.2 Simulation logic: reuse combat resolution (no drift)

- **Reuse, do not duplicate.** To prevent combat code from drifting from simulation code, refactor `combatResolution.ts` to expose **single-engagement** subroutines that both the game and Tool 3 use:
  - **Ranged one round:** Extract (or add) a function that takes attacker units, defender units, defender hex H3, attacker hex list, and a `rollD6: () => number`; runs one round (attacker rolls, return fire when defender in range, assign hits by casualty priority); returns removed attacker IDs and defender IDs (or loss counts). The existing `runRangedPhase` can build per-defender-hex engagements and call this subroutine with the game’s RNG; Tool 3 calls it N times with a simulation-only RNG.
  - **Melee one round:** Extract (or add) a function that takes two sides (attacker list, defender list) and `rollD6`; runs one round (both roll, assign hits by casualty priority); returns removed IDs or loss counts. The existing `runMeleePhase` can call this per contested hex with the game’s RNG; Tool 3 calls it N times with a simulation-only RNG.
- **Contract:** Subroutines must accept a dependency-injected `rollD6` so Tool 3 never touches the game seed. Phase 1 refactors combat resolution to expose these APIs and keeps existing `runRangedPhase`/`runMeleePhase` using them with `createCombatRng`.

### 2.3 Return fire (ranged only)

- **When attackers are specified by unit IDs:** The tool knows each attacker’s position. For each defender with range ≥ 1, compute whether any attacker’s hex is within the defender’s range (H3 grid distance ≤ defender range). Set `canReturnFire` true if at least one defender can return fire, and set `returnFireDetails` to a definitive string, e.g. `"human-armor-1 (armor, range 1) can return fire — attacker is at distance 1, within range"`. The response must not hedge (“can return fire if within range”); it must state the actual outcome. The Monte Carlo trials must use the same return-fire eligibility so probabilities reflect reality.
- **When attackers are `assumed`:** No positions. Set `canReturnFire` to false and include a warning in the response (e.g. in `warnings` or in `returnFireDetails`): `"Using assumed attackers — return fire not evaluated (attacker position unknown)"`. Run simulation with no defender return fire.

### 2.4 Attacker/defender resolution

- **Attackers by `units` (unit IDs):** Look up each ID in `state.units`. If any is missing, return `status: "error"`, `error: "Unit not found: {unitId}"` (first missing ID). Build attacker list with id, player, unitType, h3Index (and position [lat, lng] for response). For ranged, only include units that can reach the target hex: `getRange(unitType) >= gridDistance(unit.h3Index, targetHexH3)`. If some listed units are out of range, exclude them from the simulation and add a note (e.g. `excludedOutOfRange: ["opponent-infantry-1"]` or a short message in the response).
- **Attackers by `assumed`:** Build a virtual attacker list: for each `{ type, count }`, create `count` synthetic units with unique synthetic IDs (e.g. `assumed-attacker-0`, `assumed-attacker-1`), unitType = type, no position (or a placeholder). Use `getAttack(type)` etc. for simulation. In the response, attackerSummary can list “assumed: 2 armor, 1 infantry” style instead of unit IDs.
- **Defenders:** If `defenders` is omitted, auto-detect: all units at `targetHex` that are enemy to the calling player (e.g. `state.units` where `h3Index === targetHexH3` and `player !== state.callingPlayerId` or equivalent; if game state does not expose calling player, use the AI player id, e.g. `'opponent'`, so “enemy” = human units). If no units at target and no `defenders.assumed`, return uncontested: `defenderSummary.totalUnits: 0`, `assessment: "uncontested"`, `reasoning: "No defenders at target hex"`.
- **Defenders by `units` or `assumed`:** Same as attackers: resolve by ID or build virtual list from `assumed`. When specified explicitly, override auto-detection. If `defenders.units` is provided and any ID is missing from state, return `status: "error"`, `error: "Unit not found: {unitId}"` (first missing ID). For simulation, defender units are treated as located at the target hex (for ranged: they defend that hex; for melee: co-located).
- **Virtual (assumed) units:** Build synthetic units with unique synthetic IDs (e.g. `assumed-attacker-0`), unitType from `type`, player from context. For ranged with assumed defenders, assign `h3Index = targetHexH3` so the combat API receives a valid shape. For assumed attackers, use `skipReturnFire: true` (no positions).
- **Attackers: both `units` and `assumed` provided:** Prefer `units` and ignore `assumed`. Same for defenders. Document in code.

### 2.5 Target hex and range validation (ranged)

- Resolve `targetHex` [lat, lng] to H3 via `resolveToH3`. If invalid or off-map, return `status: "error"`, `error: "Invalid hex position"`.
- For ranged engagements with attackers by ID: for each attacker, if `getRange(unitType) < gridDistance(attacker.h3Index, targetHexH3)`, that attacker cannot participate. If **all** attackers are out of range, return `status: "error"`, `error: "Attacker {unitId} (range {range}) cannot reach target hex at distance {dist}"` (pick one such unit for the message). If at least one is in range, proceed with only in-range attackers and note excluded ones.

### 2.6 Melee: attacker not at target hex

- Spec: “Melee engagement type but attacker is not at the target hex: this is valid — the AI is asking what if my unit ends up in that hex?” So for melee, do **not** require attackers to be at the target hex. Resolve attacker list (by ID or assumed); resolve defender list (at target hex or assumed). Simulate one round of melee as if all were in the same hex. No position check for melee attackers.

### 2.7 Assessment categories

- Use the spec thresholds exactly:
  - `strongly_favorable`: P(defender eliminated) > 0.75 AND P(attacker loses unit) < 0.25
  - `favorable`: P(defender eliminated) − P(attacker loses unit) ≥ 0.20
  - `even`: |P(defender eliminated) − P(attacker loses unit)| < 0.20
  - `unfavorable`: P(attacker loses unit) − P(defender eliminated) ≥ 0.20
  - `strongly_unfavorable`: P(attacker loses unit) > 0.75 AND P(defender eliminated) < 0.25
- Uncontested (no defenders): `assessment: "uncontested"`.
- Order of checks: handle uncontested first; then strongly_favorable / strongly_unfavorable (both conditions); then favorable / unfavorable (difference ≥ 0.20); then even.

### 2.8 Reasoning field

- Deterministic, template-generated, 1–2 sentences. Example: `"{attacker_type} attacks at value {attack_val} ({hit_pct}% hit chance). {return_fire_description}. Expected outcome: {expected_losses_summary}."` Not LLM-generated. Omit return_fire_description when no return fire.

### 2.9 Response contract

- On success: `status: "ok"`, `error: null`, plus engagementType, targetHex, attackerSummary, defenderSummary, prediction (trials, attackerHitsExpected, defenderHitsExpected, attackerLossesExpected, defenderLossesExpected, probabilityDefenderEliminated, probabilityAttackerLosesUnit, assessment, reasoning). **attackerSummary.units** entries include unitId, type, attackValue, position (when available); **defenderSummary.units** entries include unitId, type, defenseValue (per spec response schema). **prediction.trials** is the actual N used (e.g. 1000).
- On error: `status: "error"`, `error: "<human-readable string>"`.
- Optional: `warnings` array for excluded-out-of-range units or assumed-attacker return-fire warning.

---

## 3. Phased Implementation Plan

Phases are ordered so each can be verified before the next. Tests and integration steps are called out per phase.

---

### Phase 1: Refactor combat resolution to expose single-engagement APIs + Tool 3 scaffold

**Goal:** Single source of truth for one-round combat. Refactor `combatResolution.ts` to expose subroutines that accept a `rollD6` callback; add Tool 3 scaffold and assessment categorization helper.

**Tasks:**

1. **Refactor `src/main/combatResolution.ts`**  
   - **Extract or add `resolveOneRangedEngagement(attackerUnits, defenderUnits, defenderHexH3, rollD6, options?: { skipReturnFire?: boolean }): { attackerRemovedIds: string[]; defenderRemovedIds: string[] }`**  
     - Input: arrays of `CombatUnit`-like objects (id, unitType, player, h3Index); defender hex H3; and `rollD6: () => number`. When `skipReturnFire` is true (e.g. assumed attackers with no positions), do not apply defender return fire.  
     - Logic: one round of ranged (attacker rolls → hits; defender return fire when any attacker hex is within defender range → hits, unless skipReturnFire; assign attacker hits to defenders by casualty priority; assign defender hits to attackers by hex-with-most-units then casualty priority). Return IDs of removed units. Use existing `getAttack`, `getDefense`, `getRange`, `casualtyPriorityIndex` and `gridDistance`.  
   - **Extract or add `resolveOneMeleeEngagement(attackerUnits, defenderUnits, rollD6): { attackerRemovedIds: string[]; defenderRemovedIds: string[] }`**  
     - Input: two arrays of units (id, unitType, player); `rollD6`.  
     - Logic: one round of melee (attacker rolls attack, defender rolls defense; assign hits by casualty priority). Return IDs removed.  
   - **Refactor `runRangedPhase` and `runMeleePhase`** to call these subroutines with the game’s RNG (`next` from `createCombatRng`), so behavior is unchanged and existing tests still pass.  
   - Add orienting comments. **Logging:** Use **trace** in the new single-engagement subroutines (so when Tool 3 calls them 1000 times, logs are not flooded; trace is typically disabled in production). Use **debug** in existing phase entrypoints (runRangedPhase, runMeleePhase).

2. **New file: `src/main/tools/tool3CombatEstimation.ts` (scaffold)**  
   - Export `TOOL3_NAMES = ['estimate_combat']`.  
   - Export `executeTool3(toolName, args, state, latLngByH3, resolveToH3)` returning `{ status: 'error', error: 'Not implemented' }` for now.  
   - **`getAssessmentCategory(pDefenderEliminated: number, pAttackerLosesUnit: number): string`** — returns `strongly_favorable` | `favorable` | `even` | `unfavorable` | `strongly_unfavorable` per §2.7. Uncontested is handled by the tool, not this helper.  
   - Add orienting comments per project rules.

3. **Unit tests**  
   - **Combat resolution:** If the project has existing tests for `runRangedPhase`/`runMeleePhase`, ensure they still pass. Add tests for the new single-engagement functions with a **fixed** rollD6 (e.g. always 1, or a short sequence) to assert exact casualty outcomes. If the project has no test framework, verify refactor by running the game and resolving a turn; document that single-engagement behavior matches in a small script or manual check.  
   - **Assessment:** getAssessmentCategory(0.8, 0.2) → strongly_favorable; (0.5, 0.5) → even; (0.2, 0.8) → strongly_unfavorable.  
   - No estimate_combat API tests yet.

**Verification:**  
- Combat resolution refactor is in place; existing resolution behavior unchanged (run phases still pass if tests exist).  
- Tool 3 scaffold and getAssessmentCategory exist; build succeeds; no OpenRouter integration yet.

---

### Phase 2: `estimate_combat` — core implementation

**Goal:** Implement full `estimate_combat`: parse args, resolve or build attacker/defender lists, validate range (ranged), run Monte Carlo, build response (summaries, prediction, assessment, reasoning).

**Tasks:**

1. **Implement `executeEstimateCombat(args, state, latLngByH3, resolveToH3)`**  
   - Parse: `engagementType: "ranged" | "melee"`, `attackers: { units?: string[]; assumed?: { type: string; count: number }[] }`, `targetHex: [lat, lng]`, `defenders?: { units?: string[]; assumed?: { type: string; count: number }[] }`.  
   - Resolve target hex to H3; if invalid, return `{ status: 'error', error: 'Invalid hex position' }`.  
   - Resolve attackers: if both `units` and `assumed` present, prefer `units` and ignore `assumed`. If `units`, look up in state; first missing ID → `Unit not found: {unitId}`. If `assumed`, build virtual list. For ranged, filter to units in range of target; if none in range, return error with one example unit and its range and distance.  
   - Resolve defenders: if both `units` and `assumed` present, prefer `units` and ignore `assumed`. If omitted, auto-detect enemies at target hex; if none and no `defenders.assumed`, return uncontested result (defenderSummary.totalUnits 0, assessment "uncontested", reasoning "No defenders at target hex"). If `defenders.units` or `defenders.assumed`, use that.  
   - Return fire (ranged only): when attackers are by ID, compute canReturnFire and returnFireDetails from defender range and attacker hex positions. When attackers are assumed, canReturnFire false and add warning.  
   - Run N trials (`DEFAULT_TRIALS = 1000`) with a simulation-only `rollD6` (e.g. `() => Math.floor(Math.random() * 6) + 1`). Call the combat-resolution single-engagement APIs (`resolveOneRangedEngagement` / `resolveOneMeleeEngagement`) for each trial. Aggregate: attackerHitsExpected, defenderHitsExpected, attackerLossesExpected, defenderLossesExpected, probabilityDefenderEliminated (fraction of trials where all defenders eliminated), probabilityAttackerLosesUnit (fraction where at least one attacker eliminated).  
   - Build assessment: if uncontested, "uncontested"; else getAssessmentCategory(pDefenderEliminated, pAttackerLosesUnit).  
   - Build reasoning string from template (§2.8).  
   - Response shape: status, error, engagementType, targetHex (lat/lng), attackerSummary (units list with unitId, type, attackValue, position when available; totalUnits), defenderSummary (units list with unitId, type, defenseValue; totalUnits; canReturnFire; returnFireDetails), prediction (trials = actual N used, attackerHitsExpected, defenderHitsExpected, attackerLossesExpected, defenderLossesExpected, probabilityDefenderEliminated, probabilityAttackerLosesUnit, assessment, reasoning). Optional warnings array.

2. **Edge cases**  
   - Unit not found (attackers or defenders by ID).  
   - Ranged: all attackers out of range → error.  
   - Ranged: some out of range → exclude, add note/warning, run with the rest.  
   - No defenders and no assumed defenders → uncontested.  
   - Melee: attacker not at target hex → valid; no position check.

3. **Logging**  
   - Debug on entry (engagementType, targetHex, attacker/defender source); error on validation failure or exception.

4. **Tests**  
   - Happy path: ranged 1 armor vs 1 infantry at hex; melee 1 armor vs 1 infantry.  
   - Unit not found; invalid hex; all attackers out of range; uncontested (no defenders).  
   - Assumed attackers: warning and no return fire.  
   - Assessment categories at boundaries (e.g. 0.76/0.24 → strongly_favorable).

**Verification:**  
- `executeEstimateCombat` returns spec-compliant JSON for hand-crafted states.  
- Unit tests pass; no OpenRouter wiring yet.

---

### Phase 3: Dispatcher and OpenRouter wiring

**Goal:** Single entrypoint for Tool 3 and integration with the OpenRouter tool loop.

**Tasks:**

1. **Implement `executeTool3(toolName, args, state, latLngByH3, resolveToH3)`**  
   - If toolName !== 'estimate_combat', return `{ status: 'error', error: 'Unknown tool: ...' }`.  
   - Parse and validate args: engagementType required; attackers required (must have either `units` or `assumed`; if both present, prefer `units` and ignore `assumed`); targetHex required; defenders optional.  
   - Call `executeEstimateCombat(args, state, latLngByH3, resolveToH3)`; return its result.  
   - Catch exceptions; log error and return `{ status: 'error', error: String(err) }`.

2. **OpenRouter integration**  
   - In `openRouter.ts`:  
     - Add Tool 3 function definition to `buildToolDefinitions()` for `estimate_combat` (name, description, parameters: engagementType enum, attackers object with units or assumed, targetHex array, defenders optional).  
     - In the tool-calling loop, when dispatching by name: if tool is `estimate_combat`, call `executeTool3(toolName, args, state, latLngByH3, resolveToH3)` and append the result to the conversation.  
   - Keep Tool 1 and Tool 2 dispatch unchanged; add a clear comment that Tool 3 is combat estimation.

3. **System prompt**  
   - Ensure the system prompt’s “AVAILABLE TOOLS” (or equivalent) includes the Tool 3 description (estimate_combat) as in the spec § System Prompt Integration (item 5: “Always check before committing to an attack”).

4. **Logging**  
   - Log every Tool 3 call and result status (debug) with turn number and player id.

**Verification:**  
- Build and run a game; trigger AI turn; in logs, confirm Tool 3 definition is sent and that a call to `estimate_combat` returns 200 and the expected JSON shape.  
- Optionally call the tool manually (e.g. test script with mock state) to confirm end-to-end response.

---

### Phase 4: Tests, cleanup, and documentation

**Goal:** Reliable regression coverage and clear code for future developers.

**Tasks:**

1. **Unit tests (rule 3)**  
   - Consolidate and extend: happy path and essential failure cases (unit not found, invalid hex, out of range, uncontested, assumed attackers, assessment boundaries).  
   - Do **not** test: OpenRouter dispatch, DTO constructors/accessors, or implementation details. Focus on `executeEstimateCombat` and the combat-resolution single-engagement APIs.

2. **Code quality (rules 1, 4)**  
   - Orienting comments on all new public, non-overriding methods.  
   - Consistent naming (e.g. executeEstimateCombat, resolveOneRangedEngagement, resolveOneMeleeEngagement).  
   - Tool 3 calls combat resolution’s single-engagement APIs only; no duplicated combat logic.

3. **Spec alignment**  
   - Re-read spec § Tool 3 and Implementation Notes; confirm response fields (attackerSummary, defenderSummary, prediction, assessment, reasoning, canReturnFire, returnFireDetails) and error messages match.  
   - Ensure every response has `status` and `error`: `error: null` when `status === 'ok'`.

4. **Docs**  
   - Fill in this plan’s §8 Implemented with the file list and any deviation.

**Verification:**  
- Full test run passes.  
- New code follows project logging and comment rules.  
- One manual playthrough: AI uses estimate_combat and produces sensible orders.

---

## 4. File and Dependency Summary

| Item | Location / dependency |
|------|------------------------|
| New tool module | `src/main/tools/tool3CombatEstimation.ts` |
| Combat constants | `src/main/combatConstants.ts` — getAttack, getDefense, getRange, casualtyPriorityIndex |
| Combat resolution | `src/main/combatResolution.ts` — **refactored** to expose `resolveOneRangedEngagement` and `resolveOneMeleeEngagement` (accept `rollD6`); Tool 3 calls these with a simulation-only RNG; `runRangedPhase`/`runMeleePhase` call them with game RNG |
| Map/coords | Same pattern as Tool 1/2: resolveToH3, latLngByH3 (from mapData or caller) |
| Game state type | `src/main/gameDb.ts` — GameStateSnapshot |
| Tool 1/2 pattern | `src/main/tools/tool1Pathfinding.ts`, `tool2Assessment.ts` — dispatcher and executeToolN |
| OpenRouter | `src/main/openRouter.ts` — buildToolDefinitions, tool loop, system prompt |
| Tests | New test file(s) under project test layout (e.g. tool3CombatEstimation.test.ts) |
| Logger | `src/main/logger.ts` — logDebug, logError, logTrace |
| H3 | `h3-js` — gridDistance for range checks |

---

## 5. Risk and Ambiguity

- **Calling player id:** If game state does not expose “current player” or “calling player,” assume the AI is the opponent so “enemy” = human units when auto-detecting defenders at target hex.
- **Multiple attacker hexes (ranged):** Spec says return-fire hits are assigned to attacker hexes (most units first, then casualty priority). Simulation helper must implement the same rule as combat resolution for consistency.
- **Assumed unit types:** Validate type against known roster (e.g. infantry, armor, naval); unknown types can fall back to combatConstants defaults (getAttack/getDefense/getRange) or return an error. Prefer allowing any string and using defaults so future unit types work without code change.

---

## 6. Questions for Product / Owner

**Resolved:**

- **Simulation vs reuse:** **Reuse.** Combat resolution is refactored to expose single-engagement subroutines; Tool 3 calls them with a simulation-only RNG so combat and simulation cannot drift.
- **Default trials:** **1000.** Use `DEFAULT_TRIALS = 1000` per `estimate_combat` call.

**Open:** None. When both `units` and `assumed` are supplied for attackers or defenders, prefer `units` and ignore `assumed`.

---

## 7. Checklist for Coding Agent

Before starting:

- [ ] Tools 1 and 2 exist and tests pass.  
- [ ] Game state and map data types are known.  
- [ ] Read spec § Tool 3 in full (Purpose, Scope, Function Schema, Response Schema, Assessment Categories, Implementation Notes, Edge cases).

During implementation:

- [ ] Do not use the game’s combat RNG; use a separate source (e.g. Math.random) for Monte Carlo and pass it into the single-engagement APIs.  
- [ ] Reuse `resolveOneRangedEngagement` and `resolveOneMeleeEngagement` from combatResolution; do not duplicate combat logic in Tool 3.  
- [ ] Return fire: definitive when attackers by ID; false + warning when attackers are assumed.  
- [ ] When both `units` and `assumed` are supplied for attackers or defenders, prefer `units` and ignore `assumed`.  
- [ ] Log all tool invocations and errors; add orienting comments to public methods.  
- [ ] Add unit tests for single-engagement APIs and estimate_combat (happy path + unit not found, invalid hex, out of range, uncontested).

After implementation:

- [ ] Run full test suite; fix any regressions.  
- [ ] Confirm OpenRouter sends estimate_combat and receives valid JSON.  
- [ ] Update this plan’s “Implemented” section (§8) with file list and any small deviations.

---

## 8. Implemented (to be filled after completion)

- **Files added/updated:**  
  - `src/main/combatResolution.ts` — Added `resolveOneRangedEngagement`, `resolveOneMeleeEngagement` (accept `rollD6`, optional `skipReturnFire`); refactored `runRangedPhase` and `runMeleePhase` to call them. Exported `OneEngagementResult`, `CombatUnit` already exported.  
  - `src/main/tools/tool3CombatEstimation.ts` — New: `TOOL3_NAMES`, `getAssessmentCategory`, `executeEstimateCombat`, `executeTool3`; DEFAULT_TRIALS = 1000; prefer `units` when both `units` and `assumed` supplied.  
  - `src/main/openRouter.ts` — Import `executeTool3`, `TOOL3_NAMES`; `buildToolDefinitions()` extended with `estimate_combat`; tool loop dispatches to `executeTool3` for Tool 3 names; system prompt AVAILABLE TOOLS extended with item 5.  
  - `src/main/tools/tool3CombatEstimation.test.ts` — New: verification for getAssessmentCategory, resolveOneMeleeEngagement, resolveOneRangedEngagement, executeEstimateCombat (uncontested, unit not found, invalid hex). Run with `node dist/tools/tool3CombatEstimation.test.js`.
- **Deviations from spec (if any):**  
  - None.
- **Notes for future:**  
  - Terrain modifiers will require prediction to use modified attack/defense; reasoning field can mention terrain. `executeEstimateCombat` is exported for unit tests.
