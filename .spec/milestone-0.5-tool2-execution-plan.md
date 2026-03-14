# Milestone 0.5 — Tool 2 (Threat and Situation Assessment) Execution Plan

**Spec reference:** [mcp-tools-spec.md](./mcp-tools-spec.md) § Tool 2: Threat and Situation Assessment  
**Version:** 1.1  
**Audience:** Coding agent (e.g. Cursor AI) implementing the feature

---

## 0. Compliance with Stated Needs and Workspace Rules

This plan is written so that:

- **Phases are independently verifiable:** Phase 1 is self-contained (helpers + stub); Phases 2 and 3 each depend only on Phase 1; Phase 4 depends on 2 and 3; Phase 5 verifies the full implementation. Each phase includes a Verification subsection.
- **Reliability and clarity:** Design clarifications (§2) remove ambiguity; distance semantics (path vs grid) are explicit; edge cases and error messages are specified.
- **Future-developer clarity:** Orienting comments, no duplicated pathfinding logic, and consistent naming are required; Phase 5 calls out code quality and spec alignment.

Alignment with **workspace Code-Generation-Rules**:

| Rule | How the plan addresses it |
|------|---------------------------|
| **1. Reliable, understandable code** | Phases 1–3 build shared helpers and clear response shapes; Phase 5 requires orienting comments and spec alignment. |
| **2. Logging** | Plan requires: **debug** for public tool/executor entrypoints; **error** for caught exceptions; **trace** for getter-style helpers that don’t modify state. Use existing logger APIs; no log-level checks unless building large strings inline. |
| **3. Testing** | Plan limits tests to **happy paths and essential failure cases** (unit not found, invalid hex, empty lists, boundary conditions). No tests for OpenRouter dispatch boilerplate, DTOs, or implementation details. |
| **4. Orienting comments** | Every new public, non-overriding method must have an orienting comment (why it exists, when/how to use it, results and exceptions). |
| **5. Spec/docs in .spec** | This plan and the MCP spec live in `.spec` as markdown. |

---

## 1. Scope and Prerequisites

### 1.1 What is being built

- **`assess_unit(unitId, radius?)`** — Tactical briefing for one unit: unit info, `nearbyEnemies`, `nearbyFriendlies`, `threats`, `canAttackThisTurn`.
- **`assess_hex(position, forUnitType?)`** — Hex briefing: terrain, `passableBy`, `unitsAtHex`, `unitsInRange` (rangedRange1, rangedRange2, meleeRange), `adjacentTerrain`, `strategicNotes`.

All inputs/outputs use `[lat, lng]` at the boundary; internally use H3 indices and existing pathfinding/combat constants.

### 1.2 Prerequisites (must already exist)

- **Tool 1 (Pathfinding)** — `plan_route`, `check_distance`; pathfinding module: `findPath`, `getDistanceAndTurns`, `getMovementBudgetForUnit`.
- **Game state shape** — `state.units` (e.g. `id`, `player`, `h3Index`, `unitType`), `state.hexes` (e.g. `h3Index`, `terrain`), `state.turnNumber`.
- **Map/coordinates** — `buildLatLngCoordinateMap(hexList)` yielding `latLngByH3` and `resolveToH3(lat, lng)`.
- **Combat constants** — `getRange(unitType)`, `getMovementBudget(unitType)` (and optionally `getAttack`/`getDefense` if needed for notes).

### 1.3 Out of scope for this plan

- Tool 5 (Standing Orders): `currentStandingOrder` in unit assessment is always `null` until Tool 5 exists.
- Fog of war: `confidence` is always `"current"` and `lastSeen` is always `state.turnNumber`.
- New terrain features: only the two strategic note types in the spec are implemented.

---

## 2. Design Clarifications (for reliable implementation)

### 2.1 Distance semantics

- **Path distance (hex steps along passable terrain):** Used for “within radius”, `hexDistance`, `estimatedTurnsToReach`, and threat severity (turns to reach). Compute via pathfinding (e.g. `getDistanceAndTurns` or `findPath`). Land units only traverse land; naval only water.
- **Grid distance (H3 `gridDistance`):** Used for range checks: “can this unit shoot at that hex?” and “who can shoot at this hex?”. Matches combat resolution. Use `getRange(unitType)` and `gridDistance(attackerHex, targetHex)`.

### 2.2 Radius and “within range”

- **assess_unit `radius`:** Default 4. “Within radius” = path distance from assessed unit to the other unit ≤ radius. Only units in the same domain (land/water) can have a finite path distance; cross-domain is unreachable (exclude or treat as “out of radius”).
- **assess_hex `unitsInRange`:** “Who can attack this hex from their current position?” — for each enemy unit, if `gridDistance(enemy.h3Index, hexH3) <= getRange(enemy.unitType)`, include in the appropriate bucket (rangedRange1 = distance 1 and range ≥ 1; rangedRange2 = distance 2 and range ≥ 2; meleeRange = distance 0).

### 2.3 estimatedTurnsToReach semantics (spec)

- **nearbyEnemies:** “How quickly could **the assessed unit** reach the enemy?” → `ceil(hexDistance / assessedUnit.movementBudget)`.
- **nearbyFriendlies:** “How quickly could **the friendly** reach the assessed unit?” → `ceil(hexDistance / friendlyUnit.movementBudget)`.

### 2.4 Threat severity (spec)

- **critical:** Enemy can attack this turn (in ranged range or adjacent for melee) — use grid distance and enemy’s range / same-hex.
- **moderate:** Enemy can reach within 1–2 turns (path-based `estimatedTurnsToReach`).
- **low:** 3+ turns away but within scan radius.

### 2.5 strategicNotes (assess_hex)

- Deterministic, max 3 notes. Implement only:
  1. “Adjacent to water — exposed to naval bombardment (range 2)” if any adjacent hex is water.
  2. “Chokepoint — only N passable adjacent hexes” if the hex has ≤ 3 passable neighbors for `forUnitType` (or for all land/water if `forUnitType` omitted — clarify: spec says “passable-by-the-specified-unit-type”; when omitted, use “passable by any land unit” for land hexes and “passable by naval” for water).

### 2.6 Enemy vs friendly (who is “enemy”)

- **assess_unit:** “Enemy” = any unit with `player !== assessedUnit.player`. “Friendly” = same player as the assessed unit, excluding the assessed unit itself. (The assessed unit belongs to the AI when the AI calls the tool.)
- **assess_hex:** “Enemy” = units that can attack the hex from the perspective of the **calling player**. In the current flow only the AI calls tools, so enemy = units with `player !== state.callingPlayerId` (or equivalent). If the game state does not expose “current player,” assume the AI’s player id (e.g. `'opponent'`) so that “enemy” = human units.

### 2.7 currentStandingOrder

- Always `null` in this milestone. No DB or Tool 5 integration.

---

## 3. Phased Implementation Plan

Phases are ordered so each can be verified before the next. Tests and integration steps are called out per phase.

---

### Phase 1: Shared helpers and types (no tool entrypoints yet)

**Goal:** Reusable logic for distance, range, and response shaping so both tools stay consistent and testable.

**Tasks:**

1. **New file: `src/main/tools/tool2Assessment.ts` (scaffold)**  
   - Export `TOOL2_NAMES = ['assess_unit', 'assess_hex']`.  
   - Export a single dispatcher `executeTool2(toolName, args, state, latLngByH3, resolveToH3)` that for now returns `{ status: 'error', error: 'Not implemented' }` for both names.  
   - Add orienting comments per project rules.

2. **Shared helpers (in same file or a small `tool2AssessmentHelpers.ts` if preferred):**  
   - **`getPathDistanceAndTurns(originH3, destH3, unitType, hexSet, terrainByH3, blocked?)`**  
     - Returns `{ hexDistance, estimatedTurns }` or `null` if unreachable.  
     - Call pathfinding `getDistanceAndTurns(originH3, destH3, hexSet, terrainByH3, passableFor, movementBudget, blocked)` with `passableFor` from unit type (land/water) and `movementBudget` from `getMovementBudgetForUnit(unitType)`. Do not duplicate BFS; use the pathfinding module only.  
   - **`getGridDistance(h3A, h3B): number`**  
     - Wraps `h3-js` `gridDistance`; returns a non-negative integer (catch and treat errors as “far” or throw and let caller handle).  
   - **`isInRangedRange(attackerH3, targetH3, attackerRange): boolean`**  
     - True iff `getGridDistance(attackerH3, targetH3) <= attackerRange`.  
   - **`isInMeleeRange(unitH3, otherH3): boolean`**  
     - True iff `getGridDistance(unitH3, otherH3) === 0`.  
   - **`h3ToLatLng(h3, latLngByH3): [number, number]`**  
     - Same contract as Tool 1: use map when present, else `cellToLatLng`. Import from Tool 1 if that module exports it; otherwise duplicate the small helper to avoid circular deps.  
   - Use **combatConstants** `getRange`, **pathfinding** `getMovementBudgetForUnit` and `getDistanceAndTurns`.  
   - **Logging (rule 2):** debug for entry into public functions; trace for getter-style helpers (e.g. getGridDistance, isInRangedRange) that don’t modify state; error for caught exceptions.

3. **Unit tests (e.g. `tool2Assessment.test.ts` or project’s test layout)**  
   - Test `getPathDistanceAndTurns` with a minimal state (two hexes connected; same domain vs different domain; expect null for unreachable).  
   - Test `getGridDistance` and range helpers with known H3 indices (same hex, neighbor, two steps).  
   - No tool API tests yet.  
   - *If the project has no test runner:* structure code so helpers are pure and easy to call from a small script or future test suite; verify Phase 1 by running the build and (if needed) a one-off script that calls the helpers.

**Verification:**  
- Helpers and dispatcher exist; tests (or manual/script verification) pass.  
- Build succeeds; no integration with OpenRouter yet.

---

### Phase 2: `assess_unit` — core data and response shape

**Goal:** Implement `assess_unit` so it returns the full spec response (unit, nearbyEnemies, nearbyFriendlies, threats, canAttackThisTurn) for happy path and key edge cases.

**Tasks:**

1. **Implement `executeAssessUnit(unitId, radius, state, latLngByH3, resolveToH3)`**  
   - Resolve `unitId` to a unit; if not found, return `{ status: 'error', error: 'Unit not found: {unitId}' }`.  
   - Default `radius = 4` if missing or invalid.  
   - Build:  
     - **unit:** id, type, position (lat/lng), terrain (from hex), movementBudget, `currentStandingOrder: null`.  
     - **nearbyEnemies:** All enemy units with path distance ≤ radius. For each: unitId, type, position, hexDistance, estimatedTurnsToReach (assessed unit’s turns to reach enemy), inRangedRange (enemy can shoot assessed unit: grid distance ≤ enemy range), inMeleeRange (same hex), confidence `"current"`, lastSeen = state.turnNumber. Sort by hexDistance ascending.  
     - **nearbyFriendlies:** Same idea for same-player units; estimatedTurnsToReach = friendly’s turns to reach assessed unit. Sort by hexDistance ascending.  
     - **threats:** One entry per nearby enemy. Severity: critical (can attack this turn), moderate (1–2 turns), low (3+ turns). description e.g. “{id} ({type}) can reach your hex in N turns”. sourceUnit = unitId.  
     - **canAttackThisTurn:** For each nearby enemy: attackType `"ranged"` | `"melee"` | `"none"`; if none, reason e.g. “Out of range (distance N, armor range R)”.  
   - Use path distance for “within radius” and for hexDistance/estimatedTurnsToReach; use grid distance for inRangedRange, inMeleeRange, threat “critical”, and canAttackThisTurn.  
   - **Response contract (spec § Overview):** On success include `status: "ok"` and `error: null`. On error include `status: "error"` and `error: "<human-readable string>"`.

2. **Edge cases**  
   - No enemies / no friendlies within radius → empty arrays.  
   - Unit on invalid hex (not on map) → treat as unit not found or return error per spec (“Unit not found” is sufficient).

3. **Logging**  
   - Debug on entry (unitId, radius, state.turnNumber); error when unit not found or exception.

4. **Tests**  
   - Unit found vs not found.  
   - One enemy at path distance 1 vs 5 (inside vs outside radius).  
   - Threat severity: enemy at range (grid) 0, 1, 2 and path 1 turn vs 3 turns.  
   - canAttackThisTurn: ranged vs melee vs none with reason.  
   - estimatedTurnsToReach: assessed armor vs friendly infantry (different movement budgets).

**Verification:**  
- `executeAssessUnit` returns spec-compliant JSON for hand-crafted states.  
- Unit tests pass; no OpenRouter wiring yet.

---

### Phase 3: `assess_hex` — core data and response shape

**Goal:** Implement `assess_hex` with terrain, passableBy, unitsAtHex, unitsInRange, adjacentTerrain, strategicNotes.

**Tasks:**

1. **Implement `executeAssessHex(position, forUnitType, state, latLngByH3, resolveToH3)`**  
   - Resolve `position` to H3 via `resolveToH3`. If off-map or invalid, return `{ status: 'error', error: 'Invalid hex position' }`.  
   - **terrain:** land or water from state.hexes.  
   - **passableBy:** `["infantry","armor"]` for land, `["naval"]` for water (from game model).  
   - **unitsAtHex:** Return the actual list of units (both sides) at this hex. Each entry: unitId, type, position (lat/lng). Empty array if no units at the hex.  
   - **unitsInRange:** Enemies that can attack this hex from their current position.  
     - **rangedRange1:** grid distance 1 and enemy range ≥ 1.  
     - **rangedRange2:** grid distance 2 and enemy range ≥ 2.  
     - **meleeRange:** grid distance 0.  
     - Each entry: unitId, type, position, hexDistance, confidence `"current"`, lastSeen = state.turnNumber.  
   - **adjacentTerrain:** Count adjacent hexes by terrain (land/water); only count hexes that exist on the map.  
   - **strategicNotes:** Max 3; deterministic: (1) “Adjacent to water — exposed to naval bombardment (range 2)” if any adjacent hex is water; (2) “Chokepoint — only N passable adjacent hexes” if passable neighbors ≤ 3 for the given unit type (when `forUnitType` omitted, use land for land hexes and naval for water).

2. **Clarification for chokepoint**  
   - “Passable adjacent” = hex is on map and passable for the unit type (land units → land hexes; naval → water). When `forUnitType` is omitted, use “land” for land hexes and “water” for water hexes so the note is still meaningful.

3. **Response and logging**  
   - On success include `status: "ok"` and `error: null`. On error include `status: "error"` and `error: "Invalid hex position"`.  
   - Debug on entry; error on invalid hex or exception.

4. **Tests**  
   - Valid hex vs invalid; land vs water; units at hex; enemies at distance 0, 1, 2 with different ranges; adjacentTerrain counts; strategicNotes (adjacent water, chokepoint). Happy path and essential failure cases only (rule 3).

**Verification:**  
- `executeAssessHex` matches spec examples and edge cases.  
- Unit tests pass.

---

### Phase 4: Dispatcher and tool wiring

**Goal:** Single entrypoint for Tool 2 and integration with the OpenRouter tool loop.

**Tasks:**

1. **Implement `executeTool2(toolName, args, state, latLngByH3, resolveToH3)`**  
   - Parse and validate args:  
     - **assess_unit:** `unitId` (string required), `radius` (optional number, default 4).  
     - **assess_hex:** `position` (required [lat, lng]), `forUnitType` (optional string).  
   - Call `executeAssessUnit` or `executeAssessHex`; return their result.  
   - On unknown tool name, return `{ status: 'error', error: 'Unknown tool: ...' }`.  
   - Catch exceptions; log error and return `{ status: 'error', error: String(err) }`.

2. **OpenRouter integration**  
   - In `openRouter.ts`:  
     - Add Tool 2 function definitions to `buildToolDefinitions()` for `assess_unit` and `assess_hex` (name, description, parameters with types and required array).  
     - In the tool-calling loop, when dispatching by name: if tool is `assess_unit` or `assess_hex`, call `executeTool2(toolName, args, state, latLngByH3, resolveToH3)` and append the result to the conversation.  
   - Keep Tool 1 dispatch unchanged; add a clear comment that Tool 2 is assessed unit/hex.

3. **System prompt**  
   - Ensure the system prompt’s “AVAILABLE TOOLS” section includes the two Tool 2 descriptions (assess_unit, assess_hex) as in the spec § System Prompt Integration, so the LLM knows when to call them.

4. **Logging**  
   - Log every Tool 2 call and result status (debug) with turn number and player id, per spec (“Log all tool calls”).

**Verification:**  
- Build and run a game; trigger AI turn; in logs, confirm Tool 2 definitions are sent and that a call to `assess_unit` or `assess_hex` returns 200 and the expected JSON shape.  
- Optionally call the tools manually (e.g. via a small test script that builds state and calls `executeTool2`) to confirm end-to-end response shape.

---

### Phase 5: Tests, cleanup, and documentation

**Goal:** Reliable regression coverage and clear code for future developers.

**Tasks:**

1. **Unit tests (rule 3)**  
   - Consolidate and extend: happy path and essential failure cases for both tools (unit not found, invalid hex, empty nearby lists, threat and canAttackThisTurn boundaries, strategicNotes).  
   - Do **not** test: OpenRouter dispatch, controller-style delegation, DTO constructors/accessors, or implementation details. Focus on `executeAssessUnit`, `executeAssessHex`, and shared helpers.

2. **Code quality (rules 1, 4)**  
   - Orienting comments on all new public, non-overriding methods (why the method exists, when/how to use it, results and exceptions).  
   - Consistent naming (e.g. `executeAssessUnit` / `executeAssessHex`).  
   - No duplicated pathfinding logic; reuse pathfinding module and combat constants.

3. **Spec alignment**  
   - Re-read spec § Tool 2 and Implementation Notes; confirm response fields (including `confidence`, `lastSeen`, `currentStandingOrder`) and error messages match.  
   - Ensure every response has `status` and `error`: `error: null` when `status === 'ok'`, and `error: "<string>"` when `status === 'error'` (spec § Overview).

4. **Docs**  
   - Fill in this plan’s §8 Implemented “Implemented” section with the file list and any deviation (e.g. “chokepoint when forUnitType omitted uses land/water default”).

**Verification:**  
- Full test run passes.  
- New code follows project logging and comment rules.  
- One manual playthrough: AI uses assess_unit or assess_hex and produces sensible orders.

---

## 4. File and Dependency Summary

| Item | Location / dependency |
|------|----------------------|
| New tool module | `src/main/tools/tool2Assessment.ts` (or split helpers into `tool2AssessmentHelpers.ts` if desired) |
| Pathfinding | `src/main/pathfinding.ts` — `getDistanceAndTurns`, `findPath`, `getMovementBudgetForUnit` |
| Combat constants | `src/main/combatConstants.ts` — `getRange`, `getMovementBudget` |
| Map/coords | `src/main/mapData.ts` — `buildLatLngCoordinateMap` |
| Game state type | `src/main/gameDb.ts` — `GameStateSnapshot` (or equivalent) |
| Tool 1 pattern | `src/main/tools/tool1Pathfinding.ts` — dispatcher and `executePlanRoute` / `executeCheckDistance` |
| OpenRouter | `src/main/openRouter.ts` — `buildToolDefinitions`, tool loop, system prompt |
| Tests | New test file(s) under project test layout (e.g. `tool2Assessment.test.ts`) |
| Logger | `src/main/logger.ts` — `logDebug`, `logError`, `logTrace` |

---

## 5. Risk and Ambiguity

- **Cross-domain distance:** When assessed unit is land and another unit is naval (or vice versa), path distance is undefined/unreachable. Treat as “not within radius” and do not list in nearbyEnemies/nearbyFriendlies. For assess_hex, “unitsInRange” uses grid distance only (no path), so naval can be in rangedRange2 for a land hex.
- **Same-hex melee:** “Enemy is in the same hex” is possible after movement in resolution; spec says “unlikely during planning” but still report inMeleeRange and attackType `"melee"` when grid distance is 0.
- **Chokepoint when forUnitType omitted:** This plan uses “land” for land hexes and “water” for water hexes so the note is deterministic and useful. If the spec is updated to something else, adjust in Phase 3.

---

## 6. Questions for Product / Owner (resolve before or during implementation)

- *(None open.)* `unitsAtHex` is prescribed: return the actual list of units (both sides) at the hex with unitId, type, position (lat/lng) each; empty array if none (§3 Phase 3).

---

## 7. Checklist for Coding Agent

Before starting:

- [ ] Tool 1 and pathfinding exist and tests pass.  
- [ ] Game state and map data types are known.  
- [ ] Read spec § Tool 2 in full (Purpose, both schemas, Implementation Notes, Edge cases).

During implementation:

- [ ] Use path distance for radius, hexDistance, estimatedTurnsToReach, and threat “turns”; use grid distance for range checks and unitsInRange.  
- [ ] Keep `confidence` and `lastSeen` constants; keep `currentStandingOrder` null.  
- [ ] Log all tool invocations and errors; add orienting comments to public methods.  
- [ ] Add unit tests for helpers and both tools (happy path + unit not found, invalid hex, empty lists).

After implementation:

- [ ] Run full test suite; fix any regressions.  
- [ ] Confirm OpenRouter sends both tools and receives valid JSON.  
- [ ] Update this plan’s “Implemented” section (§8) with file list and any small deviations.

---

## 8. Implemented (to be filled after completion)

- **Files added/updated:**  
  - `src/main/tools/tool2Assessment.ts` (new): assess_unit, assess_hex, shared helpers (getPathDistanceAndTurns, getGridDistance, isInRangedRange, isInMeleeRange, h3ToLatLng).  
  - `src/main/openRouter.ts`: import executeTool2 and TOOL2_NAMES; buildToolDefinitions() extended with assess_unit and assess_hex; tool loop dispatches to executeTool2 for Tool 2 names; system prompt AVAILABLE TOOLS extended with items 3 and 4.
- **Deviations from spec (if any):**  
  - None. assess_hex response `position` is the resolved hex center (h3ToLatLng(hexH3)); unitsAtHex returns actual list of units at hex (option A).
- **Notes for future (e.g. Tool 5 / fog of war):**  
  - currentStandingOrder remains null until Tool 5. confidence/lastSeen are constants for fog-of-war layer. No test runner in project; verification was build and manual. Add unit tests when a test framework is introduced.
