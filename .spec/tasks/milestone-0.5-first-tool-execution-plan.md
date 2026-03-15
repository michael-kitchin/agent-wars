# Milestone 0.5 (First MCP Tool) — Execution Plan

*Version 1.0 — March 2026*

This document is an execution plan for implementing **Milestone 0.5 — MCP Service Layer (v1)** from the [Strategic Development Plan](development-plan.md), limited to:

1. **The first MCP tool** from the [MCP Tool Services Design Specification](mcp-tools-spec.md): **Tool 1 — Pathfinding and Movement Planning** (`plan_route` and `check_distance`).
2. **OpenRouter integration** for native tool calling: iterative tool-calling loop, tool definitions in the request, maximum 10 round-trips, and extraction of final orders from the LLM response.
3. **Prompt format change** specified in the tools spec: remove the per-unit "can move to" list from the base prompt; the AI uses tools for movement planning instead.

Remaining tools (Tool 2–5) are out of scope for this plan and will be covered by later execution plans.

The plan is written for a coding agent. Phases are organized for **maximum reliability and clarity**, with each phase **independently verifiable or verifiable with previously completed phases**. Generated code must be **reliable and understandable** for future developers.

---

## Scope Summary

**In scope:**

- **Tool 1 (Pathfinding):** Implement `plan_route(unitId, destination, options?)` and `check_distance(from, to, unitType)` per the [MCP tools spec](mcp-tools-spec.md) § Tool 1. All inputs/outputs use `[lat, lng]` at the interface; implementation uses H3 indexes internally and snaps received coordinates to the nearest map hex at the game resolution.
- **OpenRouter tool-calling:** Use OpenRouter's native tool-use interface (e.g. `tools` and `tool_choice` on `/api/v1/chat/completions`). Implement the iterative loop: send prompt + tool definitions → receive response → if response contains `tool_calls`, execute each tool locally, append tool results to conversation, resend → repeat until the LLM returns a final message containing the order JSON (`strategy`, `movementOrders`, `rangedAttacks`) with no further tool calls, or until 10 iterations (then submit no explicit orders and inject a warning into the next turn's prompt).
- **Prompt format:** Base prompt includes only: unit roster (ID, type, position as `[lat, lng]`) for both sides, current turn number, and game objective. **Remove** the per-unit list of valid move destinations and the "Pursuit" suggestions; movement planning is done via `plan_route` and `check_distance`.
- **Order handling:** Final order validation and application remain as in the current codebase (validate AI orders, drop invalid, merge with human orders, resolve). Order format stays `{ "strategy", "movementOrders", "rangedAttacks" }` with `toXY`/`targetXY` resolved to H3 via existing `resolveToH3`.

**Out of scope for this plan:**

- Tools 2, 3, 4, and 5 (assessment, combat estimation, memory, standing orders).
- JSON-in-prompt fallback for models that do not support native tool use (only tool-capable models are supported for now).
- Fog-of-war filtering (tools operate on full game state; `confidence`/`lastSeen` can be constants per spec).

**Technical constraints:**

- Reuse existing **game state** source: `GameStateSnapshot` from `gameDb` and `buildLatLngCoordinateMap` / `resolveToH3` from `mapData`. Tool implementations receive the same snapshot and coordinate map used by the current OpenRouter flow.
- **H3:** Use `h3-js` (already in use). For BFS, use `gridDisk(origin, 1)` for neighbors; filter by map hex set and terrain passability. Use `gridDistance` for hex distance. Use `cellToLatLng` / `latLngToCell` (or existing `resolveToH3`) for snapping.
- **Determinism:** Tool 1 is stateless per call: same inputs + same game state ⇒ same output. No side effects on game state.

---

## Compliance with Project Rules

Implementing agents must follow the project's coding rules. The following align with the product owner's stated rules and ensure reliable, high-quality results.

1. **Reliability and clarity:** All generated code must be reliable and easy to understand. When generating code for the first time, double-check correctness and clarity before considering the task complete.

2. **Logging:** Use the **existing logging API** (e.g. `logDebug`, `logError`, `logTrace` in `src/main/logger`).  
   - **Debug:** All new and updated **public backend method invocations** must generate debug-level log messages.  
   - **Error:** All **caught exceptions** must generate error-level log messages.  
   - **Trace:** All **getter-style methods that do not modify state** must generate trace-level messages.  
   Ensure all new and updated log messages include a reasonable level of detail for troubleshooting. The existing logging APIs check log levels before building message strings, so it is unnecessary to check the log level beforehand unless potentially large strings are being constructed inline with the logging call.

3. **Testing:** Test only **happy paths and essential failure cases**. Focus on **essential code contracts**, not implementation details. Do **not** test REST controller methods that directly delegate to component calls, DTO constructors or accessors, or similar boilerplate. Remove any test cases or classes made unnecessary by these restrictions.

4. **Orienting comments:** All new and updated **public, non-overriding** methods must have correctly formatted orienting comments. An orienting comment explains why the method exists, generally when to use it, how to use it, and what to expect in terms of results and exceptions. Comments for **interface** methods focus on code contracts; comments for **implementation** methods focus on high-level implementation details.

5. **Spec and design documents:** All spec, design, and similar guidance documents must be written as markdown files in the `.spec` directory.

Other project conventions (e.g. copyright headers on new source files, TypeScript strict null checks) follow existing codebase practice unless contradicted by the rules above.

---

## Questions for reliable execution

Before or during implementation, clarify the following if the codebase or product owner does not already specify them:

- **Where to store the "last turn exceeded tool-call limit" flag:** The plan says to inject a warning into the next turn's system prompt when the AI hit 10 iterations without submitting orders. Should this flag be stored in the game database (e.g. a row in `game_config` or `turn_state`) so it survives process restarts, or is in-memory state acceptable (e.g. a variable cleared after the next prompt is built)?

- **OpenRouter tool result message format:** OpenRouter/OpenAI allow multiple `tool_calls` in one assistant message. Confirm whether each tool call must get its own separate message with role `"tool"` (one-to-one), or if the API allows a single combined tool message; implement to match the API so the model receives results correctly.

- **Model selection and tool support:** If the user selects a model that does not support tools, should the app show a clear error (e.g. "Selected model does not support tool calling; choose another model") or attempt a fallback? The plan assumes only tool-capable models are supported; if a fallback is desired later, it is out of scope for this plan but can be documented as a future option.

---

## Prerequisites

- **Milestone 0.4** is complete: WEGO turns, combat resolution, OpenRouter integration (raw prompt, no tools), order format `{ strategy, movementOrders, rangedAttacks }`, validation and application of AI orders in the ready flow.
- **Codebase:** `src/main/openRouter.ts` (requestOrders, buildSystemPromptLatLng, parseOrdersResponse, resolveToH3 from mapData); `src/main/gameDb.ts` (getGameState, GameStateSnapshot); `src/main/mapData.ts` (buildLatLngCoordinateMap, getOrderedHexList, H3_RESOLUTION, cellToLatLng); `h3-js` (gridDistance, gridDisk, etc.).
- **OpenRouter:** Implementer has access to the OpenRouter API and to documentation for [tool calling](https://openrouter.ai/docs/features/tool-calling) (request format: `tools` array with function name, description, parameters schema; response: `tool_calls` in the assistant message; tool results sent as messages with role `tool`).

No code in Prerequisites; verification is that the app runs, AI orders work with the current prompt, and the implementer can read the tools spec and OpenRouter tool-calling docs.

---

## Phase 1: Pathfinding Core (BFS and Coordinate Snapping)

**Goal:** Implement reusable pathfinding and distance logic that Tool 1 will call. No tool API and no OpenRouter changes yet. This phase is independently testable.

**Tasks:**

1. **Snap [lat, lng] → H3:**  
   Ensure there is a single place that, given a game hex list and `[lat, lng]`, returns the nearest map hex (H3 index) at the game resolution. The spec says: "When a tool receives a [lat, lng] pair that doesn't exactly match an H3 hex center, it should snap to the nearest hex at the game's resolution level." The existing `buildLatLngCoordinateMap(hexList).resolveToH3(lat, lng)` already does this; expose or reuse it so the pathfinding module can take `[lat, lng]` and a hex list and get an H3 index. If the snapped hex is not on the map, the caller can treat it as invalid.

2. **BFS over the map:**  
   Implement a function that, given:
   - `originH3: string`, `destinationH3: string`,
   - `hexList: string[]` (all map hexes),
   - `terrainByH3: Map<string, 'land' | 'water'>` (or equivalent from GameStateSnapshot),
   - `passableFor: 'land' | 'water'` (domain),
   - optional set of blocked H3 indices (e.g. enemy-occupied hexes for `avoidEnemies`),
   returns the **shortest path** as an ordered list of H3 indices from origin to destination, or `null` if no path exists. Use BFS: explore neighbors via `gridDisk(h3, 1)` filtered to hexes in `hexList` with matching domain. Land units: only land hexes; naval: only water hexes. Do not use movement cost yet (uniform cost per hex). Prefer a dedicated module (e.g. `pathfinding.ts` or under a `tools` package) so Tool 1 and future tools can depend on it.

3. **Multi-turn path partitioning:**  
   Given a path (ordered list of H3 indices from origin to destination) and a **movement budget per turn** (e.g. 1 for infantry, 2 for armor/naval), partition the path into per-turn segments. Each segment consumes up to `movementBudget` hex steps; the last segment may consume less. Output structure per spec: for each turn, the segment's hexes (including start hex of that turn), `movementSpent`, `movementBudget`, and `endHex`. This will be used by `plan_route` to build the `path` array in the response.

4. **Distance / estimated turns (no path):**  
   Given two H3 indices and unit type (for movement budget), compute hex distance (length of shortest path) and `estimatedTurns = ceil(hexDistance / movementBudget)`. Reuse the same BFS so that you only compute distance (or path length) when needed; for `check_distance` you need distance and reachability, not the full path. Factor so that both `plan_route` and `check_distance` can call the same core (BFS + partition).

5. **Unit roster constants:**  
   Movement budgets are fixed per the tools spec: infantry 1, armor 2, naval 2. Define these in one place (e.g. with existing combat constants or in a small `toolContracts`/unit roster module) so Tool 1 and pathfinding use the same values.

**Verification:**

- Unit tests: (1) Snap: known (lat, lng) → expected H3 for a given hex list. (2) BFS: small map (e.g. 7 hexes), land only; path A→B in 2 steps; land unit cannot reach water hex; naval cannot reach land. (3) With optional blocked set, path routes around blocked hex. (4) Partitioning: path of 5 hexes, budget 2 → turns 3, with correct movementSpent/endHex. (5) Distance: two hexes 4 steps apart, armor → hexDistance 4, estimatedTurns 2.

**Exit condition:** Pathfinding core and snapping are implemented and tested. No HTTP or tool API yet.

---

## Phase 2: Tool 1 Implementation (plan_route and check_distance)

**Goal:** Implement the Tool 1 API as specified in the MCP tools spec: `plan_route` and `check_distance`, with request/response schemas and error handling. Call the pathfinding core from Phase 1. No OpenRouter integration yet.

**Tasks:**

1. **Tool request types:**  
   Define TypeScript types (or validate at runtime) for:
   - `plan_route`: `unitId: string`, `destination: [lat, lng]`, `options?: { avoidEnemies?: boolean; maxTurns?: number }`.
   - `check_distance`: `from: [lat, lng]`, `to: [lat, lng]`, `unitType: string` ("infantry" | "armor" | "naval").

2. **plan_route implementation:**  
   - Resolve `destination` to H3 via snap; if off-map, return `status: "error"`, `error: "No path exists — destination is [impassable for this unit type / unreachable]"` as appropriate.  
   - Look up unit by `unitId` in game state; if not found or not on map, return `status: "error"`, `error: "Unit not found: {unitId}"`.  
   - Determine domain from unit type (land vs water). Origin = unit's current H3.  
   - If origin equals destination H3, return `status: "ok"`, `turnsRequired: 0`, `path: []`, plus unit/origin/destination fields per spec.  
   - Run BFS with optional enemy blocking (when `avoidEnemies` is true). If destination unreachable with avoidance, retry without avoidance and add warning `"Route passes through enemy-occupied hexes — avoidance was not possible"`.  
   - If `maxTurns` is set and path would exceed it, truncate and set `warnings: ["Route truncated at maxTurns limit — destination not reached in {maxTurns} turns"]`, `reachable: false`.  
   - Partition path into per-turn segments; build `path` array with `turn`, `hexes` (as [lat, lng] via latLngByH3), `movementSpent`, `movementBudget`, `endHex`.  
   - Response includes `status: "ok"`, `unitId`, `unitType`, `origin`, `destination` (as [lat, lng]), `hexDistance`, `turnsRequired`, `path`, `warnings`.  
   - All coordinates in responses use [lat, lng] from the game's coordinate map.

3. **check_distance implementation:**  
   - Snap `from` and `to` to H3. If either is off-map or invalid, return `status: "error"` with an appropriate message (e.g. "Invalid hex position").  
   - Run BFS to get hex distance (or reachability); compute `estimatedTurns = ceil(hexDistance / movementBudget)` for the given `unitType`.  
   - Return `status: "ok"`, `from`, `to`, `hexDistance`, `estimatedTurns`, `reachable: true/false`.

4. **Tool dispatcher:**  
   Expose a single function that, given tool name and parsed arguments (and game state + coordinate map), calls `plan_route` or `check_distance` and returns the JSON-serializable response object (so the OpenRouter layer can pass it to the LLM as tool result). Ensure every response includes `status` and `error` (null when ok).

5. **Fog-of-war placeholders:**  
   The spec says to include `confidence` and `lastSeen` where applicable for future fog of war. Tool 1's response schemas in the spec do not show these for plan_route/check_distance; only add them if the spec explicitly requires them for Tool 1. Otherwise leave for Tool 2+.

**Verification:**

- Unit tests: plan_route — unit not found; destination unreachable (wrong domain); same hex; avoidEnemies true with enemy on path (warning or alternate path); maxTurns truncation. check_distance — unreachable; reachable with correct estimatedTurns.  
- Integration-style test: with a real GameStateSnapshot (e.g. from test DB or fixture), call the dispatcher for plan_route and check_distance and assert response shape and status.

**Exit condition:** Tool 1 is implemented and testable without the LLM. OpenRouter still uses the old single-turn prompt.

---

## Phase 3: OpenRouter Tool-Calling Loop

**Goal:** Implement the iterative tool-calling flow in the main process: send messages + tool definitions to OpenRouter, handle `tool_calls` in the response, execute tools locally, append results, resend until final order JSON or max 10 iterations.

**Tasks:**

1. **Tool definitions for the API:**  
   Build the OpenRouter `tools` payload for Tool 1 only. Each tool is a function with `name`, `description`, and `parameters` (JSON Schema). Map:
   - `plan_route` — parameters: unitId (string), destination (array of two numbers), options (object with optional avoidEnemies, maxTurns).
   - `check_distance` — parameters: from (array of two numbers), to (array of two numbers), unitType (string).  
   Use the exact schema format expected by OpenRouter (OpenAI-compatible). Descriptions should match the spec’s intent so the LLM knows when to call each tool.

2. **Request shape:**  
   Send to `POST https://openrouter.ai/api/v1/chat/completions` a body that includes:
   - `model`, `messages`, `max_tokens` (as today),
   - `tools`: array of the two tool definitions,
   - `tool_choice`: either `"auto"` or an object that allows the model to choose (per OpenRouter docs).  
   First request: `messages = [ { role: 'system', content: systemPrompt }, { role: 'user', content: userMessage } ]`.

3. **Response handling:**  
   Read the assistant message from the response. If it contains `tool_calls` (array of { id, name, arguments }):
   - For each tool call, parse `arguments` (JSON), call the local tool dispatcher (Phase 2) with (name, arguments, game state, coord map), and build a tool result message (role `"tool"`, `tool_call_id`, content = JSON string of the tool response).
   - Append the assistant message (with tool_calls) to the conversation, then append one or more tool result messages (per API format: one message per tool call or combined as required by the API).
   - Send a new request with the extended `messages` and same `tools`/`tool_choice`.
   - Repeat until the assistant message has **no** `tool_calls` or the iteration count reaches 10.

4. **Final content parsing:**  
   When the assistant message has no `tool_calls`, treat its `content` as the final response. Run the existing `parseOrdersResponse(content, resolveToH3)` to extract `strategy`, `movementOrders`, `rangedAttacks`. Validate and apply orders as today (validateAiOrder, validateAiRangedOrder, merge with human orders). If parsing fails, log and return error (no orders applied).

5. **Max iterations:**  
   If after 10 iterations the last message still has `tool_calls` or no parseable order JSON:
   - Log a warning with the tool-call history for debugging.
   - Return success with **no** explicit AI orders (empty movementOrders and rangedAttacks); standing orders and unordered units behave per existing logic (hold position if no standing orders).
   - Persist or pass a flag so that the next turn’s system prompt can include: `"WARNING: Last turn's planning exceeded the tool-call limit (10 rounds). You submitted no explicit orders. Ensure you submit your final orders JSON promptly after gathering the information you need."`

6. **Logging:**  
   Log each tool call (tool name, arguments summary) and each tool result (status, and error if any) at debug level. Do not log full game state or full response bodies at debug to avoid noise; keep enough to troubleshoot (e.g. turn number, iteration, tool name).

**Verification:**

- With a model that supports tools: run a full game turn; in logs, see at least one request with `tools`, then either tool_calls and a follow-up request with tool results, or a final message with order JSON. After the loop, orders are parsed and applied.
- Optionally: mock the fetch to return a response with tool_calls, then a second response with content only; assert the loop runs twice and final orders are extracted.
- Trigger max iterations (e.g. mock 10 responses with tool_calls only): assert no crash, no orders applied, and next-turn warning is injectable (or injected).

**Exit condition:** The ready flow uses the new tool-calling loop when requesting AI orders. Tool 1 is the only tool defined. Existing order validation and resolution unchanged.

---

## Phase 4: Prompt Format Change and Tool Descriptions

**Goal:** Change the system prompt to the tool-based format: remove the per-unit "can move to" and "Pursuit" lines; add a concise tool-description block for `plan_route` and `check_distance`; keep unit roster (ID, type, position [lat, lng]) for both sides, turn number, and objective.

**Tasks:**

1. **New system prompt builder:**  
   Create (or refactor) the system prompt so that it:
   - States role (opponent in a WEGO hex wargame), current turn and phase, and objective (e.g. destroy all human units).
   - Includes unit roster for **both** sides: for each unit, list only `unitId`, `type`, and position as `[lat, lng]` (no list of valid destinations, no Pursuit line).
   - Includes a short combat summary (unit stats: move, attack, defense, range) as today.
   - Includes a clear **tool section** that describes the two tools and when to use them:
     - `plan_route(unitId, destination, options?)` — compute optimal path for a unit to a destination; returns multi-turn route with per-turn waypoints.
     - `check_distance(from, to, unitType)` — quick distance and turn estimate between two hexes.
   - Instructs the LLM to use these tools for movement planning and to submit final orders as: `{ "strategy": "...", "movementOrders": [...], "rangedAttacks": [...] }` with `toXY` and `targetXY` as `[lat, lng]`.  
   Keep the preamble that positions use `[lat, lng]` and that the model must reply with valid JSON only.

2. **User message:**  
   Keep the user message short: e.g. ask for the final orders JSON after using tools as needed. Do not duplicate the full unit/move lists in the user message.

3. **Remove old prompt content:**  
   Remove from the prompt builder:
   - Per-unit "can move to: ..." and "Pursuit: ..." lines.
   - Any large list of valid move destinations.  
   The spec is explicit: "The base prompt should include only: the unit roster (ID, type, position as [lat, lng]) for both sides, the current turn number, and the game objective. All tactical analysis and movement planning flows through the tools."

4. **Wire to requestOrders:**  
   Ensure `requestOrders` uses the new prompt builder when building the first message in the tool loop (Phase 3). No code path should still send the old long move list.

**Verification:**

- Run a game; capture or log the system prompt (or first request). Confirm it does not contain "can move to" or "Pursuit" and does contain the tool descriptions and unit roster with [lat, lng] only.
- Play at least one full turn with an AI model that supports tools; confirm the AI can call plan_route/check_distance and still submit valid orders (manual or automated check of logs).

**Exit condition:** Prompt is tool-centric; movement planning is done via tools only. No regression in order submission or resolution.

---

## Phase 5: Logging, Errors, and Documentation

**Goal:** Ensure tool calls are logged for debugging and future AI observatory; tool errors are surfaced clearly to the LLM; and the implementation is documented for future developers and later execution plans.

**Tasks:**

1. **Tool call logging:**  
   For every tool invocation in the loop: log at debug level (e.g. turn number, player id if applicable, tool name, and a short summary of arguments). For every tool result: log status and, if error, the error message. Do not log full game state or full response payloads unless at a trace level or behind a feature flag. The spec: "Log all tool calls. Every tool call and response should be logged with the turn number and player ID."

2. **Error responses to the LLM:**  
   When a tool returns `status: "error"`, the content sent back to the LLM must include the `error` string so the model can adapt (e.g. "Unit not found: opponent-armor-1", "No path exists — destination is unreachable"). Ensure the tool result message content is the JSON string of the full response object (including status and error).

3. **Next-turn warning injection:**  
   Implement the injection of the max-iterations warning into the next turn’s system prompt when the previous turn hit the 10-iteration cap. Store this in a way that the prompt builder can read it (e.g. a small per-game or per-session state that is cleared after being used once in the prompt).

4. **Documentation:**  
   - In this execution plan or in a short README/spec section: state that only models that support native tool use are supported for the AI opponent; list Tool 1 tools (plan_route, check_distance); state the 10-round max and the behavior when the limit is exceeded.  
   - In code: orienting comments for the main entry points (e.g. requestOrders with tools, tool dispatcher, pathfinding entry). Point to the MCP tools spec for the exact tool schemas and response formats.

5. **Compliance check:** Confirm that all new and updated public methods in pathfinding, Tool 1, and the OpenRouter tool loop satisfy the logging and orienting-comment rules in **Compliance with Project Rules** (debug for invocations, error for caught exceptions, trace for getters; orienting comments on public non-overriding methods).

**Verification:**

- Trigger a tool error (e.g. plan_route with invalid unitId): confirm logs show the call and the error; confirm the LLM receives a tool result containing the error message.
- Trigger max iterations (e.g. mock or force 10 tool rounds): confirm next turn’s prompt contains the warning text.
- Read the added comments and docs; confirm a future developer can see how Tool 1 and the tool loop fit together.

**Exit condition:** Logging and error handling meet the spec; next-turn warning works; documentation is in place.

---

## Verification Summary

| Phase | Verification |
|-------|--------------|
| 1     | Pathfinding and snapping unit tests; BFS and partitioning behave correctly on a small map. |
| 2     | Tool 1 unit and integration tests; plan_route and check_distance return spec-compliant responses. |
| 3     | Tool-calling loop runs with OpenRouter; tool_calls executed and results appended; final orders parsed and applied; max-iterations behavior. |
| 4     | System prompt no longer contains per-unit move lists; includes tool descriptions and roster only; AI can complete a turn using tools. |
| 5     | Tool calls and errors logged; next-turn warning injected when cap hit; docs and comments updated. |

---

## Dependencies and File Layout (Suggested)

- **Pathfinding:** New module (e.g. `src/main/pathfinding.ts` or `src/main/tools/pathfinding.ts`) with BFS, partition, and distance helpers; depends on `h3-js`, map hex list, and terrain. No dependency on OpenRouter or gameDb beyond the types/snap used by callers.
- **Tool 1:** New module (e.g. `src/main/tools/tool1Pathfinding.ts` or `mcpTools/planRoute.ts` + `checkDistance.ts`) that takes GameStateSnapshot and coordinate map, implements plan_route and check_distance, and exposes a small dispatcher (e.g. `executeTool(name, args, state, coordMap)`).
- **OpenRouter:** Extend `src/main/openRouter.ts`: add tool definitions for Tool 1, implement the request/response loop with tool_calls handling, call the tool dispatcher, use the new prompt builder. Keep existing validation and order application.
- **Prompt:** New or refactored function in openRouter (or a dedicated prompt module) that builds the tool-style system prompt and the short user message.

Package boundaries: pathfinding has no knowledge of "tools" or "LLM"; Tool 1 knows game state and pathfinding; OpenRouter knows Tool 1’s dispatcher and prompt.

---

## References

- [Strategic Development Plan](development-plan.md) — Milestone 0.5.
- [MCP Tool Services Design Specification](mcp-tools-spec.md) — Tool 1 (§ Pathfinding and Movement Planning), Integration Architecture, System Prompt Integration, Implementation Notes.
- OpenRouter: [Tool Calling](https://openrouter.ai/docs/features/tool-calling), [API Reference](https://openrouter.ai/docs/api-reference/responses-api/tool-calling) for request/response shape.
- h3-js: `gridDistance`, `gridDisk`, `cellToLatLng`; map data and resolution from `mapData.ts`.
