# Milestone 0.3 — The LLM Opponent: Execution Plan

*Version 1.0 — March 2026*

This document is an execution plan for implementing **Milestone 0.3** from the [Strategic Development Plan](development-plan.md), plus the following product-owner specifics: window sizing and centering, non-map panel layout (top/bottom split), OpenRouter controls and error overlay, tripled hex count, and adherence to the [UI Style Guide](ui-style-guide.md). It is written for a coding agent and is organized in phases that are **independently verifiable or verifiable with previously completed phases**. Each phase produces reliable, understandable code suitable for future developers.

---

## Scope Summary

**Deliverable:** Extend the application from Milestone 0.2 to:

1. **Window:** Default size 3/4 of available screen size, centered on startup.
2. **Layout:** Non-map section remains on the **right**, with a **minimum width** so it can host all required UI controls. The non-map section is **split into top and bottom**:
   - **Top:** Turn, phase, game state information, and planning-phase controls (selected hex, pending orders, Ready button) as called for by the milestone.
   - **Bottom:** OpenRouter support: API key entry, model selection dropdown, and status/log output for LLM execution (minimally: key field and model list; plus reasonable status and log area).
3. **Errors:** Misconfiguration or non-configuration of OpenRouter (e.g. missing key, invalid key, no model) must produce **clear, actionable messages overlaid onto the map** (not only in the sidebar).
4. **Map size:** **Triple the number of hexes** on the map (current ~37 → target ~111+; use k-ring 6 for 127 hexes).
5. **LLM opponent (milestone 0.3):** Before resolution, send current game state (structured text or JSON) and a system prompt to an LLM via **OpenRouter**. LLM returns movement orders in a structured format; game validates and executes those orders alongside the human's. Start with a simple prompt (no MCP yet).
6. **Style:** Enforce the [UI Style Guide](ui-style-guide.md) wherever and whenever appropriate (typography, color, layout, controls, notifications).
7. **Compatibility:** Preserve features from Milestones 0.1 and 0.2 (hex grid, terrain, units, WEGO planning and resolution, SQLite game state).

**Technical constraints:**

- **Prerequisite:** Milestone 0.2 is complete (Electron, TypeScript, ~37-hex map, terrain, units, WEGO, sql.js in main process). Do not switch to better-sqlite3; keep existing sql.js-based game DB.
- **OpenRouter:** API key is sensitive; use Electron `safeStorage` (or equivalent) for persistence if available; do not log or expose the key. Use OpenRouter's list-models and chat/completion API as needed.
- **IPC:** Extend the existing preload/contextBridge API for new handlers (e.g. get/set OpenRouter key, list models, trigger AI turn). No nodeIntegration in renderer.

**Out of scope for 0.3:** Combat, fog of war, MCP tools, save/load, multiple maps. AI orders are movement-only; validation reuses the same movement rules as human orders (terrain, range, one order per unit).

**Code quality goals:** Reliable and understandable code; simple, explicit logic; consistent naming; each phase independently verifiable where possible. Follow project rules (logging, comments, nullability, tests only for essential contracts). **No copyright headers** are required on the execution plan or other spec documents, or on generated code for this milestone.

---

## Compliance with project rules

Implementing agents must follow the project's coding rules. "Backend" here means the **Electron main process**.

- **Comments:** All new and updated **public, non-overriding** methods must have an **orienting comment** (why, when to use, how to use, results and exceptions). For interface/API methods, focus on **contracts**; for implementation methods, focus on **high-level implementation details**.
- **Logging:** Use the **existing logging API**. **Debug** for public method invocations, **error** for caught exceptions, **trace** for getter-style methods that don't modify state. Include enough detail for troubleshooting. Do not check log level before calling the logging API unless potentially large strings are being constructed inline.
- **Testing:** Test only **happy paths and essential failure cases**; **code contracts**, not implementation details. No tests for trivial delegation, DTOs, or REST-style controllers that only delegate.
- **Nullability:** Trust package nullability annotations; use TypeScript optional types (or equivalent) where parameters or returns may reasonably be null and check where appropriate.
- **Reliability:** When generating code for the first time, double-check correctness and clarity so the result is reliable and easy to understand.

Apply the [UI Style Guide](ui-style-guide.md) for all UI: military-cartographic tone, map-first layout, typography (sans-serif; monospace for coordinates/IDs/logs), color palette (terrain, UI chrome, accents), panels subordinate to map, non-blocking notifications, WEGO phase clarity.

---

## Prerequisites (Before Phase 1)

- **Milestone 0.2:** Implemented and runnable: ~37-hex map, terrain, units, WEGO planning and resolution, game state in sql.js, preload API (`getGameState`, `submitOrders`, `ready`). App runs with `npm run build` and `npm start`.
- **OpenRouter:** Implementer has (or can obtain) an OpenRouter API key and understands the OpenRouter list-models and chat API (e.g. https://openrouter.ai/docs).

No code in Prerequisites; verification is that 0.2 runs and the implementer has access to the above.

---

## Phase 1: Window size, centering, and sidebar layout

**Goal:** On startup, the main window is sized to 3/4 of the primary display's work area and centered. The non-map section stays on the right with a minimum width and is divided into a top section (game/turn controls) and a bottom section (reserved for OpenRouter UI in a later phase).

**Tasks:**

1. **Main process:** In `createWindow()` (or equivalent), use Electron's `screen` module: `screen.getPrimaryDisplay()` to get the primary display, then use its **work area** (e.g. `display.workArea`: `x`, `y`, `width`, `height`) for both size and position. Set the window width and height to 3/4 of the work area dimensions (e.g. `Math.floor(workArea.width * 0.75)`, same for height). Center the window: set `x` and `y` so the window is centered in the work area (e.g. `x = workArea.x + (workArea.width - width) / 2`, `y = workArea.y + (workArea.height - height) / 2`). Ensure minimum dimensions (e.g. 800×600) so the app remains usable on small or odd displays.
2. **HTML/CSS:** Keep the existing flex row layout: canvas-container (flex: 1, min-width: 0) on the left, non-map panel on the right. Set a **minimum width** for the non-map panel (e.g. 280px or 320px from the style guide) so it can host turn info, controls, and later the OpenRouter section. Use a single aside (or container) that is **split into two regions**: a **top** block (turn, phase, selected hex, pending orders, Ready button) and a **bottom** block (placeholder or empty container for Phase 5). Use flexbox or grid so the top section gets enough space for its content and the bottom section has a defined minimum height (e.g. 180px) so the OpenRouter UI will fit. Ensure the right panel does not collapse below the minimum width when the window is resized.
3. **Style guide:** Apply baseline style-guide colors and typography to the sidebar (e.g. UI chrome background, borders, font sizes). No new behavior in the bottom section yet.

**Verification:**

- Run the app. The window opens at 3/4 of the primary screen size and is centered. Resize the window; the right panel never goes below the minimum width. The right panel clearly shows a top area (turn, phase, controls) and a bottom area (empty or placeholder). No regression: game state, Ready, and orders still work as in 0.2.

**Exit condition:** Window size and position and two-region sidebar layout are in place and stable.

---

## Phase 2: Apply UI style guide to existing UI

**Goal:** Bring the current UI (map chrome, sidebar, buttons, labels) into alignment with the [UI Style Guide](ui-style-guide.md): typography, color palette, spacing, and control styling.

**Tasks:**

1. **Typography:** Use a single sans-serif family for UI and data (e.g. 12–14px base). Use medium/semibold only for emphasis (e.g. "Your turn", selected unit). Use monospace only for coordinates, hex indices, and technical data (e.g. H3 index in sidebar).
2. **Colors:** Apply the style guide palette: UI chrome background (e.g. light `#f0eeea` or dark `#2a2a2a`), terrain (muted land/water as specified), player accents (e.g. P1/P2), selection/focus, and warning/error. Replace ad-hoc grays and blues with the palette. Ensure canvas background and hex fills/strokes use the terrain palette.
3. **Layout and hierarchy:** Panels have clear boundaries (background + subtle border). Consistent padding and gaps. Top bar / sidebar sections use the same type scale and spacing. Buttons are clearly clickable (padding, hover state).
4. **WEGO clarity:** Phase (Planning / Resolving) and turn number are clearly visible in the top section; "Ready" is the primary commit action and is visually distinct.

**Verification:**

- Visual pass: map and sidebar match the style guide (typography, colors, spacing). No functional change to game logic or IPC. Pan/zoom, selection, orders, and Ready still work.

**Exit condition:** Existing UI conforms to the style guide; no regressions.

---

## Phase 3: Triple the number of hexes on the map

**Goal:** Increase the map from ~37 hexes to approximately three times that (~111). Use a k-ring that yields at least 111 hexes (e.g. k-ring 6 → 127 hexes). All game state (hexes, terrain, units) remains driven by the main process and the database.

**Tasks:**

1. **Map data:** In `mapData.ts`, change the k-ring from 3 to 6. Formula: `gridDiskDistances(center, 6)` yields 1+6+12+18+24+30+36 = 127 hexes. Keep the same H3 resolution and center so coordinate math is unchanged. Export or use the same `getOrderedHexList()` so the DB and renderer share one ordered list.
2. **Database seeding:** Ensure `seedHexesIfEmpty()` (or equivalent) uses the new ordered list. Terrain rule (e.g. every 4th hex water) remains reproducible. If the DB already has 37 hexes from a previous run, either document a one-time migration (e.g. clear hexes and reseed) or support both old and new counts; prefer a clean reseed for a simple 0.3 implementation (document that deleting the DB file gives the new map).
3. **Unit placement:** Update `seedUnitsIfEmpty()` so initial human and opponent units are placed on valid hexes from the new list (land/water as before). Ensure 3–5 units per side with valid terrain. Use indices or a rule that scales to 127 hexes (e.g. land indices from the new list).
4. **Renderer:** No change required to hex drawing or hit-test if the renderer already uses `gameState.hexes` for the hex list; the list is now longer. If any fallback uses a hardcoded 19- or 37-hex list, remove or update it to use game state only. Ensure fit-to-bounds and pan/zoom still work with the larger grid.
5. **Hex grid module:** The renderer cannot import main-process `mapData`. If `hexGrid.ts` has a default `getHexCells()` used when game state is missing (e.g. before first load), either (a) ensure the renderer always has game state before drawing so the fallback is rarely used, or (b) introduce a **shared** module (e.g. `src/shared/` or a constants file) that both main and renderer can import, containing the k-ring 6 hex list or the logic to generate it (e.g. using h3-js, which is available in both contexts), and have `getHexCells()` use that. Do not import `mapData` from the renderer.

**Verification:**

- Run the app (with a fresh DB if necessary). The map shows 127 hexes (or the chosen count ≥111). Terrain (land/water) and units are visible and correctly placed. Selection, orders, and Ready still work. No regression in movement validation (still uses the same map hex set in gameActions).

**Exit condition:** Map has roughly three times the previous hex count; game state and rendering use the same ordered list end-to-end.

---

## Phase 4: OpenRouter backend (key, models, prompt, response parsing)

**Goal:** Implement the main-process OpenRouter integration: store and retrieve API key securely, fetch available models, send game state and system prompt to the LLM, and parse the response into a list of movement orders for the opponent. No UI for key/model yet (Phase 5); no integration into the Ready flow yet (Phase 6).

**Tasks:**

1. **API key storage:** In the main process, provide a way to set and get the OpenRouter API key. Prefer Electron `safeStorage` for persistence (encrypt and store in a small config file or use a keychain if available). If `safeStorage` is unavailable, document and use a plain file in userData with restrictive permissions; do not log or expose the key. Expose get/set via IPC only (no key in renderer except in a password-type input). Add IPC handlers, e.g. `openRouter:getKey` (returns masked or empty), `openRouter:setKey` (store and optionally validate with a minimal API call).
2. **List models:** Implement a function that calls OpenRouter's models list API (e.g. `GET https://openrouter.ai/api/v1/models`) using the stored key. Return a list of model identifiers (or id + display name) suitable for a dropdown. Handle errors (401, network) and return an empty list or error message. Expose via IPC, e.g. `openRouter:listModels`.
3. **Request AI orders:** Implement a function that (a) takes current game state (hexes, units, phase, turn) and the selected model id, (b) builds a system prompt describing the game rules, the map (e.g. hex list with terrain), and the opponent's units and their movement rules, (c) asks the LLM to return movement orders in a **structured format** (e.g. JSON array of `{ unitId, toH3Index }`), (d) sends the request to OpenRouter chat/completion API, (e) parses the response and extracts the orders array. Validate that each order references an opponent unit and a valid destination (same movement rules as human: terrain, range, one per unit). **Drop invalid orders and apply the rest**; log the decision and relevant outcome (e.g. how many dropped, which order failed and why). Return either the validated orders (possibly a subset) or an error (e.g. "No API key", "Invalid response"). Add debug logging for invocation; error logging for exceptions and validation failures.
4. **Prompt design:** Keep the system prompt simple: describe WEGO, the hex grid (list opponent and human units with H3 indices and terrain), movement rules (infantry 1, armor 2, naval 1; land/water), and require a JSON array of orders. Document the prompt format in the code or in `.spec` so it can be tuned later.
5. **Preload:** Expose `openRouter:getKey`, `openRouter:setKey`, `openRouter:listModels`, and a handler to request AI orders (e.g. `openRouter:requestOrders` with `{ modelId }` or similar). Return types: success with orders array or failure with reason.

**Verification:**

- With a valid API key set (e.g. via a temporary test or dev path), list models returns at least one model. Requesting AI orders with a chosen model returns either a list of validated orders or a clear error. Invalid or malformed LLM output is caught and reported. No key is logged or sent to the renderer in plain text.

**Exit condition:** Main process can store key, list models, and request and parse AI orders; IPC is in place for use by the UI and the Ready flow.

---

## Phase 5: OpenRouter UI (key, model dropdown, status/log) in bottom section

**Goal:** The bottom part of the right panel hosts OpenRouter controls and status: API key entry (masked), model selection dropdown, and a status/log area for LLM execution (e.g. "Idle", "Requesting orders…", last request result, or a short log). Errors from misconfiguration are shown in the UI and will be overlaid on the map in Phase 7.

**Tasks:**

1. **Key input:** Add a labeled, password-type (or masked) input for the OpenRouter API key in the bottom section. On change or blur, send the value to main via `openRouter:setKey`. Optionally show a "Saved" or "Not set" hint. Do not display the raw key.
2. **Model dropdown:** Add a dropdown (select) populated by calling `openRouter:listModels` (on load or via a "Refresh" button). Store the selected model id in renderer state and send it when requesting AI orders. If the list fails (e.g. no key), show an empty list and a short message ("Set API key and refresh").
3. **Status and log:** Add a status/log area for LLM execution. Prefer a **scrollable log** of the last N LLM requests (e.g. request time, model, token count, success/failure) if it can reasonably fit and remain useful in the bottom section—a relatively small font is acceptable. If space is insufficient, use a **single status line** (e.g. "Idle" / "Requesting AI orders…" / "Done" / "Error: …"). When the AI is invoked (Phase 6), update with progress and result. Use style guide colors for error/warning.
4. **Layout:** Ensure the bottom section has a minimum height and does not push the top section off-screen. Use the same typography and spacing as the rest of the sidebar (style guide). Group controls with clear labels.

**Verification:**

- Set a key (or leave empty), refresh models; dropdown shows models or a clear message. Select a model. Status area updates when AI is requested (Phase 6). No regression in top section (turn, orders, Ready).

**Exit condition:** Bottom section contains key input, model dropdown, and status/log; UI is wired to main process OpenRouter API.

---

## Phase 6: LLM opponent in the turn flow

**Goal:** When the human clicks "Ready", before running resolution the game requests movement orders from the LLM for the opponent, validates them, merges them with human pending orders, and then executes all orders simultaneously. If the LLM step fails (no key, no model, API error, parse error), **do not block**: resolve only human orders, log the AI skip, and return a result so the renderer can show status and/or overlay (Phase 7).

**Tasks:**

1. **Ready flow (main process):** In `ready()` (or the handler that runs resolution), after checking phase is `planning` and before applying moves: (a) call the OpenRouter integration to get AI orders (using the stored key and the model selected in the UI—model selection must be passed from renderer, e.g. stored in main or passed on each Ready). (b) If AI orders are returned, validate each (opponent unit, valid destination, terrain, range, one per unit); **drop invalid orders and apply the rest**. Log the decision and any relevant outcome or supporting information (e.g. how many were dropped, which unit/order failed validation). (c) Merge human pending orders (already in DB) with validated AI orders. (d) Apply all orders: update unit positions for both human and opponent units. (e) Clear pending orders, increment turn, set phase back to planning. **When the AI step fails** (no key, no model, timeout, parse error): **do not block resolution**—resolve **only human orders**, log the AI failure, and return a result that indicates the AI was skipped (so the renderer can show a message and/or overlay if desired).
2. **Renderer:** When the user clicks Ready, the renderer already calls `submitOrders` and then `ready()`. Ensure the selected model id is sent to main when needed (e.g. pass model id as an argument to `ready()` or via a separate "set AI model" IPC that main stores). After `ready()` succeeds, refresh game state and redraw so both human and opponent units move (or only human if AI was skipped).
3. **Logging and status:** Main process logs debug for "requesting AI orders", and error for failures. Return a result that allows the renderer to show success or failure (e.g. "AI orders: N" or "AI skipped: …"). Renderer updates the bottom-panel status/log with the outcome.

**Verification:**

- With a valid key and model, click Ready; both human and opponent units move after resolution. With an invalid key or no model, Ready still runs and only human orders resolve; the user sees a clear outcome (e.g. status "AI skipped" and optionally overlay). No regression: human-only orders always work when AI is not configured.

**Exit condition:** WEGO resolution includes LLM-generated opponent orders when configured; flow is documented and verifiable.

---

## Phase 7: Map overlay for OpenRouter and configuration errors

**Goal:** When OpenRouter is misconfigured or an error occurs (e.g. no API key, no model selected, API error, invalid response), show a **clear, actionable message overlaid onto the map** (not only in the sidebar). The overlay is **permanent** (stays until dismissed or the condition is resolved) to avoid flickering, remains **small** and in the **lower left** so the user can focus on the map and the rest of the UI, and matches the style guide for notifications/errors.

**Tasks:**

1. **Overlay component:** Add an overlay region on top of the map that can display a short message. Place it in the **lower left corner of the map**, **left-aligned**. Use style guide error/warning colors and typography. Keep the overlay **relatively small** so the user can focus on the map and the rest of the UI. The overlay is **permanent** (not auto-dismissing or flickering)—it stays until the user dismisses it or the condition is resolved—to avoid visual flicker.
2. **Trigger conditions:** When the user tries to use the AI (e.g. Ready with opponent units on the map) and (a) no API key is set, (b) no model is selected, (c) the API returns an error, or (d) the LLM response is invalid—show the corresponding message on the overlay. Messages must be **actionable** (e.g. "Set your OpenRouter API key in the panel on the right", "Select an AI model from the dropdown", "OpenRouter request failed: timeout—check your connection").
3. **Dismissal:** Allow the user to dismiss the overlay (e.g. close button or click-away). When the issue is fixed (e.g. key set, model selected, next successful AI request), clear the overlay. Do not auto-dismiss after a few seconds; keep the overlay stable (permanent until dismissed or resolved) to avoid flickering.
4. **Sidebar consistency:** Keep showing error or status in the bottom section as well if desired; the overlay is the primary way to surface configuration/API errors so the user sees them in context of the map.

**Verification:**

- Clear API key and click Ready; overlay appears on the map with a message like "Set your OpenRouter API key…". Set key but leave no model selected; trigger Ready; overlay shows "Select an AI model…". Cause an API error (e.g. invalid key); overlay shows a clear, actionable message. Overlay stays until dismissed or condition is resolved (no flicker). Overlay is small and lower-left so the map remains in focus. Dismiss overlay; map is usable again. Style matches the style guide (notification/error).

**Exit condition:** Configuration and OpenRouter errors are shown as clear, actionable messages on a permanent (non-flickering), small, lower-left map overlay; overlay is dismissible and does not block play.

---

## Verification matrix

| Phase  | Verification |
|--------|---------------|
| 1      | Window opens at 3/4 screen size, centered; right panel has min width and top/bottom split; game controls still work. |
| 2      | Typography, colors, spacing, and controls match the UI style guide; no behavior regression. |
| 3      | Map has ~127 hexes; terrain and units correct; selection, orders, Ready work. |
| 4      | Main process can store key, list models, request and parse AI orders; IPC in place; key not exposed. |
| 5      | Bottom section has key input, model dropdown, status/log; wired to OpenRouter API. |
| 6      | Ready triggers AI order request; validated AI orders execute with human orders; when AI fails, only human orders resolve and status reflects skip. |
| 7      | Map overlay (lower left, left-aligned, small, permanent until dismissed/resolved) shows clear, actionable messages for missing key, no model, API/parse errors; no flicker. |

---

## Risk and clarification notes

- **OpenRouter key:** Prefer Electron `safeStorage`; document behavior when unavailable. Never log or echo the key.
- **Model list:** OpenRouter model list may be large; consider caching or limiting dropdown size. Document which models are recommended (e.g. one cheap, one capable) in README or .spec.
- **AI order validation:** Reuse the same movement validation as human orders (terrain, range, one per unit). **Drop invalid AI orders and apply the rest**; log the decision and relevant outcome or supporting information (e.g. count dropped, which order failed and why).
- **Ready with no AI:** When the user has not set a key or model (or the AI request fails), **allow Ready** and **resolve only human orders**; log the AI skip and optionally show overlay/status so the user knows the AI was skipped.
- **Triple hex count:** k-ring 6 = 127 hexes. Unit seeding must pick valid land/water indices from the new list; ensure both sides have valid starting positions. The renderer gets the hex list from game state (IPC); main-process `mapData` is not importable in the renderer, so any fallback hex list in the renderer must come from a shared module or be avoided (game state loaded before first draw).
- **Style guide:** "Wherever and whenever appropriate" means: all new and updated UI (sidebar, overlay, buttons, labels) should follow the guide; existing map and hex drawing should be updated in Phase 2.

---

## Decisions (product owner)

1. **Ready when AI is not configured:** Allow Ready and resolve only human orders (do not block).
2. **Bottom panel status/log:** Prefer a scrollable log of the last N LLM requests if it can reasonably fit and remain useful (a relatively small font is acceptable); otherwise use a single status line.
3. **Overlay position:** Lower left corner of the map, left-aligned.

---

## Additional decisions (product owner)

4. **Mixed valid/invalid AI orders:** **Drop invalid orders and apply the rest.** Log the decision and any relevant outcome or supporting information (e.g. how many orders were dropped, which unit or order failed validation and why).
5. **Overlay behavior:** The overlay is **permanent** (no auto-dismiss or flickering)—it stays until the user dismisses it or the condition is resolved. It remains in the **lower left corner** of the map and **relatively small** so the user can focus on the map and everything else.
