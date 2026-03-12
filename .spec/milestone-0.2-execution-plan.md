# Milestone 0.2 — Game State and Turns: Execution Plan

*Version 1.0 — March 2026*

This document is an execution plan for implementing **Milestone 0.2** from the [Strategic Development Plan](development-plan.md). It is written for a coding agent (e.g., Cursor, RooCode) and is organized in phases that are **independently verifiable or verifiable with previously completed phases** (Phase 1 stands alone; Phases 2–7 each depend on prior phases as stated in their verification steps). Each phase produces reliable, understandable code suitable for future developers.

---

## Scope Summary

**Deliverable:** Extend the application from Milestone 0.1 to:

1. A **~50-hex map** with **two terrain types** (land and water).
2. **3–5 units per side** for two players, with **three unit types**: infantry, armor, naval.
3. **WEGO turn structure:**
   - **Planning phase:** The human player issues movement orders by clicking a unit, then clicking a destination hex.
   - A **"Ready"** button that ends the planning phase.
   - **Resolution phase:** All movement executes simultaneously; unit positions update.
4. **Game state stored in SQLite** via the main process.
5. **No combat** — units only move. Movement rules: naval units restricted to water hexes; infantry and armor restricted to land hexes.

**Technical constraints:**

- **Prerequisite:** Milestone 0.1 is complete and runnable (Electron, TypeScript, 19-hex grid, pan/zoom, selection, sidebar).
- **SQLite:** Use **better-sqlite3** (synchronous, main-process only). Do not use SQLite in the renderer.
- **IPC:** Use Electron **preload script** and **contextBridge** to expose a minimal, type-safe API to the renderer. Use `ipcMain.handle` / `ipcRenderer.invoke` for request/response. Do not enable `nodeIntegration` in the renderer.
- **Coordinate identity:** Hexes are identified by **H3 index** (string). Use the same H3 resolution and coordinate conventions as the existing hex grid where possible.

**Out of scope for 0.2:** Combat, AI/LLM opponent, fog of war, multiple maps, save/load of games. The second player (non-human) has units on the map but does not issue orders in 0.2 — only the human player's orders are submitted and resolved.

**Code quality goals:** Generated code must be reliable and understandable for future developers. Prefer simple, explicit logic over clever shortcuts. Use consistent naming, a single source of truth for game state (SQLite in main process), and minimal branching so behavior is easy to trace. Each phase produces a small, testable increment so regressions are easy to isolate. **When generating code for the first time, double-check correctness and clarity** before considering the task complete.

---

## Compliance with project rules

Implementing agents must follow the project's coding rules. The following are specific to this milestone and the TypeScript/Electron stack; treat them as additive to the project's current coding rules. In this codebase, "backend" means the **Electron main process** (where SQLite and game logic run); the renderer is the frontend.

- **Comments:** All new and updated **public, non-overriding** methods must have an **orienting comment** that explains why the method exists, when to use it, how to use it, and what to expect (results and exceptions). For interface/API methods, focus on **contracts**; for implementation methods, focus on **high-level implementation details**.
- **Logging:** Use the **project's existing logging API** when present; otherwise introduce a single logging abstraction in the main process (and renderer if needed). Emit **debug**-level logs for public method invocations, **error**-level for caught exceptions, and **trace**-level for getter-style methods that do not modify state. Include enough detail for troubleshooting. Do not check log level before calling the logging API unless building potentially large message strings inline.
- **Testing:** If tests are added, test only **happy paths and essential failure cases**; verify **code contracts**, not implementation details. Do not add tests for trivial delegation, DTOs/accessors, or similar boilerplate. Remove any tests that become unnecessary under these rules.
- **Nullability:** Use TypeScript strict null checks. Document optional or nullable parameters and return values where the type alone is insufficient.

Rules that refer to Java do not apply; the intent above is the TypeScript-equivalent guidance.

---

## Prerequisites (Before Phase 1)

- **Milestone 0.1:** Fully implemented and passing the verification matrix in [milestone-0.1-execution-plan.md](milestone-0.1-execution-plan.md). The app runs with `npm run build` and `npm start`; 19-hex grid, pan/zoom, selection, and sidebar work.
- **Node.js:** Same as 0.1 (current LTS compatible with Electron).
- **Learning (human or agent):** Skim [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) API (synchronous, main process only). Understand the WEGO loop as a state machine: planning → (Ready) → resolution → next turn planning.

No code is written in Prerequisites; verification is that the implementer has access to the above and that 0.1 runs.

---

## Phase 1: SQLite integration and game state schema (main process)

**Goal:** Add better-sqlite3 to the main process, define the game state schema (hexes with terrain, units, turn phase, pending orders), and initialize the database on app startup. No renderer changes yet.

**Tasks:**

1. Add **better-sqlite3** (and its type definitions if needed) as a dependency. Ensure it is only required in the main process (not in renderer or preload).
2. Define the **schema** in a single place (e.g. a `schema` or `db` module in `src/main`):
   - **Hexes:** At least `h3_index` (TEXT PRIMARY KEY), `terrain` (TEXT: `'land'` or `'water'`). Optional: store hex list for the map so the map is data-driven.
   - **Units:** `id` (unique), `player` (e.g. `'human'` | `'opponent'` or 0/1), `unit_type` (`'infantry'` | `'armor'` | `'naval'`), `h3_index` (current hex). Use a stable ID scheme (e.g. integer primary key or UUID).
   - **Turn state:** At least `phase` (`'planning'` | `'resolution'`), `turn_number` (integer). Single row or key-value style.
   - **Pending orders:** For the current planning phase, store movement orders: e.g. `unit_id`, `to_h3_index`. One row per order; clear or replace on resolution.
3. On main process startup (or on first need), **create the database file** (e.g. in user data directory or alongside the app) and run **CREATE TABLE** statements. No migrations required for 0.2 if a single init script is sufficient; document where the DB file lives.
4. Provide a **minimal API** from main process: e.g. `initDatabase(): void` (or open DB and create tables if not exists), and optionally `getGameState()` that returns a serializable object (hexes with terrain, units, turn phase, turn number, pending orders). For Phase 1, `getGameState()` can return empty or placeholder data; focus is on schema and init.
5. Call **initDatabase** (or equivalent) when the main process is ready (e.g. in the same place where the window is created). Do not expose the raw DB to the renderer.

**Verification:**

- Run `npm install`, `npm run build`, `npm start`. The app starts without error. The database file is created and contains the expected tables (inspect with an SQLite client or a one-off script that opens the DB and runs `SELECT name FROM sqlite_master WHERE type='table'`).
- No renderer or preload changes are required for this phase.

**Exit condition:** SQLite DB is created on startup with hexes, units, turn state, and pending orders tables. Main process has a clear place where schema is defined and DB is initialized.

---

## Phase 2: Preload script and IPC for game state

**Goal:** Expose a safe, minimal API to the renderer so it can request the current game state from the main process. The main process reads from SQLite and returns a serializable snapshot.

**Tasks:**

1. Create a **preload script** (TypeScript, compiled to JS and loaded by the main process). In the preload, use **contextBridge** to expose a single object (e.g. `window.gameApi` or `window.electronAPI`) with a method such as `getGameState(): Promise<GameStateSnapshot>`. The preload must not require Node-only modules that are unavailable in the preload context; use only `contextBridge` and `ipcRenderer.invoke`.
2. In the **main process**, register the preload script path in `webPreferences.preload` for the BrowserWindow. Add an **ipcMain.handle** for a channel (e.g. `game:getState`) that reads the current game state from the database and returns a plain object: `{ hexes: Array<{ h3Index: string, terrain: string }>, units: Array<{ id: string, player: string, unitType: string, h3Index: string }>, phase: string, turnNumber: number, pendingOrders: Array<{ unitId: string, toH3Index: string }> }`. Use consistent naming (camelCase for JSON). If the DB is empty, return empty arrays and a default phase/turnNumber.
3. Define a **TypeScript type** for the game state snapshot (in a shared types file or in both main and renderer so the renderer can type the promise result). The preload script can use a simple type declaration for the exposed API.
4. In the **renderer**, call the exposed API (e.g. `window.gameApi.getGameState()`) and log or display the result (e.g. in the sidebar or console) to confirm the round-trip. Do not yet change the hex grid to be data-driven; that is Phase 3.

**Verification:**

- Run the app; open DevTools in the renderer. Trigger a call to get game state (e.g. on load or via a temporary button). The renderer receives a valid object with `hexes`, `units`, `phase`, `turnNumber`, `pendingOrders`. No IPC errors in console. Main process does not expose the DB or require() to the renderer.

**Exit condition:** Renderer can request and receive the current game state via a preload-backed IPC API. Schema and types are consistent between main and renderer.

---

## Phase 3: ~50-hex map with terrain (data and rendering)

**Goal:** The map uses approximately 50 H3 hexes with two terrain types (land and water). Terrain is stored in the database and driven by game state. The renderer draws the grid from the game state and colors hexes by terrain.

**Tasks:**

1. **Define the 50-hex set:** Use the same H3 resolution and center convention as Milestone 0.1 (or document any change). Use a k-ring that yields ~50 cells (e.g. k-ring 3 gives 1+6+12+18 = 37; k-ring 4 gives 1+6+12+18+24 = 61). Choose one (e.g. k-ring 4 and use the first 50, or k-ring 3 and accept 37) and document the choice. Generate the ordered list of H3 indices in the main process or in a module that the main process uses when initializing the DB.
2. **Seed terrain:** For each hex in the set, assign `terrain` as either `'land'` or `'water'`. Use a simple, reproducible rule (e.g. based on H3 index parity, or a fixed pattern, or lat/lng from H3 so that a subset of cells are water). Ensure both terrain types appear so the map is visually distinct. Insert these rows into the `hexes` table when the DB is initialized (Phase 1). If the table already has rows, you may use a one-time seed or "migration" step; document it.
3. **Main process:** Ensure `getGameState()` returns `hexes` with `h3Index` and `terrain` for all ~50 hexes, in a stable order (e.g. same as the generated list).
4. **Renderer:** Refactor the hex grid so that it can draw an **arbitrary list of hexes** (from game state) rather than a fixed 19-hex list. Reuse existing H3 boundary and drawing logic. For each hex, use **terrain** to choose fill color (e.g. land = one color, water = another). Preserve pan, zoom, and hit-testing; hit-test against the same hex list. The sidebar can still show H3 index and cube coordinates for the selected hex; optionally show terrain for the selected hex.
5. **Layout:** If the larger grid does not fit the previous default view, adjust the default scale or fit-to-bounds so the full map is visible (or document that the user pans/zooms to see all).

**Verification:**

- Run the app. The map shows approximately 50 hexes (or the chosen count). Two distinct terrain colors are visible (land and water). Selecting a hex still updates the sidebar. Pan and zoom still work. Game state from IPC includes all hexes with correct terrain.

**Exit condition:** Map is data-driven from SQLite; ~50 hexes with land/water terrain are visible and selectable.

---

## Phase 4: Units model and initial placement (3–5 per side, three types)

**Goal:** Define the three unit types (infantry, armor, naval), place 3–5 units per player on the map at game start, store them in SQLite, and draw them in the renderer.

**Tasks:**

1. **Unit types:** Document the three types: `infantry`, `armor`, `naval`. Movement rules (for later phases): naval → water only; infantry and armor → land only. No combat in 0.2.
2. **Initial placement:** When the game is first initialized (e.g. when the DB is created or when a "new game" path is triggered), insert 3–5 units per side into the `units` table. Place them on valid hexes (human units on land, opponent units on land; or mix if desired — document). Use distinct, stable IDs (e.g. `human-infantry-1`). Ensure each unit has a valid `h3_index` that exists in `hexes` and matches terrain for that unit type (naval on water, others on land).
3. **Main process:** `getGameState()` already returns `units`. Ensure the list includes all fields needed for rendering: `id`, `player`, `unitType`, `h3Index`.
4. **Renderer:** For each unit in game state, draw a **unit marker** on the corresponding hex (e.g. a small shape, icon, or label). Differentiate the two players (e.g. color or shape). Differentiate unit types if desired (e.g. different symbols for infantry, armor, naval). Ensure units are drawn after hexes so they are visible on top. Use the same coordinate transform as hex drawing so units stay aligned when panning/zooming.
5. **New game:** If the DB is created empty and never seeded with units, define a single "new game" or "init game" path (e.g. called once when no units exist) that seeds the map hexes (Phase 3) and places the initial units. Document when this runs (e.g. first launch or a "New game" menu).

**Verification:**

- Run the app. The map shows 3–5 units for the human side and 3–5 for the opponent, with at least two unit types visible. Units sit on correct terrain (naval on water, others on land). Selecting a hex that has a unit still shows hex info; unit identification in the UI can be Phase 5 or 6.

**Exit condition:** Units are stored in SQLite and displayed on the map; both sides have 3–5 units of the three types.

---

## Phase 5: WEGO turn state machine and orders API (main process)

**Goal:** Implement the WEGO loop in the main process: planning phase, submission of orders, transition to resolution, simultaneous application of movement, then transition to the next turn's planning phase. Expose submit-orders and resolve (or "ready") via IPC.

**Tasks:**

1. **Turn state:** Ensure the DB has a single source of truth for `phase` (`'planning'` | `'resolution'`) and `turn_number`. On a fresh game, phase is `'planning'`, turn_number is 1 (or 0; document).
2. **Movement validation:** Implement a **validation function** (main process): given a unit id and a destination `h3_index`, check (a) the unit exists and belongs to the human player for 0.2, (b) the destination hex is in the map, (c) the destination is **adjacent** to the unit's current hex (use H3 `gridDistance` or equivalent), (d) terrain allows the unit type (naval → water only, infantry/armor → land only). Return success or a clear error reason.
3. **Pending orders:** During planning, the renderer will send a list of movement orders (e.g. `{ unitId: string, toH3Index: string }[]`). Main process stores these in the `pending_orders` table (or in-memory for the current phase), replacing any previous set for this turn. No duplicate unit IDs (at most one order per unit per turn).
4. **IPC: submitOrders(orders):** Add an IPC handler that (a) checks phase is `'planning'`, (b) validates each order, (c) rejects the whole batch if any order is invalid (return `{ success: false, reason: string }` or similar), (d) stores pending orders and returns `{ success: true }`. Add debug-level logging on invocation; add error-level logging for caught exceptions and for validation failures (when the batch is rejected).
5. **IPC: ready() or endPlanning():** Add an IPC handler that (a) checks phase is `'planning'`, (b) transitions to `'resolution'`, (c) **applies all pending orders simultaneously:** for each order, update the unit's `h3_index` to `to_h3_index` in the DB (do not check for collisions or combat in 0.2), (d) clear pending orders, (e) increment `turn_number`, (f) set phase back to `'planning'`, (g) return the updated game state or success. All moves are applied in one step so that resolution is simultaneous (WEGO).
6. **Preload:** Expose `submitOrders(orders)` and `ready()` (or `resolveTurn()`) on the contextBridge API. Type the arguments and return values.

**Verification:**

- From the renderer (or a temporary test script), call `submitOrders` with valid orders (unit on land, adjacent land hex for infantry). Then call `ready()`. Query the DB or call `getGameState()` again; unit positions have updated, turn_number incremented, phase is planning. Call `submitOrders` with an invalid order (e.g. non-adjacent hex); expect rejection. Call `ready()` twice without submitting; second call should no-op or return an error (phase already planning). No combat or collision logic.

**Exit condition:** Main process implements planning → submit orders → ready → resolution (simultaneous move) → next planning. IPC and validation are in place; state is persisted in SQLite.

---

## Phase 6: Planning-phase UI (select unit, choose destination, Ready button)

**Goal:** The human player can select a unit by clicking it, then click a destination hex to add a movement order; see pending orders; click "Ready" to end planning and trigger resolution. The renderer sends orders via IPC and refreshes state after resolution.

**Tasks:**

1. **Unit selection:** When the user clicks a hex that contains a human-owned unit, treat it as **unit selection** (and optionally still show hex info in the sidebar). Store "selected unit" in renderer state. If the user clicks a hex with no unit or an opponent unit, clear unit selection or show hex only (document behavior). Visually indicate the selected unit (e.g. highlight or border).
2. **Destination click:** When a unit is selected and the user clicks another hex, interpret that as **destination for movement**. In the renderer, add a pending order (unit id, destination h3_index) to a local list. Do not send to main process yet, or send immediately and refetch state — choose one and be consistent. Show pending orders in the UI (e.g. list in sidebar or lines on the map). Allow multiple orders (one per unit). Allow clearing an order (e.g. click the unit again or a "clear" control).
3. **Ready button:** Add a **"Ready"** button (e.g. in the sidebar or a toolbar). When clicked, (a) send all pending orders to main via `submitOrders(orders)`, (b) if success, call `ready()` to run resolution, (c) on success, call `getGameState()` and update the renderer's view (hexes, units, turn number, phase). If `submitOrders` fails (e.g. invalid order), show the error and do not call `ready()`. Disable or hide "Ready" when there are no pending orders, or allow "Ready" with no orders (end turn with no moves).
4. **State refresh:** After resolution, the renderer must redraw the map and units from the new game state so that moved units appear in their new positions. Preserve pan/zoom and selection state as appropriate (e.g. clear unit selection after resolution).
5. **Turn/phase indicator:** Show current turn number and phase (planning / resolving) in the UI so the player knows the state.

**Verification:**

- Play through a full cycle: select a human unit, click an adjacent valid destination, see the order in the UI, click Ready. After resolution, units have moved on the map and turn number has increased. Try an invalid destination (e.g. non-adjacent or wrong terrain); submission should fail with a clear message. Pan and zoom still work; grid and units remain aligned.

**Exit condition:** Full WEGO loop is playable from the UI: plan orders, Ready, resolve, see result. Game state is authoritative in SQLite and reflected in the renderer.

---

## Phase 7: Polish, logging, and documentation

**Goal:** Code is consistent, logged, and documented; README and verification matrix are updated for 0.2.

**Tasks:**

1. **Logging:** Add debug-level logs for all public main-process API invocations (getGameState, submitOrders, ready). Add error-level logs for caught exceptions (e.g. DB errors, validation failures). Add trace-level for getter-style methods. Use the project's existing logging API when present; otherwise introduce a single logging abstraction. Do not check log level before calling unless building large strings inline.
2. **Comments:** Add **orienting comments** for all new/updated public non-overriding methods (main and renderer). Document the WEGO state machine (planning → resolution → planning), the schema (hexes, units, turn state, orders), and movement rules (terrain and adjacency).
3. **README:** Update the README with: what Milestone 0.2 adds (50-hex map, terrain, units, WEGO turns, SQLite persistence); how to run the app; how to play (select unit, click destination, Ready). Mention that the second player's units do not move in 0.2.
4. **Dependencies:** Pin better-sqlite3 (and any new deps) with major/minor in package.json. Document where the SQLite file is stored (e.g. app user data dir).
5. **Linting:** Ensure all new and modified files pass the project lint/format. Fix any new warnings.

**Verification:**

- A new developer (or agent) can read the README and understand how to run and play. Logs appear at appropriate levels when exercising getGameState, submitOrders, and ready. No regressions in Phases 1–6.

**Exit condition:** Codebase is consistent, documented, and lint-clean; 0.2 scope is complete and verifiable.

---

## Verification matrix

| Phase  | Verification |
|--------|---------------|
| 1      | SQLite DB created on startup with hexes, units, turn_state, pending_orders tables; main process initializes DB. |
| 2      | Preload exposes getGameState(); renderer receives game state via IPC; no raw DB in renderer. |
| 3      | ~50 hexes with land/water terrain; map data-driven from DB; terrain colors and selection work. |
| 4      | 3–5 units per side, three unit types; units on correct terrain; displayed on map. |
| 5      | submitOrders() and ready() IPC work; validation (adjacency, terrain); resolution updates positions and turn number in DB. |
| 6      | Select unit, click destination, see pending orders, Ready → resolution; UI reflects new state. |
| 7      | Logging and comments in place; README updated; lint passes; no regression. |

---

## Risk and clarification notes

- **better-sqlite3 and Electron:** better-sqlite3 is a native module; ensure the Electron rebuild or prebuilt binaries are used if required for your Electron/Node version. Prefer a version that supports your current Electron LTS without custom rebuild if possible.
- **50-hex geometry:** k-ring 3 = 37 hexes, k-ring 4 = 61. Using 37 is acceptable ("~50"); using 61 and trimming to 50 or using all 61 is also acceptable. Document the choice.
- **Terrain seeding:** Reproducibility is more important than realism. A simple rule (e.g. every Nth hex is water, or a fixed bitmap) is sufficient for 0.2.
- **Second player:** In 0.2 only the human player issues orders. The opponent's units are placed and displayed but do not move. This keeps the scope minimal and sets up 0.3 (LLM opponent).
- **Order semantics:** One order per unit per turn. If the user selects the same unit twice with different destinations, the last destination wins or replace the previous order for that unit; document the behavior.
- **Coordinate system:** Reuse the same H3 resolution and center as 0.1 for the expanded grid so that existing hex drawing and hit-test logic can be extended rather than replaced. If the center or resolution changes, update the 19-hex logic to the new grid or remove the 19-hex-only path.

---

## Questions for the product owner (optional)

1. **Second player units:** Should opponent units be placed in a fixed pattern (e.g. one side of the map) or random (with a fixed seed)?
2. **Ready with no orders:** Is it allowed to click "Ready" without submitting any orders (effectively passing the turn)?
3. **Unit appearance:** Prefer distinct symbols per unit type (e.g. NATO-style or simple shapes) or just color per player with a label?
4. **DB location:** Prefer SQLite file in Electron `app.getPath('userData')` or a project-relative path for development (e.g. `./data/game.db`)?

If these are not specified, the implementing agent should choose sensible defaults and document them in the README and/or code comments.
