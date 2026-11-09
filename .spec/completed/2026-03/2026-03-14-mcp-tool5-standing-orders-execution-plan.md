# MCP Tool 5 (Standing Orders) — Execution Plan

**Audience:** Coding agent implementing the feature  
**Version:** 1.2  
**Source:** [mcp-tools-spec.md](mcp-tools-spec.md) — Tool 5: Standing Orders (§Tool 5), System Prompt Integration, Implementation Priority; assess_unit `currentStandingOrder` (§Tool 2)  
**Goals:** Implement Tool 5 (Standing Orders): `assign_order`, `query_orders`, `cancel_order`; persistent standing orders in SQLite; per-turn status update and concrete order generation; standing order status injection; merge of standing-order-generated orders with LLM explicit orders in the requestOrders pipeline; and a dedicated **Orders** toggle and label in the Tools tab. Wire Tool 2's `currentStandingOrder` to Tool 5 data once Tool 5 exists.

**Clarifications:** (1) Standing orders take effect **next turn** — assign_order in the current planning phase does not generate a movement/attack for the current turn; the engine generates orders from standing orders at the **start** of each AI planning phase. (2) When the Orders tool group is disabled, do **not** inject standing order status and do **not** generate or merge standing-order orders; AI orders are then only the LLM's explicit orders. (3) Tool 5 depends on Tool 1 (pathfinding/BFS) for march, pursue, and patrol; reuse or call Tool 1's logic from the Tool 5 module or a shared layer. (4) UI label for this tool is **"Orders"** (id `orders`).

---

## 0. Stated Goals Checklist

Your stated needs (from the implementation request) and where the plan addresses them:

| # | Stated need | Where the plan addresses it |
|---|-------------|-----------------------------|
| 1 | Implement milestone 0.5, tool #5 (Standing Orders) | §1.1; Phases 1–4 (assign_order, query_orders, cancel_order; storage; generation; integration; registry and UI). |
| 2 | Phases organized for maximum reliability and clarity | §0b; Phases 1–5 with inputs/outputs, numbered steps, and verification; each phase verifiable with or without prior phases. |
| 3 | Each phase independently verifiable or verifiable with previously completed phases | Phase 1 (unit tests, DB table); Phase 2 (unit tests, order generation); Phase 3 (integration test / manual); Phase 4 (UI inspection); Phase 5 (edge-case tests, assess_unit). |
| 4 | Generated code reliable and understandable for future developers | §0b rules 1 and 4; orienting comments; single module; reuse Tool 1; double-check first-time code. |
| 5 | New tool has its own toggle and label along with other tools | §1.3; Phase 4 (TOOL_GROUP_REGISTRY, renderer fallback, same row pattern as Planning, Assessment, Estimation, Memory). |
| 6 | Label for this tool in the UI is "Orders" | §1.3; Phase 4 (registry label `"Orders"`, id `orders`; renderer fallback and getToolGroupList). |

---

## 0b. Compliance with Stated Needs and Workspace Rules

- **Phases are independently verifiable:** Phase 1 adds DB table and Tool 5 module (storage, assign/query/cancel, injection text builder; no order generation yet) — verifiable via unit tests. Phase 2 adds per-turn status update and order generation (march, defend, pursue, patrol, hold_fire) using Tool 1 pathfinding where needed — verifiable via unit tests with mock state. Phase 3 wires the per-turn sequence into requestOrders (expire → generate → inject → LLM → merge) and merges standing-order orders with LLM explicit orders — verifiable by running AI with Orders enabled. Phase 4 adds registry, tool definitions, dispatch, and UI (Orders toggle and label). Phase 5 wires assess_unit currentStandingOrder, edge cases, logging, and comments.
- **Reliability and clarity:** Each phase defines clear contracts (DB schema, request/response shapes, per-turn sequence order). Single place for standing order types and status values; order generation logic in one module.
- **Future-developer clarity:** Orienting comments for all new public methods; per-turn sequence (steps 1–5) documented in openRouter and Tool 5 module.

Alignment with **workspace Code-Generation-Rules**:

| Rule | How the plan addresses it |
|------|----------------------------|
| **1. Reliable, understandable code** | Phases order: DB + tool module (CRUD + injection) first, then order generation, then requestOrders integration, then UI. Reuse Tool 1 for routes. **Implementer:** Double-check all first-time generated code for correctness and clarity. |
| **2. Logging** | All new public method invocations → **debug** with reasonable detail for troubleshooting; caught exceptions → **error**; getter-style (no state change) → **trace**. Use existing logger APIs. Do not check log level before calling the logger unless building a potentially large string inline with the call. |
| **3. Testing** | Happy path and essential failure cases only (unit not found, target not found, patrol &lt; 2 waypoints, cancel no order, etc.). Test code contracts, not implementation details. No tests for IPC handlers, DTOs, or delegation boilerplate. |
| **4. Orienting comments** | New/updated public non-overriding methods get orienting comments: why the method exists, when to use it, how to use it, and what to expect (results and exceptions). Interface/contract methods focus on contracts; implementation methods on high-level details. |
| **5. Spec/docs in .spec** | This plan lives in `.spec`; references mcp-tools-spec.md. |
| **6. Reusable code** | Reuse TOOL_GROUP_REGISTRY pattern, buildToolDefinitions/getFilteredToolMetadata, tool-dispatch chain, and Tool 1 pathfinding (plan_route/BFS) for march/pursue/patrol. |

---

## 1. Scope and Prerequisites

### 1.1 What is being built

1. **Storage:** SQLite table `standing_orders` per spec (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex). Created in the same DB init path as existing tables.
2. **Tool 5 module:** All standing-order logic lives in `src/main/tools/tool5StandingOrders.ts`: CRUD (assign, query, cancel), expire/update status at start of turn, **generate concrete orders** (movement + ranged) from active standing orders, and the **injection text** builder. Same file exports `TOOL5_NAMES` and `executeTool5`. Route computation for march/pursue/patrol reuses Tool 1's pathfinding (import and call plan_route logic or a shared BFS helper).
3. **Tool 5 API:** `assign_order`, `query_orders`, `cancel_order` with spec request/response schemas. assign_order validates unit exists, type-specific params (e.g. march destination, patrol ≥2 waypoints), and for march computes route via Tool 1; stores order; returns spec response with computedRoute where applicable.
4. **Per-turn sequence (when Orders enabled):** At the start of `requestOrders` (before building the prompt): (1) Expire/update standing order statuses (remove orders for destroyed units, set arrived/blocked/target_destroyed etc.). (2) Generate provisional movement and ranged orders from each active standing order. (3) Inject standing order status into the system prompt. (4) Invoke LLM. (5) After LLM responds, merge: start with standing-order-generated orders; for each unitId in LLM's movementOrders (resp. rangedAttacks), replace any standing-order order for that unit with the LLM order; validate merged lists; return merged orders. When Orders is **disabled**, skip steps 1–2 and 5 (no standing-order generation or merge); injection step is also skipped.
5. **UI:** Orders appears in the Tools tab with its own toggle and label **"Orders"** (same pattern as Planning, Assessment, Estimation, Memory).
6. **Tool 2:** Once Tool 5 exists, `assess_unit` response includes `currentStandingOrder` from Tool 5 data (type and key details, or null if none). Until Tool 5 is implemented this remains null (already the case).

### 1.2 Per-turn sequence detail

- **Step 1 — Expire/update:** Delete standing orders for units that no longer exist. For march: if unit's current position equals destination, set status to `arrived`. For pursue: if target unit no longer exists, set status to `target_destroyed` and remove order (or mark cancelled). For other status transitions (e.g. blocked when route becomes impassable), update status. Persist changes (saveDatabase).
- **Step 2 — Generate orders:** For each remaining standing order (player_id = 'opponent'), compute this turn's movement and/or ranged order:
  - **defend:** If unit not at defendHex, generate one movement step toward defendHex (BFS, one turn's budget). If at defendHex and an enemy is within engageRange, generate one ranged attack against nearest enemy (if unit has range).
  - **march:** Recompute route from current position to destination (Tool 1 logic); take next step (one turn's movement); if engageEnRoute and enemy adjacent, add ranged attack. If route blocked, no movement (status already updated in step 1).
  - **pursue:** Resolve target's current position from state; compute route toward target; generate one movement step; if target in range, add ranged attack. If target_out_of_range or target_destroyed, no order (handled in step 1).
  - **patrol:** Advance toward next waypoint by one turn's movement; cycle waypoints. No attack orders.
  - **hold_fire:** No movement, no ranged.
- **Step 3 — Injection:** Build `=== STANDING ORDER STATUS (Turn N) ===` block per spec (bullet list per unit with order, status, turns remaining/next move; footer "Units without standing orders: ..." or "All units have standing orders."). Insert into system prompt when Orders is enabled (after memory block if present, before AVAILABLE TOOLS).
- **Step 4:** Unchanged (invoke LLM with tools).
- **Step 5 — Merge:** mergedMovement = standing-order movement orders; for each order in parsed.movementOrders, remove any standing-order entry for that unitId and add the LLM order. mergedRanged = standing-order ranged orders; for each order in parsed.rangedAttacks, remove any standing-order entry for that unitId and add the LLM order. Validate mergedMovement and mergedRanged (same validation as today); return merged result.

### 1.3 UI: Toggle and label for Orders

- **Registry:** Add one entry to `TOOL_GROUP_REGISTRY`: `{ id: 'orders', label: 'Orders', toolNames: TOOL5_NAMES }`.
- **Tools tab:** Adding Orders to the registry (and renderer fallback) ensures one row: label **"Orders"** and a toggle with invocation count. Default enabled (same as other groups).

### 1.4 Prerequisites (must already exist)

- Tool 1 (Pathfinding), Tool 2 (Assessment), Tool 3 (Combat Estimation), Tool 4 (Memory) implemented and wired.
- gameDb: initDatabase(), dbRun, dbGetOne, dbGetAll, saveDatabase(), getGameState().
- openRouter: requestOrders(), buildSystemPromptForTools(), tool dispatch by TOOL*_NAMES, getToolGroupList(), memory injection when Memory enabled.
- gameActions: ready(aiOrders, aiRangedOrders) merging AI orders with human pending_orders / pending_ranged_orders.
- Tool 1: plan_route (or equivalent BFS/route API) callable for a unit and destination so Tool 5 can compute march/pursue/patrol routes.

### 1.5 Out of scope

- Fog of war (target_lost after 3 turns unobserved); implement status field and injection text, but logic can assume full visibility.
- Persisting tool enablement across app restarts.

### 1.6 Implementation decisions

1. **Single module for Tool 5.** All standing-order logic (storage access, expire/update, CRUD, order generation, injection text) lives in `src/main/tools/tool5StandingOrders.ts`. gameDb only gains the `standing_orders` table; no standing-order-specific APIs exported from gameDb.
2. **Reuse Tool 1 for routes.** Tool 5 calls Tool 1's pathfinding (e.g. executeTool1('plan_route', ...) or a shared internal function that runs BFS and returns path/turn segments) for march, pursue, and patrol. Do not duplicate BFS logic.
3. **Orders disabled ⇒ no injection, no generation, no merge.** When the Orders tool group is disabled, requestOrders behaves as today: no standing order block in the prompt, no standing-order-generated orders, no merge step; only LLM explicit orders are used.
4. **New standing orders take effect next turn.** assign_order stores the order and returns the computed route; it does **not** add a movement order for the current turn. The system prompt text must state: "Standing orders take effect next turn. If you want the unit to act this turn, also issue an explicit movement or attack order."

---

## 2. Design Clarifications

### 2.1 Where standing order logic lives

- **gameDb:** Add `CREATE TABLE standing_orders (...)` in initDatabase(). No new exports; Tool 5 module uses dbRun, dbGetOne, dbGetAll, saveDatabase().
- **Tool 5 module (tool5StandingOrders.ts):** All logic: assign/query/cancel, expireAndUpdateStatus(playerId, state), generateOrdersForStandingOrders(playerId, state, latLngByH3, resolveToH3) returning { movementOrders, rangedAttacks }, getInjectionText(playerId, state). generateOrdersForStandingOrders needs access to game state (units, positions) and to Tool 1 pathfinding; state and coord helpers are passed in from openRouter when it runs the per-turn sequence.

### 2.2 Order generation and Tool 1

- For **march:** Get unit's current position and destination from standing order params; call Tool 1 plan_route (or internal BFS) from current position to destination; take the first turn's segment and set movement order to that segment's end hex. Store updated computed_route and status for next turn.
- For **pursue:** Resolve target unit's current h3 from state; call plan_route from unit to target's hex; advance one turn; optionally add ranged if in range.
- For **patrol:** Get next waypoint index from stored state (or compute from current position vs waypoints); route to next waypoint; advance one turn.
- **defend:** Move toward defendHex if not there (one step); if at defendHex, find enemies within engageRange (reuse Tool 2 range logic or simple distance check), pick nearest, add ranged attack if unit has range.

### 2.3 Merge semantics

- Merge is by unitId. Final movement list: all standing-order movement orders whose unitId is not in the LLM's movementOrders list, plus all LLM movement orders. Final ranged list: all standing-order ranged orders whose unitId is not in the LLM's rangedAttacks list, plus all LLM ranged attacks. Duplicate unitIds in LLM output are already handled by existing validation (e.g. drop duplicates); same rule applies to merged list.

### 2.4 Response shapes, status values, and errors (spec summary)

- **assign_order:** status ok with unitId, order (type, params, computedRoute for march/pursue), replacedOrder (if replaced). Errors: unit not found, pursue target not found, patrol &lt; 2 waypoints, waypoint impassable.
- **query_orders:** status ok with orders array (unitId, type, destination/defendHex/waypoints, turnsRemaining, nextMoveHex, status). If neither unitId nor all (true) provided, return error so the LLM has a clear contract (see §6).
- **cancel_order:** status ok with unitId, cancelled: true, previousOrder. Error: no standing order for unit.
- **Expire/update:** Destroyed units: delete standing order. March at destination: status arrived. Pursue target destroyed: status target_destroyed, then remove order. Blocked route: status blocked (recompute route each turn; if no path, set blocked).
- **Status values (per spec):** march → `en_route` until destination reached, then `arrived`; defend → `holding`; pursue → `closing` (while moving toward target); patrol → `patrolling`, or `contact` when an enemy is adjacent to the patrol unit (so the AI can intervene); plus `blocked`, `target_destroyed`, `target_out_of_range`, `target_lost` (future), `arrived`. Use these in DB and in getInjectionText so the injection matches the spec examples.

### 2.5 assess_unit currentStandingOrder

- Spec: "This is null until Tool 5 is implemented. Once Tool 5 exists, this field should display the unit's current standing order type and status."
- Implementation: Tool 2's assess_unit calls into Tool 5 (e.g. query_orders for that unitId) or reads from a shared getter that returns the standing order for a unit. Prefer a single query: Tool 5 exports something like getStandingOrderForUnit(playerId, unitId) returning null or { type, destination/defendHex/..., status } for the response shape. Tool 2 then sets currentStandingOrder to that value or null.

---

## 3. Phased Implementation Plan

---

### Phase 1: Database table and Tool 5 module (storage, CRUD, injection text; no order generation)

**Goal:** Add `standing_orders` table and the Tool 5 module with assign_order, query_orders, cancel_order, and getInjectionText. No order generation yet; no openRouter wiring. Verifiable via unit tests.

**Inputs:** gameDb (initDatabase, dbRun, dbGetOne, dbGetAll, saveDatabase); GameStateSnapshot type from gameDb; Tool 1 executeTool1 and TOOL1_NAMES for assign_order march/pursue route computation.

**Outputs:** New table `standing_orders`; new file `src/main/tools/tool5StandingOrders.ts` exporting TOOL5_NAMES, executeTool5, getInjectionText, and internal helpers assign_order/query_orders/cancel_order (or these as exports if needed by tests); unit test file `tool5StandingOrders.test.ts`.

**Steps:**

1. **1.1 — gameDb schema**
   - Locate `initDatabase()` in `src/main/gameDb.ts` and the block where other `CREATE TABLE IF NOT EXISTS` statements run.
   - Add exactly one new statement (no other changes to gameDb):
     - `CREATE TABLE IF NOT EXISTS standing_orders (player_id TEXT NOT NULL, unit_id TEXT NOT NULL, order_type TEXT NOT NULL, params TEXT NOT NULL, computed_route TEXT, status TEXT NOT NULL, created_turn INTEGER NOT NULL, origin_hex TEXT NOT NULL, PRIMARY KEY (player_id, unit_id));`
   - Do **not** add any new exports from gameDb. Tool 5 will use existing dbRun, dbGetOne, dbGetAll, saveDatabase.
   - **Check:** Grep for `standing_orders` in gameDb; only the CREATE line should appear.

2. **1.2 — Tool 5 module file and types**
   - Create `src/main/tools/tool5StandingOrders.ts`.
   - At top: import GameStateSnapshot from `../gameDb`; import executeTool1 from `./tool1Pathfinding`; import dbRun, dbGetOne, dbGetAll, saveDatabase from `../gameDb`; import logger (logDebug, logError, logTrace).
   - Define any internal types for order params (e.g. MarchParams, DefendParams) and DB row shape (snake_case from DB, map to camelCase in responses per spec).
   - **Check:** File compiles; no circular dependency (tool1Pathfinding must not import tool5StandingOrders).

3. **1.3 — assign_order (internal or exported helper)**
   - Signature: `assign_order(playerId: string, unitId: string, order: AssignOrderParams, state: GameStateSnapshot, latLngByH3: Map<string, [number, number]>, resolveToH3: (lat: number, lng: number) => string | undefined): Record<string, unknown>`.
   - Steps: (a) Find unit in `state.units` by unitId; if missing or unit.player !== playerId return `{ status: 'error', error: 'Unit not found: {unitId}' }`. (b) Validate order.type is one of defend | march | pursue | patrol | hold_fire. (c) Type-specific validation: defend — optional defendHex [lat,lng], engageRange number; march — destination [lat,lng] required, optional avoidEnemies/engageEnRoute; pursue — targetUnitId string required, target must exist in state.units and player !== playerId; patrol — waypoints array length >= 2, each waypoint [lat,lng]; hold_fire — no extra params. (d) Patrol: if any waypoint is impassable for unit (water for land, land for naval), return error "Waypoint {position} is impassable for {unitType}". (e) If replacing existing order, read current row and set replacedOrder in response. (f) For march: call executeTool1('plan_route', { unitId, destination: order.destination, options: { avoidEnemies: order.avoidEnemies ?? true } }, state, latLngByH3, resolveToH3); if result.status === 'error' return result; else store result path and set status 'en_route', computed_route JSON, origin_hex unit's current h3. (g) For pursue: validate targetUnitId in state; call plan_route from unit to target's h3; store route and origin_hex. (h) INSERT OR REPLACE into standing_orders; saveDatabase(). (i) Return spec response (status ok, unitId, order object with type and params and computedRoute for march/pursue, replacedOrder). Log debug on entry.
   - **Check:** Unit test: assign march for existing unit → status ok and row in DB; assign for missing unitId → status error.

4. **1.4 — query_orders**
   - Signature: `query_orders(playerId: string, unitId?: string, all?: boolean): Record<string, unknown>`.
   - **Contract:** Require at least one of unitId or all === true. If neither unitId nor all (true) is provided, return `{ status: 'error', error: 'query_orders requires unitId or all (true)' }` so the LLM has a clear contract (per §6).
   - If unitId provided: dbGetOne standing_orders WHERE player_id AND unit_id; if no row, return error "No standing order found for unit {unitId}" (per §6: query for single unit with no order → error). If all === true: get all rows for playerId; return { status: 'ok', orders: [...] } (array may be empty).
   - Response shape: { status: 'ok', orders: [ { unitId, type, destination|defendHex|waypoints, turnsRemaining, nextMoveHex, status } ] }. For Phase 1, turnsRemaining/nextMoveHex can be derived from computed_route or set to 0/null if not yet implemented.
   - **Check:** Unit test: after assign_order, query_orders(unitId) returns one order; query_orders(all: true) returns array including it. query_orders() with no args → error.

5. **1.5 — cancel_order**
   - Delete FROM standing_orders WHERE player_id AND unit_id. If no row deleted (dbRun does not report count; use getOne before delete or check row existence), return { status: 'error', error: 'No standing order found for unit {unitId}' }. Else return { status: 'ok', unitId, cancelled: true, previousOrder: { type, ... } } (previousOrder from the row just deleted). saveDatabase() after delete.
   - **Check:** Unit test: cancel after assign → status ok; cancel again → error.

6. **1.6 — getInjectionText**
   - Signature: `getInjectionText(playerId: string, state: GameStateSnapshot): string`.
   - Do **not** call expire/update in Phase 1. Load all rows from standing_orders WHERE player_id = playerId. Get list of AI unit ids from state.units where player === playerId (only existing units). For each order, if order.unit_id is in that list, add a bullet: "• unitId: TYPE key_params — status, turns remaining, next move". Use ⚠ prefix for status in ['blocked','target_lost','target_out_of_range','target_destroyed','arrived','contact']. Footer: if any AI unit has no standing order, "Units without standing orders: id1, id2"; else "All units have standing orders." Title: "=== STANDING ORDER STATUS (Turn N) ===" with N = state.turnNumber.
   - **Check:** Unit test: with one march order in DB, getInjectionText contains that unit's bullet and footer lists other AI units as without orders.

7. **1.7 — executeTool5 and TOOL5_NAMES**
   - Export `TOOL5_NAMES = ['assign_order', 'query_orders', 'cancel_order'] as const`.
   - Export `executeTool5(toolName, args, state, latLngByH3, resolveToH3)`: parse args per tool; if assign_order require unitId and order; if query_orders accept unitId?, all?; if cancel_order require unitId. Call the corresponding helper and return result. Catch exceptions; log error; return { status: 'error', error: String(err) }. Orienting comment on executeTool5.
   - **Check:** executeTool5('assign_order', { unitId, order }, state, latLngByH3, resolveToH3) returns same shape as direct assign_order call.

8. **1.8 — Unit tests (tool5StandingOrders.test.ts)**
   - Use the **established test DB pattern** (same as Tool 4 or other tool tests that touch the DB): tests that persist standing orders need a DB with the `standing_orders` table; do not introduce a new pattern (§7).
   - Happy path: assign_order march (state with one opponent unit, valid destination) → status ok; query_orders(unitId) → one order; query_orders(all: true) → length 1; cancel_order → status ok; query_orders(unitId) → error or empty.
   - Essential failures: assign_order with non-existent unitId → error "Unit not found: ..."; assign_order pursue with non-existent targetUnitId → error "Target unit not found: ..."; assign_order patrol with one waypoint → error "Patrol requires at least 2 waypoints"; cancel_order when unit has no order → error "No standing order found for unit ...".
   - getInjectionText: with empty standing orders, footer lists all AI units; with one order, that unit in bullets and others in footer.
   - **Check:** All tests pass; no tests for IPC or gameDb internals.

**Verification (Phase 1 complete):**

- New game creates DB with standing_orders table (start app, new game, inspect DB or run init in test).
- Unit tests: assign_order then query_orders returns order; cancel_order removes it; getInjectionText returns string with section and footer.
- No openRouter or renderer changes yet; Tool 5 is not in registry.

---

### Phase 2: Per-turn status update and order generation

**Goal:** Implement expireAndUpdateStatus and generateOrdersForStandingOrders in the Tool 5 module. No openRouter changes yet; callable from tests or a small harness. Tool 5 calls Tool 1 (executeTool1) for all route computation so pathfinding stays in one place.

**Inputs:** Phase 1 complete (standing_orders table, Tool 5 CRUD and getInjectionText). GameStateSnapshot (units with id, player, h3Index, unitType; hexes with h3Index, terrain). executeTool1, latLngByH3, resolveToH3.

**Outputs:** Two new exported (or test-callable) functions: expireAndUpdateStatus(playerId, state), generateOrdersForStandingOrders(playerId, state, latLngByH3, resolveToH3) returning { movementOrders, rangedAttacks }. DB updates: standing order rows updated (status, computed_route) or deleted. Unit tests extending tool5StandingOrders.test.ts.

**Steps:**

1. **2.1 — expireAndUpdateStatus**
   - Signature: `expireAndUpdateStatus(playerId: string, state: GameStateSnapshot): void`.
   - Load all rows: SELECT * FROM standing_orders WHERE player_id = ?.
   - Build set of existing unit ids: `state.units.filter(u => u.player === playerId).map(u => u.id)`.
   - For each row: (a) If row.unit_id not in existing unit ids → DELETE FROM standing_orders WHERE player_id AND unit_id; (b) Else if order_type === 'march': get unit's current h3Index from state; get destination from params JSON; if current === destination (or same hex), UPDATE status = 'arrived'; (c) Else if order_type === 'pursue': get targetUnitId from params; if no unit in state.units with that id (or target is same player), set status = 'target_destroyed' and DELETE row. (d) Blocked: do not set in expire; set in generateOrdersForStandingOrders when route fails.
   - Call saveDatabase() after all mutations. Log debug at entry.
   - **Check:** Unit test: add march order, then remove unit from state (simulate destroyed), call expireAndUpdateStatus → row deleted. March unit at destination → status arrived.

2. **2.2 — generateOrdersForStandingOrders — defend**
   - For each standing order with order_type === 'defend': read defendHex from params (default unit's current position from state). engageRange from params or unit's range stat (0 infantry, 1 armor, 2 naval). If unit's h3Index !== defendHex: call Tool 1 plan_route from unit to defendHex, one step (or use first segment of path); emit one movement order { unitId, toH3Index } where toH3Index is the first step's end hex. If unit at defendHex: find enemies in state.units where player !== playerId and hex distance <= engageRange; if unit has range >= 1 and enemy in range, pick nearest (by hex distance), emit one ranged attack { unitId, targetH3Index: enemy.h3Index }. Do not emit movement if at defendHex.
   - **Check:** Test: defend unit not at defendHex → one movement order; defend unit at defendHex with enemy in range → one ranged order (and no movement).

3. **2.3 — generateOrdersForStandingOrders — march**
   - For each standing order with order_type === 'march': get unit's current h3 from state; destination from params. Call executeTool1('plan_route', { unitId, destination, options: { avoidEnemies: params.avoidEnemies ?? true } }, state, latLngByH3, resolveToH3). If result.status === 'error' (e.g. no path): UPDATE status = 'blocked', saveDatabase(), emit no order. Else: from result.path take first turn's segment; end hex of that segment = toH3Index; emit { unitId, toH3Index }. Optionally update computed_route in DB for next turn (trim path). If params.engageEnRoute and an enemy is adjacent to unit's current hex (before move): add one ranged attack against that enemy if unit has range. Log debug.
   - **Check:** Test: march order with valid route → one movement order; march with destination unreachable (e.g. water for infantry) → status blocked, no order.

4. **2.4 — generateOrdersForStandingOrders — pursue**
   - For each standing order with order_type === 'pursue': get targetUnitId from params; find target in state.units; if not found, skip (expireAndUpdateStatus should have deleted). Check maxDistance if set (if distance from origin_hex to target exceeds maxDistance, set status 'target_out_of_range', emit no order). Get target's h3Index. Call plan_route from unit to target hex. First segment end = toH3Index; emit movement. If target hex is within unit's attack range (by hex distance), also emit ranged attack { unitId, targetH3Index: target.h3Index }. Set status to `'closing'` (per spec) and update stored route for next turn.
   - **Check:** Test: pursue with target present → one movement (and optionally one ranged if in range). Test: pursue with maxDistance exceeded → status target_out_of_range, no order.

5. **2.5 — generateOrdersForStandingOrders — patrol**
   - For each standing order with order_type === 'patrol': waypoints from params (array of [lat,lng]). Store current waypoint index in computed_route JSON (e.g. { waypointIndex: number, path?: ... }) per §5 Q1. Each turn: route from unit to waypoints[waypointIndex]; one movement step; if unit reaches that waypoint (or would pass it), set waypointIndex = (waypointIndex + 1) % waypoints.length for next turn. Emit one movement order. **No attack** (patrol units are scouts). **Contact status:** If any enemy unit is adjacent to the patrol unit's current position (before movement), set the standing order's status to `'contact'` and persist so the injection shows ⚠ and the AI can intervene; still emit the movement order for this turn. Otherwise use status `'patrolling'`. Per spec: "If an enemy is adjacent to the patrol unit's current position, this is reported in the standing order status as 'contact'."
   - **Check:** Test: patrol with 2 waypoints → one movement order toward first waypoint. Test: patrol with enemy adjacent → status 'contact' stored and injection shows ⚠.

6. **2.6 — generateOrdersForStandingOrders — hold_fire**
   - No movement, no ranged. Skip.
   - **Check:** Test: hold_fire → no orders in output.

7. **2.7 — generateOrdersForStandingOrders — orchestration**
   - Signature: `generateOrdersForStandingOrders(playerId: string, state: GameStateSnapshot, latLngByH3: Map<string, [number, number]>, resolveToH3: (lat: number, lng: number) => string | undefined): { movementOrders: { unitId: string; toH3Index: string }[]; rangedAttacks: { unitId: string; targetH3Index: string }[] }`.
   - First call expireAndUpdateStatus(playerId, state). Then load all standing orders for playerId (only rows for units still in state). For each order, dispatch by order_type to defend/march/pursue/patrol/hold_fire logic; append to movementOrders and rangedAttacks. Return combined arrays. Log debug at entry.
   - **Check:** No duplicate unitIds in movementOrders or rangedAttacks (each unit at most one movement, one ranged).

8. **2.8 — Unit tests for Phase 2**
   - Test: one march order → expireAndUpdateStatus then generateOrdersForStandingOrders → movementOrders.length 1, correct unitId and toH3Index.
   - Test: one defend order, enemy in range → rangedAttacks.length 1.
   - Test: one hold_fire → movementOrders.length 0, rangedAttacks.length 0.
   - Test: unit with standing order removed from state → after expireAndUpdateStatus, generateOrdersForStandingOrders does not emit for that unit (order already deleted).

**Verification (Phase 2 complete):**

- Unit tests pass. Order generation produces correct movement/ranged arrays for each order type. expireAndUpdateStatus removes destroyed units and sets arrived/target_destroyed/blocked as specified.

---

### Phase 3: Integration in requestOrders (injection, merge, per-turn sequence)

**Goal:** When Orders is enabled, run the per-turn sequence at the start of requestOrders; inject standing order status into the system prompt; after LLM response, merge standing-order-generated orders with LLM orders and validate/return merged result. When Orders disabled, behavior unchanged (no injection, no generation, no merge).

**Inputs:** Phase 1 and 2 complete. openRouter.requestOrders, buildSystemPromptForTools, parseOrdersResponse, existing validation/drop logic. Tool 5: expireAndUpdateStatus, generateOrdersForStandingOrders, getInjectionText.

**Outputs:** requestOrders and buildSystemPromptForTools modified so that (1) when Orders enabled, standing orders are expired, generated, and injected, and (2) final returned orders are merged (standing + LLM, LLM overrides by unitId). No API change to requestOrders signature.

**Steps:**

1. **3.1 — Define Orders-enabled predicate**
   - In openRouter.ts, add a small helper or inline: `const ordersEnabled = enabledToolNames === undefined || (TOOL5_NAMES as readonly string[]).some(n => enabledToolNames.includes(n));`. Use the same pattern as memoryEnabled (TOOL4_NAMES). Do not import TOOL5_NAMES until Phase 4; in Phase 3 you may add the import and registry entry in a minimal way so ordersEnabled compiles, or use a literal list `['assign_order','query_orders','cancel_order']` for Phase 3 only and replace with TOOL5_NAMES in Phase 4. Prefer: add TOOL5_NAMES import and use it here so Phase 4 only adds registry/metadata.
   - **Check:** ordersEnabled is true when enabledToolNames is undefined or contains any Tool 5 name; false when enabledToolNames is defined and contains none of them.

2. **3.2 — Run per-turn sequence at start of requestOrders (when Orders enabled)**
   - Immediately after building latLngByH3 and resolveToH3 (and before building systemPrompt), if ordersEnabled: (a) Call `expireAndUpdateStatus('opponent', state)` (import from tool5StandingOrders). (b) Call `generateOrdersForStandingOrders('opponent', state, latLngByH3, resolveToH3)` and store result in two variables: `standingOrderMovement: { unitId: string; toH3Index: string }[]` and `standingOrderRanged: { unitId: string; targetH3Index: string }[]`. If not ordersEnabled, set both to empty arrays `[]`.
   - **Check:** When Orders disabled, standingOrderMovement and standingOrderRanged are []; when enabled and no standing orders, they are []; when enabled and one march order exists, standingOrderMovement.length >= 1.

3. **3.3 — Inject standing order status into system prompt**
   - In buildSystemPromptForTools(state, coordMap, enabledToolNames): after the memory block is optionally appended (memoryBlock when memoryEnabled), and before the toolsSection (`=== AVAILABLE TOOLS ===`), if ordersEnabled append the standing order block: call `getInjectionText('opponent', state)` and append `\n\n` + that string. So order of blocks: base intro + warning + combat + (memoryBlock if memoryEnabled) + (standingOrderBlock if ordersEnabled) + toolsSection + unit rosters + order format. When ordersEnabled is false, do not call getInjectionText and do not add any standing order text.
   - **Check:** With Orders enabled and one standing order, system prompt contains "=== STANDING ORDER STATUS" and the unit bullet; with Orders disabled, prompt does not contain that section.

4. **3.4 — Merge after LLM returns final orders**
   - Locate the place where parsed orders are validated and returned (after parseOrdersResponse and the validation loop that fills `validated` and `dropReasons`). Before that validation, compute merged lists: (a) `const llmMovementUnitIds = new Set((parsed.movementOrders ?? []).map(o => o.unitId));` (b) `mergedMovement = [...standingOrderMovement.filter(o => !llmMovementUnitIds.has(o.unitId)), ...(parsed.movementOrders ?? [])]`. (c) Same for ranged: `llmRangedUnitIds = new Set(parsed.rangedAttacks.map(...)); mergedRanged = [...standingOrderRanged.filter(o => !llmRangedUnitIds.has(o.unitId)), ...parsed.rangedAttacks]`. (d) Run the existing validation/drop logic on mergedMovement and mergedRanged instead of on parsed.movementOrders/parsed.rangedAttacks. So: use mergedMovement/mergedRanged as the input to the validation loop; validated orders and dropReasons are based on merged lists. Return the same shape as today (movementOrders: validated movement, rangedAttacks: validated ranged).
   - **Check:** When Orders disabled, mergedMovement === parsed.movementOrders and mergedRanged === parsed.rangedAttacks (no-op). When Orders enabled and LLM sends explicit order for unit A, merged list has LLM's order for A, not standing order's.

5. **3.5 — Handle empty standing orders**
   - When ordersEnabled but no standing orders exist, generateOrdersForStandingOrders returns { movementOrders: [], rangedAttacks: [] }; merge is still correct (only LLM orders). No special case needed.
   - **Check:** requestOrders with Orders enabled and zero standing orders returns same result as if Orders were disabled (only LLM output).

6. **3.6 — Pass merged orders to caller**
   - The return value of requestOrders (success case) already includes orders and rangedAttacks; these are now the merged-and-validated lists. game:ready and gameIpcHandlers already pass these to ready(aiOrders, aiRangedOrders). No change to IPC or ready() signature.
   - **Check:** End-to-end: start game, enable Orders, assign_order for one unit (via tool call), click Ready; next turn, do not issue explicit order for that unit; click Ready again; that unit should move (standing order generated the movement). If you issue an explicit order for that unit in the same turn, only the explicit order is used.

**Verification (Phase 3 complete):**

- With Orders enabled: standing order status appears in system prompt; standing-order-generated orders are merged with LLM orders; LLM explicit order for a unit overrides that unit's standing-order order for that turn.
- With Orders disabled: no standing order block in prompt; no standing-order orders; behavior identical to pre–Tool 5.
- Manual or integration test: assign march, next turn no explicit order → unit moves; assign march, next turn explicit order for same unit → only explicit order used.

---

### Phase 4: Registry, tool definitions, dispatch, and UI (Orders toggle and label)

**Goal:** Register Tool 5 in the tool group registry; add OpenRouter tool metadata for assign_order, query_orders, cancel_order; dispatch Tool 5 in the tool loop; add Orders row to the Tools tab with label "Orders". Ensure default enabled groups include 'orders'.

**Inputs:** Phase 3 complete (Tool 5 integrated in requestOrders). TOOL_GROUP_REGISTRY, ALL_TOOL_METADATA, tool loop, getToolGroupList; renderer Tools tab and OPENROUTER_TOOL_GROUPS fallback.

**Outputs:** TOOL_GROUP_REGISTRY has fifth entry { id: 'orders', label: 'Orders', toolNames: TOOL5_NAMES }; ALL_TOOL_METADATA includes three new ToolMeta entries; tool loop dispatches to executeTool5; renderer shows five rows with Orders last; default enabled set includes 'orders'.

**Steps:**

1. **4.1 — Import and registry**
   - In openRouter.ts, add import: `import { executeTool5, TOOL5_NAMES } from './tools/tool5StandingOrders';`.
   - Add to TOOL_GROUP_REGISTRY array (after memory): `{ id: 'orders', label: 'Orders', toolNames: TOOL5_NAMES }`.
   - **Check:** getToolGroupList() returns five entries; last is { id: 'orders', label: 'Orders' }.

2. **4.2 — ALL_TOOL_METADATA for assign_order**
   - Add one ToolMeta object: name `'assign_order'`, description per spec (e.g. "Give a unit a persistent mission: defend, march, pursue, patrol, or hold_fire. Engine executes it each turn. New standing orders take effect NEXT turn; issue an explicit order too if you want action this turn."), parameters: type 'object', properties: unitId (string, required), order (object with type enum defend|march|pursue|patrol|hold_fire, and type-specific: defendHex, engageRange; destination, avoidEnemies, engageEnRoute; targetUnitId, maxDistance; waypoints). required: ['unitId', 'order']. promptLine: short line for system prompt per spec §System Prompt Integration.
   - **Check:** getFilteredToolMetadata with orders enabled includes assign_order; buildToolDefinitions produces a function definition with correct parameters.

3. **4.3 — ALL_TOOL_METADATA for query_orders and cancel_order**
   - query_orders: name, description, parameters (unitId optional string, all optional boolean). promptLine per spec.
   - cancel_order: name, description, parameters (unitId required string). promptLine per spec.
   - **Check:** All three tools appear in filtered metadata when orders group enabled.

4. **4.4 — Tool loop dispatch**
   - In the tool-call handling loop (where TOOL4_NAMES, TOOL3_NAMES, etc. are checked), add branch: if `(TOOL5_NAMES as readonly string[]).includes(toolName)` then `result = executeTool5(toolName, args, state, latLngByH3, resolveToH3)`. Order of checks: Tool 4 → Tool 3 → Tool 2 → Tool 1; add Tool 5 in the same style (e.g. before Tool 4 or after, consistently). Ensure getGroupIdForToolName(toolName) returns 'orders' for the three names so toolInvocationCounts['orders'] increments.
   - **Check:** When model calls assign_order, executeTool5 is invoked and result is appended to messages; toolInvocationCounts['orders'] increases.

5. **4.5 — Renderer fallback list**
   - In renderer (e.g. OPENROUTER_TOOL_GROUPS or equivalent), add fifth entry: `{ id: 'orders', label: 'Orders' }` so order matches main registry (Planning, Assessment, Estimation, Memory, Orders). Update any initialization that builds default enabled set (e.g. enabledToolGroups, toolInvocationCounts) to include 'orders' when using a fixed list, or ensure the default is "all groups from registry" so adding the registry entry is enough.
   - **Check:** When renderer loads Tools tab (from getToolGroupList or fallback), five rows appear; fifth row label is "Orders".

6. **4.6 — Default enabled**
   - If main process passes defaultGroupIds to renderer (e.g. on init), ensure it uses TOOL_GROUP_REGISTRY.map(g => g.id), so 'orders' is included. If renderer initializes enabled groups from the list length or explicit list, add 'orders' to that list. Result: all five groups start enabled.
   - **Check:** New game or fresh load: Orders toggle is on; requestOrders receives enabledToolNames including assign_order, query_orders, cancel_order.

**Verification (Phase 4 complete):**

- Tools tab shows five rows; fifth is "Orders" with its own toggle and count. Toggling Orders off excludes Tool 5 from request and disables injection/merge (Phase 3). Invocation count for Orders increments when the model calls any of assign_order, query_orders, cancel_order.

---

### Phase 5: assess_unit currentStandingOrder, edge cases, logging, comments

**Goal:** Wire Tool 2 assess_unit to Tool 5 so currentStandingOrder is populated; implement all spec edge cases; ensure logging and orienting comments are complete; add or extend unit tests for edge cases and currentStandingOrder.

**Inputs:** Phase 1–4 complete. Tool 2 assess_unit response shape (currentStandingOrder field already present as null). Spec §Tool 2 (currentStandingOrder) and §Tool 5 edge cases.

**Outputs:** Tool 5 exports getStandingOrderForUnit(playerId, unitId); Tool 2 calls it and sets currentStandingOrder; all listed edge cases implemented; logging and orienting comments on all new/updated public methods; unit tests for edge cases and for assess_unit with standing order.

**Steps:**

1. **5.1 — getStandingOrderForUnit**
   - In tool5StandingOrders.ts, export `getStandingOrderForUnit(playerId: string, unitId: string): { type: string; destination?: [number, number]; defendHex?: [number, number]; waypoints?: [number, number][]; status: string } | null`. Implementation: dbGetOne SELECT * FROM standing_orders WHERE player_id AND unit_id; if no row return null; else map row to minimal object (type, status, and type-specific key field: destination for march, defendHex for defend, waypoints for patrol, etc.). Log trace. Orienting comment: "Returns the current standing order for a unit for use in assess_unit; null if none."
   - **Check:** getStandingOrderForUnit('opponent', unitId) returns null when no order; returns object when unit has order.

2. **5.2 — Tool 2 assess_unit integration**
   - In tool2Assessment.ts, when building the unit object for the response, before setting currentStandingOrder: import getStandingOrderForUnit from tool5StandingOrders (or from a barrel if present). Call getStandingOrderForUnit(playerId, unitId) and set currentStandingOrder to the return value (or null). PlayerId for opponent is 'opponent'. If getStandingOrderForUnit is not available (e.g. optional import), keep currentStandingOrder as null.
   - **Check:** assess_unit for a unit that has a standing order returns currentStandingOrder with type and status; for unit without order, currentStandingOrder is null.

3. **5.3 — Edge case: assign_order unit not found**
   - Already in Phase 1: unitId not in state.units or unit.player !== playerId → return error "Unit not found: {unitId}". Add unit test if missing.
   - **Check:** Test passes.

4. **5.4 — Edge case: pursue target not found**
   - assign_order with type pursue: targetUnitId must exist in state.units and be an enemy. Else return "Target unit not found: {targetUnitId}". Test in tool5StandingOrders.test.ts.
   - **Check:** Test passes.

5. **5.5 — Edge case: march destination = current position**
   - In assign_order for march, if unit's current position (from state) equals destination (after resolving to same hex or comparing lat/lng), do not call plan_route; insert order with status 'arrived', computed_route null or empty. In expireAndUpdateStatus, march at destination → status arrived (already in Phase 2). In generateOrdersForStandingOrders, march with status arrived → no movement order.
   - **Check:** assign_order march with destination = current position → status ok, status 'arrived'; next turn no movement order.

6. **5.6 — Edge case: patrol &lt; 2 waypoints**
   - Already in Phase 1: validate waypoints.length >= 2; else "Patrol requires at least 2 waypoints". Test.
   - **Check:** Test passes.

7. **5.7 — Edge case: patrol waypoint impassable**
   - In assign_order for patrol, for each waypoint check passability for unit type (land vs water); if any waypoint is water for land unit or land for naval, return "Waypoint {position} is impassable for {unitType}". Use state.hexes and terrain. Test.
   - **Check:** Test passes.

8. **5.8 — Edge case: cancel_order when no order**
   - Already in Phase 1: if no row deleted, return "No standing order found for unit {unitId}". Test.
   - **Check:** Test passes.

9. **5.9 — Edge case: unit destroyed**
   - Document: unit with standing order destroyed during resolution is removed from state before the next requestOrders; at start of next requestOrders, expireAndUpdateStatus deletes that unit's standing order. getInjectionText uses state.units so destroyed units are not listed. No code change if Phase 2 already deletes by "unit_id not in state.units". Add a short comment in expireAndUpdateStatus.
   - **Check:** No standing order row for deleted unit; injection does not mention that unit.

10. **5.10 — Logging and orienting comments**
    - Audit all new public functions in tool5StandingOrders: log debug on entry for executeTool5, assign_order, query_orders, cancel_order, expireAndUpdateStatus, generateOrdersForStandingOrders; log trace for getStandingOrderForUnit, getInjectionText (read-only). On catch in executeTool5 and helpers: log error. Orienting comment on every new public non-overriding function (purpose, when to use, return shape, errors).
    - **Check:** Logs show debug for tool invocations; trace for getters; error for invalid input paths.

11. **5.11 — Tests**
    - Ensure tool5StandingOrders.test.ts covers: assign (march, defend, hold_fire), query, cancel, getInjectionText; expireAndUpdateStatus (destroyed unit, arrived march); generateOrdersForStandingOrders (march, defend, hold_fire). Add test for assess_unit returning currentStandingOrder when unit has order (in tool2Assessment.test.ts or manual). Remove or avoid tests that only cover boilerplate (e.g. IPC).
    - **Check:** All tests pass; coverage for essential contracts and edge cases.

**Verification (Phase 5 complete):**

- assess_unit for a unit with a standing order returns currentStandingOrder with type and key details. All listed edge-case tests pass. Logs show debug for tool invocations and error for invalid inputs. Orienting comments present on all new public methods.

---

## 4. Contract Summary

| Item | Contract |
|------|----------|
| **standing_orders table** | player_id, unit_id, order_type, params (JSON), computed_route (JSON), status, created_turn, origin_hex; PRIMARY KEY (player_id, unit_id). |
| **Order types** | defend, march, pursue, patrol, hold_fire. Type-specific params per spec. |
| **assign_order** | Validates unit and params; for march/pursue computes route via Tool 1; stores order; returns computedRoute/replacedOrder. New order takes effect next turn. |
| **query_orders** | unitId? or all?; returns orders array. |
| **cancel_order** | By unitId; error if no order. |
| **Per-turn sequence (Orders enabled)** | (1) expireAndUpdateStatus (2) generateOrdersForStandingOrders (3) inject status in prompt (4) LLM (5) merge: standing-order orders + LLM orders, LLM overrides same unitId. |
| **Injection** | Only when Orders enabled: getInjectionText after memory block, before AVAILABLE TOOLS. Format: bullets per unit, ⚠ for attention statuses, footer with units without orders or "All units have standing orders." |
| **Tool group** | id `orders`, label `Orders`; own toggle and count in Tools tab; default enabled. |
| **currentStandingOrder** | Tool 2 assess_unit returns standing order summary from Tool 5 for that unit, or null. |

---

## 5. Concrete open questions

These questions should be answered before or during implementation so the plan executes reliably. Resolved answers can be recorded in §6.

1. **Patrol waypoint index storage:** The spec says patrol "cycles through waypoints in order" and "on reaching the last waypoint, the next target becomes the first." To know "next waypoint" each turn, the engine must store the current target waypoint index (or "current leg"). Should this be stored in the existing `computed_route` JSON column (e.g. `{ waypointIndex: number, path?: ... }`) or in a new column? **Decision:** Use `computed_route` JSON to avoid schema change; include `waypointIndex` and optionally current path segment.

2. **query_orders when unitId is provided but unit has no order:** Spec says "query a specific unit's standing order." If the unit exists but has no row in standing_orders, should the response be `status: 'ok', orders: []` or `status: 'error', error: 'No standing order found for unit {unitId}'`? **Decision:** Return error so the LLM gets a clear contract; spec §Response Schema — Query Orders shows an orders array, and §Edge cases says "Cancel order for a unit with no standing order: status error." So for consistency, query_orders for a single unit with no order → error.

3. **Defend "engageRange" default:** Spec says engageRange defaults to the unit's range stat. If the LLM omits engageRange, use unit's range (0 infantry, 1 armor, 2 naval) so the defending unit only generates attack orders against enemies it can hit.

4. **Pursue maxDistance:** Spec says "If maxDistance is set and the target's last-known position is more than maxDistance hexes from the unit's position when the order was originally issued (stored as originHex)..." So origin_hex is required for pursue. Phase 1 already stores origin_hex when assigning. In expireAndUpdateStatus or generateOrdersForStandingOrders, if params.maxDistance is set, compare current target distance from origin_hex; if exceeded, set status 'target_out_of_range' and emit no order.

5. **Optional: target_lost (fog of war):** Spec mentions "If the target hasn't been observed for 3+ turns (relevant once fog of war is implemented; currently this never happens)." For milestone 0.5, do not implement target_lost logic; status can exist in the type/injection text but never be set. Implement when fog of war is added.

---

## 6. Resolved decisions

1. **Label "Orders":** UI label is "Orders"; registry id is `orders`. Tools tab shows five groups in order: Planning, Assessment, Estimation, Memory, Orders.

2. **New orders next turn:** assign_order does not add to this turn's orders. The system prompt must state: "Standing orders take effect next turn. If you want the unit to act this turn, also issue an explicit movement or attack order."

3. **Merge in requestOrders:** Merging is done in the main process after parsing the LLM response. Merged orders are passed to ready() as aiOrders and aiRangedOrders. Human orders are merged in ready() from pending_orders / pending_ranged_orders.

4. **Tool 1 reuse:** Tool 5 imports and calls executeTool1('plan_route', ...) (and optionally 'check_distance') with the same (state, latLngByH3, resolveToH3) that requestOrders and executeTool5 already have. Pathfinding stays in Tool 1; no duplicate BFS. generateOrdersForStandingOrders receives state and coord helpers from openRouter and passes them through to executeTool1 when it needs a route.

5. **State shape for order generation:** generateOrdersForStandingOrders uses the same GameStateSnapshot as requestOrders: state.units (id, player, unitType, h3Index), state.hexes (h3Index, terrain), state.turnNumber. No extra state shape is required; GameStateSnapshot already includes unit positions, types, and enemy positions (units where player !== playerId).

6. **Orders disabled:** When the Orders tool group is disabled, do not call expireAndUpdateStatus, generateOrdersForStandingOrders, or getInjectionText; do not add standing order block to the prompt; set standingOrderMovement and standingOrderRanged to [] so merge is a no-op. Behavior is identical to pre–Tool 5.

7. **query_orders with neither unitId nor all:** If the LLM calls query_orders with no arguments (or with all !== true and no unitId), return error: "query_orders requires unitId or all (true)". This gives the LLM a clear contract and avoids ambiguous "return all vs return empty" behavior.

---

## 7. Questions for you

No open product or design questions remain for executing this plan; §5 and §6 record the decisions needed for reliable implementation. If something is ambiguous during implementation, prefer [mcp-tools-spec.md](mcp-tools-spec.md) §Tool 5 for behavior and this plan for phase order and contracts.

**Test DB:** Use the **established pattern** for tests that need DB access: same approach as Tool 4 (or other tool tests that use the game DB). Unit tests that persist standing orders require a database with the `standing_orders` table—e.g. the same `initDatabase()` as production or an in-memory sql.js instance with that schema in test setup. Do not introduce a new test-DB pattern; follow existing project patterns so reliability and consistency are preserved.

---

**End of execution plan.**
