# MCP Tool 4 (Strategic Memory) — Execution Plan

**Audience:** Coding agent implementing the feature  
**Version:** 1.1  
**Source:** [mcp-tools-spec.md](mcp-tools-spec.md) — Tool 4: Strategic Memory (§Tool 4), System Prompt Integration, Implementation Priority  
**Goals:** Implement Tool 4 (Strategic Memory): `memory_write`, `memory_read`, `memory_delete`; persistent and stored tiers with limits (5 persistent, 15 stored); context injection at the start of each AI turn (when Memory is enabled); and a dedicated **Memory** toggle and label in the Tools tab alongside Planning, Assessment, and Estimation.

**Clarifications (v1.1):** (1) All memory logic lives in the Tool 4 module (`src/main/tools/tool4Memory.ts`) — storage access, expire/trigger, CRUD, and injection text builder. (2) When the Memory tool group is disabled, do **not** inject the memory section; the prompt must remain coherent (no memory block, no reference to strategic memory in that case). (3) Implement Tool 4 with the same patterns as Tools 1–3 (module location, export shape, executeTool4 signature, response shape, logging).

---

## 0. Stated Goals Checklist

| # | Stated need | Where the plan addresses it |
|---|-------------|-----------------------------|
| 1 | Tool 4: Strategic Memory (memory_write, memory_read, memory_delete) | §1.1; Phases 2–3 (tool module, schemas, dispatch). |
| 2 | Two-tier design: persistent (5) and stored (15); injection of persistent + triggered reminders | §1.2; Phase 1 (storage, expire/trigger, injection builder); Phase 3 (prompt injection). |
| 3 | Memory has its own toggle and label in the UI | §1.3; Phase 4 (registry + renderer: id `memory`, label "Memory"). |
| 4 | Label for this tool in the UI is "Memory" | §1.3; Phase 4 (registry label, renderer fallback). |
| 5 | Reliable, understandable code; independently verifiable phases | §0b; Phases 1–5 with clear contracts and verification steps. |

---

## 0b. Compliance with Stated Needs and Workspace Rules

- **Phases are independently verifiable:** Phase 1 adds DB table and Tool 4 module (expire, trigger, CRUD, injection text); verifiable via unit tests and a manual injection check. Phase 2 adds the tool dispatcher (TOOL4_NAMES, executeTool4) and its tests. Phase 3 wires registry, tool definitions, dispatch, and system-prompt injection; verifiable by running AI with Memory enabled. Phase 4 adds the Memory toggle and label; verifiable in the UI. Phase 5 covers edge cases and logging/comments.
- **Reliability and clarity:** Each phase defines clear contracts (DB schema, tool request/response shapes, injection format). Single place for tier limits (5/15), content limit (500), key pattern.
- **Future-developer clarity:** Orienting comments for all new public methods; memory injection format and ordering (expire → trigger → inject) documented.

Alignment with **workspace Code-Generation-Rules**:

| Rule | How the plan addresses it |
|------|----------------------------|
| **1. Reliable, understandable code** | Phases order: DB + tool module (expire, CRUD, injection) first, then dispatcher, then integration and UI. Tier limits and validation in one place. |
| **2. Logging** | All new public method invocations → debug; caught exceptions → error; getter-style → trace. Use existing logger APIs. |
| **3. Testing** | Happy path and essential failure cases only (tier full, key invalid, content empty/over limit, not found). No tests for REST/IPC boilerplate. |
| **4. Orienting comments** | New/updated public non-overriding methods get orienting comments (purpose, when to use, results and exceptions). |
| **5. Spec/docs in .spec** | This plan lives in `.spec`; references mcp-tools-spec.md. |
| **6. Reusable code** | Reuse TOOL_GROUP_REGISTRY pattern, buildToolDefinitions/getFilteredToolMetadata, and tool-dispatch chain; add TOOL4_NAMES and executeTool4. |

---

## 1. Scope and Prerequisites

### 1.1 What is being built

1. **Storage:** SQLite table `ai_memory` per spec (player_id, key, content, tier, created_turn, expires_turn, recurring_interval, next_trigger_turn, last_triggered_turn, tags). Created in the same DB init path as existing tables.
2. **Tool 4 module (single home for memory):** All memory logic lives in `src/main/tools/tool4Memory.ts`: expire, process recurring, CRUD with tier limits (5 persistent, 15 stored), and the injection text builder. Same file exports `TOOL4_NAMES` and `executeTool4`; no separate "memory service" or aiMemory module.
3. **Tool 4 API:** `memory_write`, `memory_read`, `memory_delete` with spec request/response schemas. Validation: content length 500, key pattern `^[a-zA-Z0-9_-]+$` max 64 chars, empty content rejected, tier-full errors.
4. **Integration:** Register Tool 4 in the tool group registry with id `memory` and label **"Memory"**; add tool metadata and dispatch in openRouter; when Memory is **enabled**, inject the memory block into the system prompt at the start of each AI turn (after expire/trigger). When Memory is **disabled**, do not inject any memory section — the prompt must remain coherent without it.
5. **UI:** Memory appears in the Tools tab with its own toggle and label "Memory" (same pattern as Planning, Assessment, Estimation).

### 1.2 Two-tier design and injection

- **Persistent tier (limit 5):** Injected into the system prompt every turn (full content). Used for active strategic plan and key assessments.
- **Stored tier (limit 15):** Not injected; retrieved only via `memory_read` (by key, tags, or tier) or via scheduled reminders. Triggered reminders appear in the injection under `[REMINDERS TRIGGERED THIS TURN]`.
- **Injection only when Memory enabled:** The memory block is injected only when the Memory tool group is enabled. When Memory is disabled, do **not** inject any strategic-memory section; the rest of the prompt (game context, combat rules, AVAILABLE TOOLS for the enabled groups only, unit rosters, order format) must read coherently with no reference to "your strategic memory" or memory slot counts.
- **Injection order (when Memory enabled):** (1) Delete memories where `expires_turn <= currentTurn`. (2) For memories with `recurring_interval` and `next_trigger_turn <= currentTurn`, set `last_triggered_turn = currentTurn` and `next_trigger_turn = currentTurn + recurring_interval`. (3) Build injection block: persistent list + triggered reminders; append footer with slot counts. (4) Insert this block into the system prompt immediately after the opening game context and before `=== AVAILABLE TOOLS ===`.
- **Player ID:** All memory is scoped to the AI player; use constant `'opponent'` (same as elsewhere in openRouter/tools).

### 1.3 UI: Toggle and label for Memory

- **Registry:** Add one entry to `TOOL_GROUP_REGISTRY`: `{ id: 'memory', label: 'Memory', toolNames: TOOL4_NAMES }`.
- **Tools tab:** Tool groups are driven by `getToolGroupList()` (or renderer fallback). Adding Memory to the registry ensures one row: label **"Memory"** and a toggle showing invocation count, same behavior as Planning/Assessment/Estimation (enable/disable group; count resets on Ready).
- **Default:** Memory group starts **enabled** (same as other groups).

### 1.4 Prerequisites (must already exist)

- MCP Tool 1 (Pathfinding), Tool 2 (Assessment), Tool 3 (Combat Estimation) implemented and wired (TOOL_GROUP_REGISTRY, buildToolDefinitions, tool loop with executeTool1/2/3).
- gameDb: `initDatabase()`, `dbRun`, `dbGetOne`, `dbGetAll`, `saveDatabase()`, `getGameState()`.
- openRouter: `requestOrders()`, `buildSystemPromptForTools()`, tool dispatch by TOOL*_NAMES, `getToolGroupList()`.
- Renderer: Tools tab built from `getToolGroupList()` (or OPENROUTER_TOOL_GROUPS fallback); toggle + label per group.

### 1.5 Out of scope

- Tool 5 (Standing Orders); memory injection is independent of standing order status injection.
- Persisting tool enablement across app restarts (defaults only).
- Fog of war or multi-player memory (single AI player only).

### 1.6 Implementation decisions (v1.1)

1. **Memory lives in the tool module.** All memory logic (storage access, expire/trigger, CRUD, injection text) lives in `src/main/tools/tool4Memory.ts`. There is no separate `aiMemory.ts` or memory service module; gameDb only gains the `ai_memory` table.
2. **No injection when Memory is disabled.** When the Memory tool group is off, do not inject any strategic-memory section. The prompt must remain coherent (no memory block, no mention of memory slots or "your strategic memory").
3. **Consistency with other tools.** Same layout as Tool 1–3: one module under `src/main/tools/`, same execute signature `(toolName, args, state, latLngByH3, resolveToH3)`, same response shape (status, error, …), same logging and orienting-comment rules.

---

## 2. Design Clarifications

### 2.1 Where memory logic lives

- **gameDb:** Add `CREATE TABLE ai_memory (...)` in `initDatabase()`. Do **not** export memory-specific APIs from gameDb; keep gameDb as generic persistence. The Tool 4 module imports and uses existing `dbRun`, `dbGetOne`, `dbGetAll`, and `saveDatabase()` from gameDb.
- **Tool 4 module only (`src/main/tools/tool4Memory.ts`):** All memory logic lives here: expire, process recurring, CRUD with tier limits and validation, and the injection text builder. The same module exports `TOOL4_NAMES` and `executeTool4(toolName, args, state, latLngByH3, resolveToH3)` for consistency with Tools 1–3 (Tool 4 may ignore latLngByH3/resolveToH3). No separate "memory service" or `aiMemory.ts`; one module for the feature.

### 2.2 Expire and recurring order

- **Order:** First expire (DELETE WHERE expires_turn <= currentTurn). Then process recurring (SELECT WHERE recurring_interval IS NOT NULL AND next_trigger_turn <= currentTurn; for each row UPDATE last_triggered_turn = currentTurn, next_trigger_turn = currentTurn + recurring_interval). Then build injection from current state (all persistent + all rows that were just triggered; for "triggered this turn" we can use last_triggered_turn = currentTurn after the update).
- **Idempotency:** Expire and recurring run once per turn at the start of the AI planning phase (e.g. when `requestOrders` is called). Same turn number must not run twice; the caller (openRouter) invokes once per request.

### 2.3 Injection format and when to inject

- **When Memory is enabled:** Follow spec exactly: section title `=== YOUR STRATEGIC MEMORY (Turn N) ===`, then `[PERSISTENT — your active strategic context]` with bullet list `• key (set turn X): "content"`, then `[REMINDERS TRIGGERED THIS TURN]` with bullets for triggered (stored or persistent recurring), then footer `Persistent: X of 5 slots used. Stored: Y of 15 slots used. Use memory_write to store or update...` If there are zero persistent and zero triggered reminders, still include the section with empty lists and the footer so the AI knows the feature exists and slot counts.
- **When Memory is disabled:** Do **not** inject any memory block. Do not run expire/trigger for the prompt when Memory is disabled (optional: could still run for DB hygiene, but do not add any memory text to the prompt). The system prompt must be coherent: it contains only game context, combat rules, the AVAILABLE TOOLS section for the enabled groups (which will not include memory_write/memory_read/memory_delete), unit rosters, and order format — with no mention of strategic memory or slot counts.

### 2.4 Tool response and errors

- **memory_write:** On success return `action: "created"` or `"updated"`; include persistentCount, persistentLimit, storedCount, storedLimit. On tier full: `status: "error"`, `error: "Persistent memory full (5/5)..."` or `"Stored memory full (15/15)..."`. Content empty: `"Content cannot be empty"`. Content > 500: `"Content exceeds 500 character limit (N characters provided)"`. Key invalid: `"Key must be alphanumeric with underscores and hyphens only"`.
- **memory_read:** Key that doesn't exist: `status: "error"`, `error: "Memory not found: {key}"`. No key and no tags/tier/all: `status: "error"`, `error: "memory_read requires at least one of: key, tags, tier, or all"`. Tags that match nothing: `status: "ok"`, `memories: []`.
- **memory_delete:** Key that doesn't exist: `status: "error"`, `error: "Memory not found: {key}"`.

### 2.5 Upsert and tier move

- memory_write with existing key: replace content, tier, and options (upsert). If tier changes, move between tiers; destination tier must have room (after decrementing source tier). If destination is full, return tier-full error.

---

## 3. Phased Implementation Plan

---

### Phase 1: Database table and Tool 4 module (expire, trigger, CRUD, injection text)

**Goal:** Add `ai_memory` table and the Tool 4 module (`tool4Memory.ts`) containing all memory logic: expire, recurring trigger, CRUD with tier limits, and injection text builder. No openRouter wiring yet; tool execution can be unit-tested.

**Tasks:**

1. **gameDb — schema**
   - In `initDatabase()`, after existing `CREATE TABLE` statements, add:
     - `CREATE TABLE IF NOT EXISTS ai_memory (player_id TEXT NOT NULL, key TEXT NOT NULL, content TEXT NOT NULL, tier TEXT NOT NULL DEFAULT 'stored', created_turn INTEGER NOT NULL, expires_turn INTEGER, recurring_interval INTEGER, next_trigger_turn INTEGER, last_triggered_turn INTEGER, tags TEXT NOT NULL DEFAULT '[]', PRIMARY KEY (player_id, key));`
   - No new exports from gameDb; the Tool 4 module uses `dbRun`, `dbGetOne`, `dbGetAll` and `saveDatabase()`.

2. **Tool 4 module (`src/main/tools/tool4Memory.ts`)**
   - Create the single module that will host all memory behavior (consistent with tool1Pathfinding, tool2Assessment, tool3CombatEstimation: one file per tool group). Implement:
     - **Constants:** PERSISTENT_LIMIT = 5, STORED_LIMIT = 15, CONTENT_MAX_LENGTH = 500, KEY_PATTERN = /^[a-zA-Z0-9_-]+$/, KEY_MAX_LENGTH = 64. AI player id = `'opponent'`.
     - **expireAndProcessRecurring(playerId, currentTurn):** (a) DELETE FROM ai_memory WHERE player_id = ? AND expires_turn IS NOT NULL AND expires_turn <= ?. (b) Select rows WHERE player_id = ? AND recurring_interval IS NOT NULL AND next_trigger_turn <= ?; for each, UPDATE last_triggered_turn = currentTurn, next_trigger_turn = currentTurn + recurring_interval. Call saveDatabase() after mutations. Log at debug.
     - **getInjectionText(playerId, currentTurn):** Call expireAndProcessRecurring first. Then select persistent-tier memories for playerId; select memories for playerId where last_triggered_turn = currentTurn (triggered this turn). Format per spec (§Tool 4 Context Injection). Return the full section string (with at least the footer when there are no memories). Used only when Memory is enabled; caller (openRouter) must not call when Memory is disabled.
     - **write(playerId, key, content, tier, options, currentTurn):** Validate key (pattern + length), content (non-empty, length). When options.recurring is present and nextTurn is omitted, set next_trigger_turn = currentTurn + intervalTurns (per spec default). currentTurn is required when recurring is used without nextTurn; pass state.turnNumber from executeTool4. Check tier counts; if destination tier full after upsert logic, return error. Upsert: INSERT or UPDATE; if key exists and tier changes, decrement old tier count and increment new (check new tier has room). Return { status, key, tier, action, persistentCount, persistentLimit, storedCount, storedLimit } or error. Call saveDatabase().
     - **read(playerId, key?, tags?, tier?, all?):** If key provided, return single memory or error "Memory not found: {key}". If tags/tier/all, build query and return array (empty array if no matches). Response shape per spec (memories array with key, content, tier, createdOnTurn, lastTriggered, recurring?, tags). Parse the `tags` column (stored as JSON array in DB) when building response objects; use camelCase in responses (createdOnTurn, lastTriggered) per spec.
     - **delete(playerId, key):** Delete by player_id and key; if no row deleted, return error "Memory not found: {key}". Else return { status, key, deleted: true }. Call saveDatabase().
   - All public functions: orienting comment; log debug on entry for mutating paths, trace for read-only where appropriate; on catch log error. Do not export executeTool4 or TOOL4_NAMES until Phase 2; Phase 1 can export only the helpers above plus getInjectionText.

3. **Unit tests (optional in Phase 1, or with Phase 2)**
   - Test expire, recurring, tier limits, getInjectionText content as above.

**Verification:**

- New game creates DB with `ai_memory` table. Tool 4 module write/read/delete and getInjectionText produce expected results; injection string contains the expected sections and footer when called directly.

---

### Phase 2: Tool 4 dispatcher (TOOL4_NAMES, executeTool4)

**Goal:** Add the tool dispatcher and spec-compliant request/response for memory_write, memory_read, memory_delete in the same module, reusing the Phase 1 helpers.

**Tasks:**

1. **TOOL4_NAMES and executeTool4**
   - In `tool4Memory.ts`, export `TOOL4_NAMES = ['memory_write', 'memory_read', 'memory_delete'] as const`.
   - **executeTool4(toolName, args, state, latLngByH3, resolveToH3):** Use the **same signature** as executeTool1, executeTool2, executeTool3 for consistency (Tool 4 may ignore latLngByH3 and resolveToH3). state has `turnNumber`; playerId = `'opponent'`. Parse args per spec:
     - **memory_write:** key (required), content (required), tier (optional, default `'stored'`), options (expiresOnTurn, recurring: { intervalTurns, nextTurn? }, tags). When recurring.nextTurn is omitted, pass state.turnNumber so write() can default next_trigger_turn to currentTurn + intervalTurns. Validate content length 500, key pattern and length 64, non-empty content. Call the module’s write(..., state.turnNumber); return spec response or error.
     - **memory_read:** key?, tags?, tier?, all?. If key provided, single read; else query by tags/tier/all. Return { status, memories } or error "Memory not found: {key}" when key specified and missing.
     - **memory_delete:** key (required). Call the module’s delete(); return spec response or error.
   - Return shape: same pattern as other tools — object with `status` ("ok" or "error"), `error` (null when ok), and tool-specific fields. Log debug at entry; on catch log error and return { status: 'error', error: String(err) }. Orienting comment for executeTool4.

2. **Response shapes**
   - Write: `{ status, key, tier, action: 'created'|'updated', persistentCount, persistentLimit, storedCount, storedLimit }` or `{ status: 'error', error }`.
   - Read: `{ status, memories: [{ key, content, tier, createdOnTurn, lastTriggered, tags, recurring? }] }` or error.
   - Delete: `{ status, key, deleted: true }` or error.

3. **Unit tests**
   - Happy path: write persistent, write stored, read by key, read by tag, read all; delete by key.
   - Essential failures: write with empty content → error; write with content length > 500 → error; write with invalid key → error; read missing key → error; delete missing key → error; persistent full → error; stored full → error.

**Verification:**

- Unit tests pass. No integration with openRouter yet; tool can be exercised via tests only.

---

### Phase 3: Registry, tool definitions, dispatch, and system-prompt injection

**Goal:** Register Tool 4 in the tool group registry; add tool metadata for memory_write, memory_read, memory_delete; dispatch Tool 4 in the tool loop; inject memory block into the system prompt at the start of each AI turn.

**Tasks:**

1. **Registry and tool metadata**
   - In `openRouter.ts`, import `TOOL4_NAMES` and `executeTool4` from the Tool 4 module.
   - Add to `TOOL_GROUP_REGISTRY`: `{ id: 'memory', label: 'Memory', toolNames: TOOL4_NAMES }`.
   - Add to `ALL_TOOL_METADATA` the three tools with name, description, parameters (per spec), and promptLine. Use the same pattern as existing tools (OpenRouter function schema: name, description, parameters with properties/required).

2. **Tool loop dispatch**
   - In the tool-call handling loop, extend the chain: if `TOOL4_NAMES.includes(toolName)` then call `executeTool4(toolName, args, state, latLngByH3, resolveToH3)` (same signature as executeTool1/2/3). Append result to messages and increment toolInvocationCounts for group `memory` via existing getGroupIdForToolName.

3. **System prompt injection (only when Memory enabled)**
   - **Detecting Memory enabled:** When `enabledToolNames` is undefined, all tools are enabled (include memory injection). When `enabledToolNames` is defined, include memory injection only if at least one of `TOOL4_NAMES` is in `enabledToolNames` (same set already passed to `buildSystemPromptForTools` and `buildToolDefinitions`).
   - **When Memory is enabled:** Call `getInjectionText('opponent', state.turnNumber)` from the Tool 4 module and insert the returned string into the system prompt after the opening game context and before `=== AVAILABLE TOOLS ===`. Do this inside `buildSystemPromptForTools(state, coordMap, enabledToolNames)` or immediately after it when assembling the full prompt, so the insertion point has access to `enabledToolNames`. Document the insertion point (e.g. comment: "Strategic memory injection: persistent memories and reminders for this turn (only when Memory tool group is enabled)").
   - **When Memory is disabled:** Do **not** call getInjectionText and do **not** add any memory block. The prompt must remain coherent: only game/combat/units/order content and the AVAILABLE TOOLS section for the enabled groups, with no reference to strategic memory or memory slots.
   - **Expire/trigger timing:** Expire and recurring-update run only when getInjectionText is called (i.e. when Memory is enabled). If Memory is disabled for several turns, the next time it is re-enabled, getInjectionText will run and expire/trigger for the current turn, so any overdue expirations or triggers are applied then.

**Verification:**

- Start a game, enable Memory tool, run AI: system prompt should contain the memory section. Call memory_write via the model (or a test that invokes requestOrders and triggers a tool call); response should be spec-compliant. Invocation count for Memory should increment in the UI once the rest of the flow is present (Phase 4).

---

### Phase 4: UI — Memory toggle and label

**Goal:** The Tools tab shows Memory with label "Memory" and its own toggle (and count), same as Planning, Assessment, Estimation.

**Tasks:**

1. **Main process**
   - Registry already includes `{ id: 'memory', label: 'Memory', toolNames: TOOL4_NAMES }`. Ensure `getToolGroupList()` returns this entry so the renderer receives four groups.

2. **Renderer**
   - If the Tools tab is built from `getToolGroupList()`, no change needed beyond ensuring the list is refreshed (e.g. on init or when opening the panel); the new group appears automatically.
   - If the renderer uses a fallback constant (e.g. `OPENROUTER_TOOL_GROUPS`), add `{ id: 'memory', label: 'Memory' }` to that fallback array so that when main is not available or list is not yet fetched, the Memory row still appears with label "Memory". Order: keep Memory after Estimation (planning, assessment, estimation, memory).

3. **Defaults**
   - Memory group default enabled (all groups enabled by default). No change required if the default is "all groups from registry enabled."

**Verification:**

- Open the Tools tab: four rows appear (Planning, Assessment, Estimation, Memory). Each has a label and a toggle showing a count. Toggling Memory off excludes memory_write/memory_read/memory_delete from the request; toggling on includes them. Label text is exactly "Memory".

---

### Phase 5: Edge cases, logging, and comments

**Goal:** Handle all spec edge cases; ensure logging and orienting comments are complete; optional integration test.

**Tasks:**

1. **Edge cases**
   - memory_read with key that doesn’t exist → error "Memory not found: {key}".
   - memory_read with no key and no tags/tier/all (or all omitted) → error (e.g. "memory_read requires at least one of: key, tags, tier, or all"); do not return empty array so the LLM gets a clear contract.
   - memory_read with tags matching nothing → status ok, memories: [].
   - memory_delete with key that doesn’t exist → error "Memory not found: {key}".
   - memory_write with empty content → error "Content cannot be empty".
   - memory_write with content > 500 chars → error with character count.
   - memory_write with key failing pattern or key length > 64 → error "Key must be alphanumeric with underscores and hyphens only".
   - Tier full (persistent 5/5 or stored 15/15) → appropriate error message (exact strings per spec §Tool 4 Implementation Notes).
   - Upsert changing tier: destination tier must have room; otherwise tier-full error.

2. **Logging**
   - All new public method invocations: debug. Caught exceptions: error. Pure getters (e.g. read-only helpers): trace. Use existing logger (e.g. logDebug, logError, logTrace from main logger).

3. **Orienting comments**
   - Every new public non-overriding function: orienting comment (why it exists, when to use it, what it returns and what errors it can return or throw).

4. **Tests**
   - Ensure unit tests cover the essential failure cases above. No tests for openRouter requestOrders itself beyond what’s needed to confirm Memory is callable when enabled. Follow the same test structure as other tools (§6); use a DB with the same ai_memory schema as production for Tool 4 tests.

**Verification:**

- All edge-case tests pass. Logs show debug for tool invocations and error for invalid inputs. Code review: orienting comments present on all new public methods.

---

## 4. Contract Summary

| Item | Contract |
|------|----------|
| **ai_memory table** | player_id, key, content, tier, created_turn, expires_turn, recurring_interval, next_trigger_turn, last_triggered_turn, tags; PRIMARY KEY (player_id, key). |
| **Tier limits** | Persistent 5, stored 15. Tier-full returns spec error string. |
| **Content** | Max 500 characters; empty content → error. |
| **Key** | Pattern `^[a-zA-Z0-9_-]+$`, max 64 characters. |
| **memory_write** | Upsert by (player_id, key). Returns action created/updated and slot counts. |
| **memory_read** | By key (single or error) or by tags/tier/all (array, possibly empty). |
| **memory_delete** | By key; error if not found. |
| **Injection** | Only when Memory tool group is enabled: expire → process recurring → build text; insert into system prompt before AVAILABLE TOOLS. When Memory is disabled, no memory block is injected; prompt stays coherent. Format when enabled: persistent list, reminders triggered this turn, footer with slot counts. |
| **Tool group** | id `memory`, label `Memory`; own toggle and count in Tools tab; default enabled. |

---

## 5. Open Questions / Clarifications

- **DB lifecycle:** Current initDatabase() recreates the DB on every startup (unlinks file). Adding ai_memory in the same block is sufficient. If the project later keeps the DB across restarts, the table will already exist.
- **Consistency with other tools:** Tool 4 follows the same patterns as Tools 1–3: single module under `src/main/tools/` (tool4Memory.ts), exported TOOL4_NAMES and executeTool4(toolName, args, state, latLngByH3, resolveToH3), response object with status and error, debug/trace/error logging per workspace rules. Tool 4 ignores latLngByH3 and resolveToH3 but accepts them for a uniform dispatch signature.

---

## 6. Resolved decisions

1. **Expire/trigger when Memory is disabled:** Keep the current approach. Expire and recurring-update run only when Memory is enabled (inside `getInjectionText`). When Memory is re-enabled after being off for several turns, one run applies any overdue expirations and triggers; no need to run expire/trigger every turn regardless of enable state.
2. **Unit test approach:** Favor consistency with other tools. Tool 1–3 tests use in-memory state snapshots and do not touch the DB. Tool 4 needs a database for `ai_memory`. Use the same test structure as other tool tests (one test file per tool, happy path + essential failure cases, assert on tool output). For Tool 4, tests must create or use a DB with the `ai_memory` schema—e.g. the same schema as in `initDatabase()` (in-memory sql.js with `ai_memory` table) so behavior matches production; follow any existing project pattern for test DB setup so Tool 4 tests stay consistent with the rest of the codebase.

---

**End of execution plan.**
