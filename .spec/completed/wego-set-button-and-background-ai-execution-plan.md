# WEGO Run Button and Background AI — Execution Plan

**Audience:** Coding agent implementing the feature  
**Version:** 1.1  
**Goals:** Add a "Run" toggle next to the model dropdown; when Run is off, Ready remains enabled so the user can resolve without the LLM; when Run is on, run AI order-request in the background; enable Ready only when the LLM has issued orders; disable Ready on click for resolution; then immediately start the next turn’s AI planning if Run remains on. When the user un-toggles Run while the AI is planning, stop the current planning process. This reduces delay between turns (WEGO play style) and keeps the flow clear and reliable.

---

## 0. Stated Goals Checklist

| # | Stated need | Where the plan addresses it |
|---|-------------|-----------------------------|
| 1 | Run button (label "Run"; id openrouter-run-btn; variables/functions e.g. runButtonOn, updateReadyButtonState) | §1.2; Phases 1–4 (label, id, variables, comments). |
| 2 | When Run is off, Ready remains enabled (user can resolve without LLM) | §1.1; Phase 3 (`updateReadyButtonState`: Run off ⇒ Ready enabled when not game over). |
| 3 | When Run is on, Ready only enabled when LLM has finished planning | §1.1, §1.3; Phase 3 (Run on ⇒ Ready enabled only when `precomputedAiOrders !== null`). |
| 4 | When Run is toggled on, AI workflow begins in the background | §1.3; Phase 2 (request-only IPC), Phase 3 (start background on Run on). |
| 5 | Once the AI has issued its orders (Run on), enable Ready | §1.3; Phase 3 (on background result success → store orders, enable Ready). |
| 6 | Disable Ready when it is clicked for turn resolution; re-enable per rules above | §1.3; Phase 3 (disable at click; then Run off ⇒ enable, Run on ⇒ enable when next result arrives). |
| 7 | After resolution, if Run still on, LLM begins planning the next turn immediately | §1.3; Phase 3 (after Ready result + state update, if Run on → start background request again). |
| 8 | When user un-toggles Run while AI is planning, stop the current planning process | §1.3, §2.6; Phase 2 (cancel/cancel token), Phase 3 (renderer calls cancel when Run off). |

---

## 0b. Compliance with Stated Needs and Workspace Rules

- **Phases are independently verifiable:** Phase 1 is UI-only (Ready enabled when not game over; Run button present and styled). Phase 2 adds main-process APIs (request-only IPC with cancellation, precomputed-orders path for `game:ready`), testable via unit or manual IPC. Phase 3 wires renderer (Run → background request, Ready rules by Run state, cancel when Run off), verifiable end-to-end. Phase 4 covers edge cases and consistency.
- **Reliability and clarity:** Each phase defines clear contracts (IPC payloads, when Ready is enabled/disabled by Run state, single in-flight background request, cancel in-flight when Run toggled off).
- **Future-developer clarity:** Orienting comments, single place for "when is Ready enabled," and explicit handling of Run off / Run on / no model / not planning phase.

Alignment with **workspace Code-Generation-Rules**:

| Rule | How the plan addresses it |
|------|----------------------------|
| **1. Reliable, understandable code** | Phases order UI first, then main API, then renderer flow. State transitions (Ready enabled/disabled, precomputed orders, in-flight) are explicit. |
| **2. Logging** | All new/updated public main-process method invocations → debug; caught exceptions → error; getter-style → trace. Use existing logger APIs. |
| **3. Testing** | Happy path and essential failure cases only; contracts (e.g. precomputed orders used when provided, request-only returns same shape as existing requestOrders). No tests for DOM or IPC delegation boilerplate. |
| **4. Orienting comments** | New/updated public non-overriding methods get orienting comments (purpose, when to use, results and exceptions). |
| **5. Spec/docs in .spec** | This plan lives in `.spec`. |
| **6. Reusable code** | Reuse existing `requestOrders`, tool-group registry, and `game:ready` flow; add a thin request-only path and optional payload fields. |

---

## 1. Scope and Prerequisites

### 1.1 Ready button state (Run off vs Run on)

- **When Run is OFF:** The Ready button is **enabled** whenever the game is not over. The user can resolve turns without the LLM (move units with impunity). No background AI request runs; any in-flight request is **cancelled** when Run is toggled off.
- **When Run is ON:** Ready is **enabled** only when the game is not over **and** **precomputed AI orders are available** for the current turn. Ready is **disabled** when Run is on and (no precomputed orders yet, or the user just clicked Ready and the next background result has not yet arrived).
- **On Ready click:** Ready is disabled at the start of the handler; it is re-enabled by `updateReadyButtonState()` according to the rules above (Run off ⇒ enable if not game over; Run on ⇒ enable only when next precomputed result is available).
- **Single source of truth:** A single function in the renderer (e.g. `updateReadyButtonState()`) should centralize the logic: `readyBtn.disabled = true` when game over, or when (Run is on and `precomputedAiOrders === null`). **Every** code path that can affect Ready must call it—including when game state is updated (e.g. after resolution, on load, or any path that currently touches the Ready button such as game-over). That way game-over always disables Ready and Run and precomputed rules are applied in one place; no path should set `readyBtn.disabled` directly except inside this function.

### 1.2 Run button (UI)

- **Placement:** In the Model tab, to the **right of the model selection drop-down**, in the same row (`.openrouter-model-row`). Order of controls in the row: **Model &lt;select&gt;** → **Run** (toggle) → **Refresh** (existing). So: `[label] [select] [Run] [Refresh]`.
- **Aesthetics:** Match the tool toggles in the Tools tab:
  - Use a **toggle** (button with `aria-pressed`), not a checkbox.
  - Reuse the same CSS classes as tool toggles: `openrouter-tool-toggle`, with `aria-pressed="true"` (Run on) and `aria-pressed="false"` (Run off). Reuse existing styles (accent when on, muted when off) so Run looks like the Planning/Assessment/Estimation toggles.
  - **Label:** Button text can be **"Run"** (static). No count or dynamic text required for Run.
- **Behavior (Phase 1):** Toggle only flips local state (e.g. `runButtonOn: boolean`). No IPC or Ready logic yet; verification is visual and that state toggles.

### 1.3 Background AI workflow (high level)

- **When Run is toggled ON:**
  - If the game is in planning phase and API key and model are configured, **start a single background request** that asks the main process to compute AI orders for the **current** game state only (no turn resolution). Main uses the same `requestOrders(state, modelId, { enabledToolNames })` as today; it does not call `ready()`.
  - When the request **completes successfully**, the renderer stores the returned orders (and optional metadata) as **precomputed AI orders** for this turn, then **enables the Ready button** (via the central updater). If the request fails or AI is skipped, do not store orders and do not enable Ready.
  - Only **one** background request is in flight at a time. While a request is in flight, do not start another (e.g. ignore repeated Run-on or redundant triggers).
- **When the user clicks Ready:**
  - **Disable** the Ready button immediately (at the start of the handler).
  - Submit human orders and then call **game:ready** with the **precomputed** AI orders (if any) so the main process does **not** call the LLM again for this turn; it only resolves the turn with stored human + precomputed AI orders.
  - After resolution, update local game state (e.g. via existing `getGameState()`). If **Run is still on**, start the **next** background request for the **new** turn/state (same as “Run toggled on” above). When that request completes successfully, store new precomputed orders and enable Ready again.
- **When Run is toggled OFF:**
  - **Cancel** the current planning process (in-flight request) in whatever state it is in (see §2.6). Clear any stored precomputed AI orders. **Enable** the Ready button (via `updateReadyButtonState()`: Run off ⇒ Ready enabled when not game over) so the user can resolve without the LLM. Do not start a new background request.

### 1.4 Prerequisites (must already exist)

- AI panel with Model tab containing API key and model dropdown (see `.spec/ai-panel-tabs-and-tool-toggles-execution-plan.md`). Status row and OpenRouter log below.
- Tool toggles in Tools tab with class `openrouter-tool-toggle` and `aria-pressed` styling.
- Renderer: `initOpenRouterUI()`, Ready button handler calling `gameApi.ready()`, `enabledToolGroups`, and OpenRouter log/status updates.
- Main: `requestOrders(state, modelId, options?)`, `getGameState()`, `game:ready` handler that today calls `requestOrders` then `ready(aiOrders, aiRangedOrders)`. Tool group registry and `getToolNamesForEnabledGroups`.

### 1.5 Out of scope

- Persisting Run toggle or precomputed orders across app restarts.
- Changing tool groups, model list, or OpenRouter API.

---

## 2. Design Clarifications

### 2.1 When to start a background request

- Start a background request only when **all** of:
  - Run is toggled **on**
  - No background request is currently in flight
  - Game is in **planning** phase (main can reject or return a clear error if not)
  - API key is set and a model is selected (main already returns a clear error when missing)
- If the user has not loaded a game or the game is in resolution phase, the main process should return an error or skip; the renderer should not enable Ready and should not treat as “orders ready.”

### 2.2 Precomputed orders and game:ready

- **Main process:** Extend the `game:ready` payload to accept **optional** precomputed AI orders so that when the renderer has already obtained orders via the new “request only” IPC, it can pass them in and main **skips** calling `requestOrders` for that turn.
- **Payload (add optional fields):**
  - `precomputedAiOrders?: { unitId: string; toH3Index: string }[]`
  - `precomputedAiRangedOrders?: { unitId: string; targetH3Index: string }[]`
- **Semantics:** If both `precomputedAiOrders` and `precomputedAiRangedOrders` are provided (or a single explicit “use precomputed” flag is set and both can be empty arrays), main does **not** call `requestOrders`; it uses the provided arrays (and may still validate them against current state). If precomputed is **not** provided, main keeps **current behavior**: call `requestOrders` during ready, then `ready(aiOrders, aiRangedOrders)`. This preserves backward compatibility. In main, use the existing `RangedAttackOrder` type from `gameActions` for `precomputedAiRangedOrders` so types stay consistent.
- **Result:** The existing `ReadyResult` shape is unchanged. No new result fields required for this feature.
- **Implementer note:** In main, treat "use precomputed" as: `payload.precomputedAiOrders !== undefined && payload.precomputedAiRangedOrders !== undefined` (values may be empty arrays).

### 2.3 New IPC: request AI orders only (no resolution)

- **Name:** e.g. `game:requestAiOrders` or `openRouter:requestAiOrdersOnly`.
- **Purpose:** Ask the main process to run the same logic as `requestOrders(state, modelId, { enabledToolNames })` and return the orders (and metadata), **without** calling `ready()` or changing the database. Used by the renderer for the “background” flow.
- **Input:** Same as needed for `requestOrders`: current game state is read inside main; renderer sends only:
  - `enabledToolGroups: string[]` (same as for `game:ready`), and optionally nothing else (main uses `getGameState()`, `getSelectedModel()`, and existing tool-group → tool-names resolution).
- **Output:** A promise that resolves to an object compatible with the **success** and **error** branches of the existing `requestOrders` return type, e.g.:
  - Success: `{ success: true, orders: [...], rangedAttacks?: [...], strategy?: string, dropped?: number, dropReasons?: string[], toolInvocationCounts?: Record<string, number> }`
  - Error: `{ success: false, error: string }`
- **Main behavior:**
  - Get state via `getGameState()`. If `state.phase !== 'planning'`, return `{ success: false, error: 'Not in planning phase' }` (or equivalent). Note: when the DB is not yet initialized or no game has been started, `getGameState()` still returns an object with `phase: 'planning'`; if you need to avoid calling the LLM when there is no real game (e.g. no units), add an explicit check and return a clear error (optional; implementer's choice).
  - If no API key or no model, return same errors as `requestOrders`.
  - Resolve `enabledToolNames` from `enabledToolGroups` (same as in `game:ready`).
  - Create an `AbortController`, pass its `signal` to `requestOrders(state, modelId, { enabledToolNames, signal })`, store the controller for cancellation (see §2.6), and return the result (no DB write, no `ready()`).
- **Logging:** Use existing logging inside `requestOrders`; the new IPC handler must follow the workspace logging rule: log at **debug** when invoked and when returning (success or error). Any new main-process code in this feature must follow the same rule (debug for public method invocations, error for caught exceptions, trace for getter-style methods).

### 2.4 Stale results

- If the user toggles Run **off** before a background request completes, the renderer must **ignore** the result when it arrives (do not store orders, do not enable Ready). A simple guard: when the response handler runs, check that Run is still on before updating precomputed orders and Ready.
- If the user clicks **Ready** and resolution runs, the “current turn” has advanced. Any in-flight request that started **before** that click is for the **previous** turn; when it returns after resolution, the renderer should treat it as stale: do not overwrite the new turn’s precomputed orders. So: either (a) do not start a new background request until the previous one completes, or (b) associate in-flight requests with a “turn token” and ignore results that don’t match the current turn. The plan recommends (a) for simplicity: only one in-flight request; after Ready, we start the next request only when the previous one has already completed (which it has, because we don’t call Ready until we have orders). So no stale overwrite: after Ready we clear precomputed and start a new request for the new turn.

### 2.5 New game and initial load

- On **initial load** and on **new game**, set precomputed orders to null and call `updateReadyButtonState()`. When Run is off, Ready is enabled (game not over). When Run is on, Ready stays disabled until the first background result arrives. If Run is on after a new game, the renderer may start a background request for the new game’s first turn so that Ready can become enabled when that request completes.

### 2.6 Cancellation: stop planning when Run is toggled off

- When the user un-toggles Run while a background AI request is in flight, **stop the current planning process** (do not let it run to completion).
- **Main process:** (1) Extend `requestOrders(state, modelId, options?)` to accept optional `signal?: AbortSignal` in options; pass it to `fetch()`. When aborted, return `{ success: false, error: 'Cancelled' }`. (2) In `game:requestAiOrders`, create an `AbortController`, pass its `signal` to `requestOrders`, and store the controller. (3) Add IPC `game:cancelRequestAiOrders` that aborts the stored controller (if any). Log at debug when cancel is requested.
- **Renderer:** When Run is toggled off, call `gameApi.cancelRequestAiOrders()`, set `backgroundRequestInFlight = false`, clear `precomputedAiOrders`, then call `updateReadyButtonState()` (Ready becomes enabled). When the in-flight promise settles after cancel, do not store orders or enable Ready (guard on success and Run still on).
- **Preload:** Expose `cancelRequestAiOrders` on the same API object as `requestAiOrders`.

---

## 3. Phased Implementation Plan

---

### Phase 1: Run button (UI only); Ready unchanged for now

**Goal:** Add the Run toggle button to the right of the model dropdown with the same look as tool toggles. Leave Ready button behavior as today (enabled when game is not over, disabled when game over). No background request or payload changes yet.

**Tasks:**

1. **HTML (static/index.html)**
   - In the Model tab, inside `.openrouter-model-row`, add a **Run** button **between** the model `<select>` and the existing **Refresh** button. Use a `<button type="button">` with id `openrouter-run-btn`, class `openrouter-tool-toggle`, `aria-pressed="false"`, and text "Run". Order: `select` → Run button → Refresh button.

2. **CSS**
   - Ensure the Run button uses the same styles as tool toggles (already applied via `.openrouter-tool-toggle`). If the row layout needs spacing, add margin or gap so Run sits clearly to the right of the dropdown and left of Refresh.

3. **Renderer: Ready button (Phase 1)**
   - Wherever the Ready button’s disabled state is set (e.g. `updateGameOverUI`, and any init that runs on load or after `getGameState()`), leave Ready as today: enabled when game not over (Phase 3 will add Run-based rules). For Phase 1, do not change Ready logic.
4. **Renderer: Run button behavior (Phase 1 only)**
   - In `initOpenRouterUI()` (or equivalent), get `openrouter-run-btn`. Maintain a variable e.g. `runButtonOn = false`. On click, toggle `runButtonOn`, set `aria-pressed` to the new value, and optionally log or update a dummy state. Do not call any IPC or change Ready yet.

**Verification:**

- Load the app (with or without a game). Ready is enabled when game is not over. Start a new game; Ready remains enabled when not game over.
- In the Model tab, the Run button appears to the right of the model dropdown and left of Refresh, with the same visual style as the tool toggles. Clicking Run toggles its pressed state (on/off).

---

### Phase 2: Main process — request-only IPC and precomputed orders in game:ready

**Goal:** Main can return AI orders without resolving the turn; `game:ready` can accept precomputed AI orders and skip calling the LLM when they are provided.

**Tasks:**

1. **New IPC handler: request AI orders only**
   - Add a handler, e.g. `game:requestAiOrders`, that:
     - Reads payload `{ enabledToolGroups?: string[] }` (same as `game:ready`; default to all groups if missing).
     - Gets state with `getGameState()`. If `state.phase !== 'planning'`, return `{ success: false, error: 'Not in planning phase' }`.
     - Gets model and key; if missing, return the same errors as `requestOrders`.
     - Resolves `enabledToolNames` from `enabledToolGroups` using the existing tool group registry.
     - Create an `AbortController`, pass its `signal` to `requestOrders(state, modelId, { enabledToolNames, signal })`, store the controller for cancellation, and return the result (no call to `ready()`). When the handler is used, ensure only one in-flight request per context (e.g. abort any previous controller when starting a new request, or store a single controller and replace when starting).
   - Log at debug on entry and on return (success or error). Add an orienting comment for the handler.
   - **Cancellation:** Extend `requestOrders(state, modelId, options?)` to accept optional `options.signal?: AbortSignal`; pass it to `fetch()`. When the signal is aborted, return `{ success: false, error: 'Cancelled' }`. Add IPC handler `game:cancelRequestAiOrders` that aborts the stored controller (if any). Log at debug when cancel is requested. (Preload exposure is in task 3 below.)

2. **Extend game:ready payload and logic**
  - In the `game:ready` handler, accept optional `precomputedAiOrders` and `precomputedAiRangedOrders` in the payload (arrays as in §2.2; use type `RangedAttackOrder[]` for ranged in main).
  - If **both keys are present** in the payload (values may be empty arrays), **do not** call `requestOrders`. Use `payload.precomputedAiOrders` and `payload.precomputedAiRangedOrders` as `aiOrders` and `aiRangedOrders` for the rest of the handler (pass through to `ready()`; existing validation inside `ready()` applies). Do not set `aiSkipped`/`aiSkipReason` from missing key/model when using precomputed; set `aiOrderCount` and related result fields from the precomputed arrays.
  - If either key is omitted, keep current behavior: call `requestOrders` (if model/key present), then `ready(aiOrders, aiRangedOrders)`.
   - Ensure `ReadyResult` still includes the same fields; when using precomputed, you may omit or zero out `toolInvocationCounts` unless you persist them from a previous background call (optional; can be left for Phase 3 if the renderer doesn’t need them from the ready result when using precomputed).

3. **Preload**
   - Expose both IPC handlers on the same API object as `game:ready` so the renderer has one place to look: (1) `requestAiOrders(payload?: { enabledToolGroups?: string[] }) => Promise<RequestAiOrdersResult>`, (2) `cancelRequestAiOrders() => Promise<void>` (or no return). The renderer calls `gameApi.requestAiOrders({ enabledToolGroups: [...] })` to start a background request and `gameApi.cancelRequestAiOrders()` to stop it.

**Verification:**

- Unit test or manual test: call `game:requestAiOrders` with valid state (planning), key, and model; expect success and same shape as `requestOrders` result. Call with resolution phase or no model; expect error.
- Unit test or manual test: call `game:ready` with `precomputedAiOrders` and `precomputedAiRangedOrders`; main does not call `requestOrders` and resolution uses the provided orders. Without precomputed, behavior unchanged.
- **Cancellation:** Start `game:requestAiOrders`, then call `game:cancelRequestAiOrders` before the request completes; expect the request promise to reject or resolve with `success: false` and an error indicating cancellation (e.g. `'Cancelled'`). Ensures the cancel path is exercised and main aborts correctly.

---

### Phase 3: Renderer — background request, precomputed storage, and Ready enable/disable loop

**Goal:** When Run is on, start a single background request; when it succeeds, store orders and enable Ready. When user clicks Ready, send precomputed orders and disable Ready; after resolution, if Run is still on, start the next background request and enable Ready when it completes. When Run is off, cancel any in-flight request, clear precomputed, and enable Ready (so user can resolve without LLM).

**Tasks:**

1. **State and central Ready updater**
   - Add renderer state: `precomputedAiOrders: { orders: [...], rangedAttacks?: [...] } | null`, `backgroundRequestInFlight: boolean`, and use the existing `runButtonOn` (or equivalent) for the Run toggle.
   - Implement `updateReadyButtonState()`: set `readyBtn.disabled = true` when game over, or when (Run is on **and** `precomputedAiOrders === null`). So when Run is off, Ready is enabled whenever game is not over. Call it from: initial load, new game, Run toggle, background result handler, start of Ready click handler, and **whenever game state is updated** (e.g. after resolution or in the `getGameState()` callback) so that game-over always disables Ready from this single function. **Refactor:** Remove any existing code that sets `readyBtn.disabled` directly (e.g. in `updateGameOverUI` or init); have those paths call `updateReadyButtonState()` instead so only this function controls Ready. No other code path should set `readyBtn.disabled` directly.

2. **Run toggle (full behavior)**
   - When Run is toggled **on**: clear any previous `precomputedAiOrders`, call `updateReadyButtonState()` (Ready stays disabled). If not already `backgroundRequestInFlight` and game is in planning phase (use `gameState?.phase === 'planning'`), call the new `requestAiOrders` IPC with current `enabledToolGroups`, set `backgroundRequestInFlight = true`, and append a log line (e.g. "Requesting AI orders in background…").
   - When the promise resolves: set `backgroundRequestInFlight = false`. If `success` and Run is **still** on, set `precomputedAiOrders` from the result, then call `updateReadyButtonState()` (Ready becomes enabled) and append success to the log. If not success or Run was turned off, do not store orders and do not enable Ready; optionally log the error.
   - When Run is toggled **off**: call `gameApi.cancelRequestAiOrders()` to stop the current planning process, set `backgroundRequestInFlight = false`, set `precomputedAiOrders = null`, then call `updateReadyButtonState()` (Ready becomes enabled so user can resolve without LLM). Do not start a new request. When the in-flight promise settles (reject or resolve after cancel), guard so that if Run is off we do not store orders or enable Ready.

3. **Ready click handler**
   - At the **start** of the handler: call `updateReadyButtonState()` so Ready is disabled immediately (single source of truth; do not set `readyBtn.disabled` directly).
   - After submitting human orders, call `game:ready` with:
     - `enabledToolGroups` (unchanged), and
     - **Precomputed AI orders:** If Run is on and `precomputedAiOrders` is non-null, send `precomputedAiOrders` and `precomputedAiRangedOrders` (main skips LLM). If Run is off, send `precomputedAiOrders: []` and `precomputedAiRangedOrders: []` so main resolves without calling the LLM (user moves with impunity).
   - After receiving a successful `ReadyResult`, clear `precomputedAiOrders` (we consumed them), update game state from `getGameState()`, then call `updateReadyButtonState()` (Ready stays disabled). If **Run is still on**, start the **next** background request (same as “Run toggled on”): set `backgroundRequestInFlight = true`, call `requestAiOrders` with the new state’s enabled tool groups, and in the resolve handler store orders and call `updateReadyButtonState()` so Ready enables when the request succeeds.

4. **New game and load**
   - On initial load and on new game: set `precomputedAiOrders = null`, `backgroundRequestInFlight = false`, and call `updateReadyButtonState()`. If Run is on after new game, you may start a background request for the first turn so Ready can enable when it completes.

5. **Tool invocation counts (optional)**
   - If the background request returns `toolInvocationCounts`, you can store them and update the Tools tab labels when the **Ready** result is processed (or when the background result arrives). If you use precomputed orders for ready, the main process might not return counts for that turn; then the renderer can use the counts from the last background result for display until the next Ready. Clarify in code comments.

**Verification:**

- Run on → background request runs; when it completes, Ready enables. Click Ready → turn resolves, Ready disables; after resolution, if Run still on, another background request runs and Ready enables when it completes. Run off → Ready is enabled (user can resolve without LLM); if user toggles Run off while request in flight, cancel runs and Ready becomes enabled; in-flight result after cancel does not enable Ready (guard).
- New game → when Run off, Ready enabled when not game over; when Run on, Ready disabled until first background result, then one background request runs and Ready enables when done.

---

### Phase 4: Edge cases and polish

**Goal:** Handle no model/key, planning-phase checks, and ensure no double request or inconsistent UI.

**Tasks:**

1. **Do not start background request** when API key or model is missing. Before calling `requestAiOrders`, check (e.g. via existing `openRouter.getKey()` and `getSelectedModel()`); if either is missing, do not set `backgroundRequestInFlight`, append a log line (e.g. "Run is on but API key or model not set."), and do not enable Ready.
2. **Planning phase:** The main process already returns an error when not in planning phase. The renderer can avoid calling `requestAiOrders` when `gameState?.phase !== 'planning'` to avoid unnecessary IPC; document this in an orienting comment.
3. **Single in-flight request:** Everywhere you start a background request, guard on `!backgroundRequestInFlight` so a second request is never started until the first completes.
4. **Logging and comments:** Add brief orienting comments for `updateReadyButtonState()`, the Run toggle handler, and the Ready click flow (precomputed path and “start next request if Run on”). Ensure any new renderer-side error paths (e.g. request failed) log or show a non-intrusive message so the user understands why Ready did not enable.

**Verification:**

- Run on with no model selected: no request or error from main; Ready stays disabled. Run on, then turn resolution triggered elsewhere (if possible): main returns “not in planning” and Ready does not enable from that result. No duplicate requests when clicking Run repeatedly or when Ready completes quickly.

---

## 4. Contract Summary

| Item | Contract |
|------|----------|
| **Ready enabled** | When game not over: if Run is off, always enabled; if Run is on, only when `precomputedAiOrders !== null`. |
| **game:requestAiOrders** | Payload: `{ enabledToolGroups?: string[] }`. Returns same shape as `requestOrders` (success: orders, rangedAttacks?, strategy?, toolInvocationCounts?; error: success: false, error). |
| **game:ready (extended)** | Optional payload: `precomputedAiOrders?: { unitId, toH3Index }[]`, `precomputedAiRangedOrders?: { unitId, targetH3Index }[]`. When both keys are present (values may be empty), main skips `requestOrders` and uses these. In main use type `RangedAttackOrder[]` for ranged. |
| **Run button** | Toggle, same class and ARIA as tool toggles; to the right of model dropdown, left of Refresh. |
| **Stale result** | When background request resolves, only update precomputed orders and Ready if Run is still on. Only one in-flight request at a time. |
| **Cancellation** | When Run is toggled off while a request is in flight, renderer calls `game:cancelRequestAiOrders`; main aborts the request (AbortSignal). Ready is then enabled (Run off). |

---

## 5. Open Questions / Clarifications

- **Run off:** Ready is enabled when game not over; user resolves without LLM (no precomputed orders). Main may resolve with no AI orders when Run is off; when no precomputed orders are sent, main resolves without calling the LLM.
- **Tool counts:** When using precomputed orders, main may not have `toolInvocationCounts` for that resolution. The renderer can keep showing the last background-request counts until the next update; no change to `ReadyResult` is strictly required.

---

**End of execution plan.**
