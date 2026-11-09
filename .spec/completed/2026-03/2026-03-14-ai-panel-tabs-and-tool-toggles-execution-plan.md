# AI Panel Tabs and MCP Tool Toggles — Execution Plan

**Audience:** Coding agent implementing the feature  
**Version:** 1.3  
**Goals:** Add a tabbed AI panel (Tools | Model), move API key/model into Model tab, add a Tools tab with per-tool-group toggles and invocation counts, and wire tool enablement into OpenRouter requests and system prompt.

---

## 0. Stated Goals Checklist (from product owner)

| # | Stated need | Where the plan addresses it |
|---|-------------|-----------------------------|
| 1 | Tab group in AI panel (lower right) with two tabs: "Tools" and "Model" | §1.1 item 1; Phase 1 (tab bar, two panels). |
| 2 | Move API key and model controls into the Model tab | §1.1 item 2; Phase 1 (Model panel contains key + model). |
| 3 | Leave the status control below the new tab group | §1.1 item 3; Phase 1 (Status row stays below tab panels). |
| 4 | Model tab automatically selected and visible when the application starts | §1.1 item 2, §2.4; Phase 1 (Model panel has `active` by default; renderer sets Model selected on load). |
| 5 | In the Tools tab, add a two-column list of status controls for MCP tool usage | §1.1 item 4; Phase 2 (two-column list: label \| toggle+count). |
| 6 | For each tool: label with tool name followed by a toggle button | §1.1, §2.1; Phase 2 (Column 1 = label, Column 2 = toggle control; order: Planning, Assessment, Estimation). |
| 7 | Tool names, in order: Planning, Assessment, Estimation | §1.2 table; Phase 2 (same order and labels). |
| 8 | Toggle controls whether the tool is available to the AI (prompts + OpenRouter tools) | §1.1 item 4, §2.1, §2.3; Phase 3 (filter definitions, prompt, and tool loop by enabled set). |
| 9 | Text on the toggle = count for most recent turn; count clears on every Ready click | §2.1, §2.2; Phase 4 (reset to 0 on Ready click; then update from `toolInvocationCounts` in response). |
| 10 | Toggles all default to enabled | §1.1 item 5; Phase 2 and Phase 4 (default `enabledToolGroups` = all three). |

---

## 0b. Compliance with Stated Needs and Workspace Rules

- **Phases are independently verifiable:** Phase 1 (tab structure + Model tab) is verifiable by UI inspection; Phase 2 (Tools tab UI) builds on it; Phase 3 (backend enablement + counts) is testable via ready flow; Phase 4 (wiring + count reset) ties everything together and is verified end-to-end.
- **Reliability and clarity:** Each phase specifies exact DOM/API contracts, tool-group-to-API-name mapping, and where state lives so generated code is deterministic and understandable.
- **Future-developer clarity:** Orienting comments, consistent naming (e.g. tool group IDs), and a single source of truth for “which tools belong to which group” are required.

Alignment with **workspace Code-Generation-Rules**:

| Rule | How the plan addresses it |
|------|---------------------------|
| **1. Reliable, understandable code** | Phases order UI-first then backend; tool group mapping is defined once and reused. Double-check generated code on first implementation. |
| **2. Logging** | **All** new/updated public backend method invocations → **debug**-level log with reasonable detail. **All** caught exceptions → **error**-level. **All** new getter-style methods (no state change) → **trace**-level. Use existing logger APIs; no log-level checks unless building large strings inline. |
| **3. Testing** | Happy paths and essential failure cases only; test code contracts (e.g. filtering by enabled set, empty set), not implementation details. No tests for tab DOM, renderer event handlers, IPC delegation, or DTOs. Remove any tests that only cover boilerplate. |
| **4. Orienting comments** | Every new/updated **public, non-overriding** method must have an orienting comment: why it exists, when/how to use it, and what to expect in **results and exceptions**. Interface methods → code contracts; implementation methods → high-level implementation details. |
| **5. Spec/docs in .spec** | This plan and related spec/design docs are markdown in the `.spec` directory. |
| **6. Reusable code** | §2.5 and phase tasks require reuse (TOOL*_NAMES), a single registry, and one source for definitions + prompt; optional getToolGroupList for centralization—without risking reliability, performance, or UX. |

---

## 1. Scope and Prerequisites

### 1.1 What is being built

1. **Tab group** in the AI panel (lower-right): two tabs labeled **"Tools"** and **"Model"**.
2. **Model tab:** Contains existing API key input and model dropdown (moved from current single block). **Selected by default** when the application starts.
3. **Status control** remains below the tab group (same content as today: “Status (AI interactions and errors only)” and the log area).
4. **Tools tab:** Two-column list of MCP tool **groups** with:
   - **Label:** Tool group name (Planning, Assessment, Estimation).
   - **Toggle:** One control per row that (a) **enables/disables** the tool group for the AI (included in prompts and in OpenRouter `tools` when enabled), and (b) **displays the invocation count** for the most recent AI turn. The count **resets to 0 on every Ready button click**.
5. **Defaults:** All three tool groups start **enabled** (toggles “on”).

### 1.2 Tool group → API names (single source of truth)

| UI label (order) | Tool group ID (internal) | OpenRouter tool names |
|-----------------|--------------------------|------------------------|
| Planning        | `planning`               | `plan_route`, `check_distance` |
| Assessment      | `assessment`             | `assess_unit`, `assess_hex` |
| Estimation      | `estimation`              | `estimate_combat` |

When a group is **disabled**, none of its API names appear in the `tools` array sent to OpenRouter, and none are mentioned in the system prompt’s “AVAILABLE TOOLS” section. The tool loop must **ignore** (reject or no-op) any tool call from the model for a disabled tool and not count it toward the invocation count for that group.

### 1.3 Prerequisites (must already exist)

- Existing AI panel in `static/index.html` (`#sidebar-bottom` with OpenRouter section: heading, API key, model, status). Phase 1 removes the heading; the rest is reorganized into tabs.
- Renderer: `initOpenRouterUI()`, ready-button handler calling `gameApi.ready()`, and OpenRouter log/status updates.
- Main: `openRouter.requestOrders(state, modelId)`, `buildToolDefinitions()`, `buildSystemPromptForTools(state, coordMap)`, and the tool loop that dispatches by tool name (Tool1/Tool2/Tool3).

### 1.4 Out of scope

- Persisting tool enablement across app restarts (defaults only; persistence can be a follow-up).
- Changing the set of tools or their API names; only filtering by group.
- Fog of war or other game logic.

---

## 2. Design Clarifications

### 2.1 Toggle control semantics

- **One control per row:** Label (e.g. “Planning”) + a single interactive control that serves as both:
  - **Enable/disable:** **Clicking** the control toggles whether that tool group is available to the AI (included in prompts and in OpenRouter `tools`; when disabled, calls for those tool names are not executed and are not counted). This is the only user action on the control.
  - **Display:** The **text** of the control shows the **invocation count** for that group for the **most recent turn** (e.g. “3” or “0”). The count is **display-only** (not a separate click target). Count is **per group** (e.g. Planning = sum of invocations of `plan_route` + `check_distance` in that turn).
- **Count reset:** On every **Ready** button click (before or after the AI runs), the renderer resets all displayed counts to **0**. If the backend returns new counts for the turn that just ran, the renderer then updates the displayed counts from the response (so after Ready, the UI shows 0 until the next turn’s result comes back with new counts).

### 2.2 When to clear counts (Ready click)

- **On Ready click:** As soon as the user clicks Ready, the renderer sets all tool-group counts to 0 and updates the toggle labels. Then it calls `gameApi.ready()`. When the result returns, if the backend includes `toolInvocationCounts` for that turn, the renderer updates the displayed counts from that object. So: “clear with every click of the Ready button” means “reset to 0 at click time; then optionally show new counts from the response.”

### 2.3 Backend: enabled tools and counts

- **Input to main:** The renderer must send the **enabled tool group IDs** when calling Ready, e.g. `gameApi.ready({ enabledToolGroups: ['planning', 'assessment', 'estimation'] })`. **Backward compatibility:** If `game:ready` is invoked with no payload or without `enabledToolGroups`, the main process must **default to all three groups enabled** (same behavior as today). The plan assumes the renderer sends enabled tool groups on each Ready so main does not need to persist this.
- **Output from main:** `ReadyResult` is extended with an optional `toolInvocationCounts?: Record<string, number>` (keys = tool group IDs). Present when AI was invoked this turn; counts are for that turn only. If AI was skipped, main may omit the field or return zeros (implementer's choice); the renderer must handle both. The tool controls are not expected to show useful counts until OpenRouter is working. See §2.5 contract.
- **OpenRouter:** `requestOrders(state, modelId, options?)` gains an option such as `enabledToolNames: string[]`. Main builds `tools` and system prompt only from that set; in the tool loop, if the model requests a tool not in the set, do not execute it and do not increment that group’s count (optionally respond with a short “tool disabled” message to the LLM to avoid confusion).

### 2.4 Tab selection and URL/state

- No URL or persistence required for which tab is selected. “Model tab automatically selected and visible when the application starts” means: on first load, the **Model** tab is active (and its content visible); the Tools tab content is hidden. Tab state can live in renderer only (e.g. a variable or data attribute).

---

## 2.5 Reuse, centralization, and standardization

Apply these so the implementation stays maintainable without risking reliability, performance, UX, or the stated goals.

- **Reuse existing tool-name constants.** The codebase already has `TOOL1_NAMES`, `TOOL2_NAMES`, and `TOOL3_NAMES` in `tool1Pathfinding.ts`, `tool2Assessment.ts`, and `tool3CombatEstimation.ts`. **Do not duplicate** these lists in `openRouter.ts`. Build the tool-group registry by **importing** these constants (e.g. `planning` → `TOOL1_NAMES`, `assessment` → `TOOL2_NAMES`, `estimation` → `TOOL3_NAMES`). The only place that enumerates API tool names per group is this registry, which composes the existing arrays.

- **Single tool-group registry in main.** Define one ordered list of tool groups, each with `id`, `label`, and `toolNames` (from the TOOL*_NAMES imports). Use it for: (1) resolving enabled group IDs → enabled tool names, (2) mapping tool name → group ID for counting, (3) default "all enabled" = all IDs from this list (no magic number 3), and (4) optionally exposing the list to the renderer (see below). Counts and types use the same group IDs as keys (e.g. `planning`, `assessment`, `estimation`) so adding a group later touches only the registry.

- **Single source for tool definitions and prompt text.** Today `buildToolDefinitions()` returns an array of ToolDef and the system prompt has a hand-coded "AVAILABLE TOOLS" numbered list. To avoid drift and duplicate filtering logic: derive **both** the OpenRouter `tools` array and the prompt's numbered list from the **same** ordered list (e.g. one array of tool metadata: name, description, parameters, and a short prompt line). Filter that list once by `enabledToolNames`; build definitions and prompt section from the filtered result. Renumbering in the prompt is then automatic (1..N).

- **IPC contract in one place.** Document the `game:ready` payload and the extended `ReadyResult` (including `toolInvocationCounts`) in a single **contract** subsection below. When implementing, keep main and renderer types in sync (same shape for `ReadyResult` and for the optional payload). If the project later introduces a shared types module (e.g. `src/common/types.ts`), move these types there so both sides import the same interfaces.

- **Optional: expose tool group list to renderer.** For full centralization, add an IPC (e.g. `openRouter:getToolGroupList`) that returns the ordered `{ id, label }[]` from the main registry. The renderer calls it once at init and builds the Tools tab from the response (single source of truth for order and labels). Trade-off: one async at init. If the implementer prefers zero extra IPC, the renderer may keep a minimal ordered list of `{ id, label }` that **must** match the main registry's IDs and order (document that adding a group requires updating both).

- **Tab UI.** No shared tab component exists in the project; use a simple show/hide pattern (e.g. `.active` class) so behavior is obvious and dependency-free.

**Contract: game:ready payload and ReadyResult**

- **Payload (optional):** `{ enabledToolGroups?: string[] }`. When omitted or missing, main treats as "all groups enabled" (use all tool names).
- **Result:** Existing `ReadyResult` fields unchanged. Add optional `toolInvocationCounts?: Record<string, number>` with keys = tool group IDs (e.g. `planning`, `assessment`, `estimation`). Present when AI was invoked this turn; counts are for that turn only. If AI was skipped, omit or use zeros.

---

## 3. Phased Implementation Plan

---

### Phase 1: Tab structure and Model tab (HTML + CSS + default selection)

**Goal:** Add a tab group above the current OpenRouter block; move API key and model controls into a “Model” tab; keep the status/log below the tabs. Model tab is selected by default. No behavior change yet for Tools tab (placeholder only).

**Tasks:**

1. **HTML (static/index.html)**
   - Inside `#sidebar-bottom`, replace the current single block with:
     - Remove the existing "OpenRouter (AI)" heading; the tab bar is the top-level element in this section.
     - A **tab bar**: two buttons or links, “Tools” and “Model”, with a clear selected state (e.g. `aria-selected` and a class).
     - A **tab panel container** with two panels:
       - **Tools panel:** Initially empty or placeholder text (e.g. “Tool toggles will appear here.”). Use an `id` (e.g. `openrouter-tools-panel`) and a class to show/hide.
       - **Model panel:** Contains the existing API key row and model row (move the existing `openrouter-key`, `openrouter-model`, `openrouter-refresh-models`, and their labels into this panel). Use an `id` (e.g. `openrouter-model-panel`).
     - **Status row** stays below the tab panels: same label “Status (AI interactions and errors only)” and `#openrouter-log` div.
   - Ensure existing IDs for key, model, refresh, and log are unchanged so current renderer code keeps working.

2. **CSS**
   - Style the tab bar (e.g. border-bottom, selected tab highlighted).
   - Show only one tab panel at a time (e.g. `.openrouter-tab-panel { display: none; }` and `.openrouter-tab-panel.active { display: block; }` or similar). Model panel has `active` by default.

3. **Renderer (initOpenRouterUI or equivalent)**
   - On load, set “Model” as the selected tab (Model panel visible, Tools panel hidden).
   - Add click handlers to the tab buttons to switch which panel has `active` and which tab has the selected state. No other logic yet.

**Verification:**

- Open the app; the lower-right panel shows two tabs, “Tools” and “Model”; Model is selected and the API key and model controls are visible in the Model tab; status/log is below. Clicking “Tools” shows the placeholder; clicking “Model” shows key and model again.

**Exit condition:** Tab group exists; Model tab is default; API key and model are in the Model tab; status remains below; no regressions in key/model or log behavior.

---

### Phase 2: Tools tab — two-column list and toggles (UI only)

**Goal:** Replace the Tools tab placeholder with a two-column list: label (Planning, Assessment, Estimation) and a toggle that shows a count and toggles enable/disable. All toggles default to enabled. No backend or Ready integration yet; counts can stay 0 and enable state is local only.

**Reuse (§2.5):** Prefer building the list from `openRouter:getToolGroupList` (one IPC at init) so order and labels come from main's registry; otherwise define a minimal ordered `{ id, label }[]` in the renderer that **must** match main's group IDs and order.

**Tasks:**

1. **HTML**
   - In the Tools panel, add a structure such as:
     - A container (e.g. `#openrouter-tools-list`).
     - For each tool group (from the list source above), one row with:
       - Column 1: label text (e.g. “Planning”).
       - Column 2: a single control that acts as both toggle and count display. Use a `<button type="button">` with a data attribute for the tool group id (e.g. `data-tool-group="planning"`). The button text is the count (e.g. “0”). Use a class or attribute to indicate enabled state (e.g. `aria-pressed="true"` or a class `enabled`/`disabled`).
   - Use a small grid or flex layout so the list is clearly two columns (label | toggle/count).

2. **CSS**
   - Style rows and the toggle button (e.g. enabled = one style, disabled = muted; count visible and readable).

3. **Renderer**
   - Obtain the ordered list of tool groups: either call `openRouter:getToolGroupList` at init and use the returned `{ id, label }[]`, or define a constant ordered list that matches main's registry (see §2.5). **If using getToolGroupList:** use a simple approach that prevents the user from clicking controls prematurely and breaking the software (e.g. disable the toggles or show a brief loading state until the list is available, then enable interaction).
   - Maintain state: `enabledToolGroups: Set<string>` (default = all group IDs from the list) and `toolInvocationCounts: Record<string, number>` (default 0 for each group).
   - Render or update the toggle buttons: text = count for that group; state = enabled/disabled from `enabledToolGroups`.
   - On toggle button click: flip the enabled state for that group and update the button appearance. Do not call main or Ready yet.
   - Ensure toggles default to enabled (all group IDs in `enabledToolGroups` on init).

**Verification:**

- Tools tab shows three rows: Planning, Assessment, Estimation; each has a button showing “0” and appearing “on”. Clicking a toggle disables it (visual state and local state); clicking again re-enables. No IPC or Ready behavior yet.

**Exit condition:** Tools tab contains the two-column list with correct labels and working toggles (local state only); all default to enabled.

---

### Phase 3: Backend — enabled tools and invocation counts

**Goal:** Main process accepts enabled tool groups (or enabled API tool names), filters `buildToolDefinitions()` and the system prompt’s “AVAILABLE TOOLS” section to only enabled tools, and returns per-group invocation counts for the turn. No renderer wiring yet.

**Reuse (§2.5):** (1) Build the tool-group registry by **importing** `TOOL1_NAMES`, `TOOL2_NAMES`, `TOOL3_NAMES` from the existing tool modules; do not duplicate tool name arrays. (2) Derive both the OpenRouter `tools` array and the prompt's "AVAILABLE TOOLS" numbered list from the **same** ordered source (filter once, build both); use the registry order. (3) Default "all enabled" = all group IDs from the registry (no magic number 3).

**Tasks:**

1. **Tool-group registry (single source of truth)**
   - In `openRouter.ts`, define one **ordered** list of tool groups by **reusing** existing constants: import `TOOL1_NAMES` from `tool1Pathfinding`, `TOOL2_NAMES` from `tool2Assessment`, `TOOL3_NAMES` from `tool3CombatEstimation`. Each registry entry: `{ id, label, toolNames }` with `id` = `'planning'` | `'assessment'` | `'estimation'`, `label` = display name, `toolNames` = the imported array. Do **not** re-list tool names inline.
   - Export (or use internally): get all tool names for a set of enabled group IDs; map a tool name back to its group ID (for counting). Optionally expose `getToolGroupList()` for IPC (returns ordered `{ id, label }[]`) so the renderer can avoid duplicating order/labels.

2. **buildToolDefinitions and prompt from one filtered list (§2.5)**
   - Introduce a single ordered source for tool metadata (name, description, parameters, short prompt line). Filter once by `enabledToolNames`. From the filtered list: (a) build the OpenRouter `ToolDef[]`, (b) build the "AVAILABLE TOOLS" numbered paragraph for the system prompt with renumbering 1..N. When `enabledToolNames` is omitted, use the full list. If none enabled: prompt section = "No tools available.", definitions = [].

3. **buildSystemPromptForTools(..., enabledToolNames)** (if not merged into step 2)
   - Add a parameter for enabled tool names. The “AVAILABLE TOOLS” section (the numbered list 1.–5.) must include only enabled tools and be renumbered 1..N. Omit any tool not in `enabledToolNames`. If all are disabled, the section can be empty or state “No tools available.”

4. **requestOrders(state, modelId, options?)**
   - Add an optional `options?: { enabledToolNames?: string[] }`. **When `enabledToolNames` is omitted or undefined** (e.g. Ready called with no payload), use **all** tool names (current behavior). When provided, pass it to `buildToolDefinitions` and `buildSystemPromptForTools`. In the tool loop:
     - When the model returns `tool_calls`, for each call: if the tool name is **not** in the enabled set, do **not** execute it; append a short tool result message to the conversation (e.g. “Tool X is disabled.”) so the model does not hang. Do **not** increment any invocation count for that call.
     - When the tool name **is** in the enabled set, execute as today and increment the corresponding group’s count.
   - Maintain a **per-request** counts object keyed by group ID (e.g. `Record<string, number>` with keys from the registry). Initialize from the registry so every group has an entry (e.g. 0). For each executed tool call, increment the appropriate group. Return this in the result (extend `RequestOrdersResult` with `toolInvocationCounts?: Record<string, number>` per §2.5 contract).

5. **game:ready handler (main.ts)**
   - Extend the IPC contract per §2.5: accept an optional payload `{ enabledToolGroups?: string[] }`. When omitted, use all group IDs from the registry (default all enabled). Convert enabled group IDs to enabled tool names using the registry. Call `requestOrders(state, modelId, { enabledToolNames })`. Put `toolInvocationCounts` from the result into the returned `ReadyResult`. Keep main’s `ReadyResult` type in sync with the contract (and with renderer if no shared types module yet).

6. **Logging**
   - Log at debug when `requestOrders` is called with `enabledToolNames` (e.g. list of names or “all”). Log at debug when a tool call is skipped because it is disabled.

**Verification:**

- Unit test or manual test: with only `planning` enabled, `buildToolDefinitions(['plan_route','check_distance'])` returns two definitions; `buildSystemPromptForTools` with that set omits assess/estimate lines and renumbers. With all enabled, behavior matches current. **Essential failure case:** e.g. empty `enabledToolNames` → prompt section “No tools available” and empty tools array; request still completes. No renderer changes yet.

**Exit condition:** Backend filters tools and prompt by enabled set; returns per-group counts; ready handler accepts enabled groups (default all when omitted) and passes them through and returns counts.

---

### Phase 4: Renderer–main wiring and count reset on Ready

**Goal:** Renderer sends enabled tool groups when the user clicks Ready; on Ready click, reset counts to 0 then update from `ReadyResult.toolInvocationCounts`; main uses the received enabled groups for the request.

**Tasks:**

1. **IPC and types**
   - Ensure `game:ready` can receive an optional payload. Extend preload to `ready(payload?: { enabledToolGroups?: string[] })` and main handler to accept the payload; when payload or `enabledToolGroups` is missing, main defaults to all group IDs from the registry (all enabled). Update the renderer's `ReadyResult` type to include `toolInvocationCounts?: Record<string, number>` and the `gameApi.ready` signature to accept the optional payload, so both sides stay in sync with §2.5.

2. **Renderer: Ready button**
   - When the user clicks Ready:
     - Set local `toolInvocationCounts` to zeros for all group IDs (same keys as §2.5 contract) and update the toggle button labels to “0”.
     - Build `enabledToolGroups` from current `enabledToolGroups` state (array of ids that are enabled).
     - Call `gameApi.ready({ enabledToolGroups })` (or equivalent).
     - On success, if the response has `toolInvocationCounts`, set local counts from it and update the toggle button labels again.
   - Ensure submit-orders logic and error handling are unchanged; only the Ready call and count handling are added.

3. **Renderer: initial load**
   - When the app loads with no previous state, default `enabledToolGroups` to all group IDs (from the tool group list) and counts to 0; toggle buttons show “0” and enabled.

**Verification:**

- With all tools enabled, click Ready; after resolution, toggle labels show the counts for that turn (if AI ran). With one group disabled (e.g. Estimation), click Ready; that group’s tools are not sent to the model and its count stays 0; other groups show their counts. Click Ready again; counts reset to 0 immediately, then update when the response returns.

**Exit condition:** Ready sends enabled tool groups; main uses them; counts reset on Ready click and then reflect the last turn’s invocations; UI and backend are consistent.

---

## 4. File and Contract Summary

| Area | File(s) | Changes |
|------|---------|--------|
| HTML | `static/index.html` | Tab bar; Tools panel (list + toggles); Model panel (key + model); status below. |
| CSS | `static/index.html` (or separate) | Tab and panel visibility; two-column list; toggle style. |
| Renderer | `src/renderer/renderer.ts` | Tab switching; Tools list state and toggle handlers; Ready payload and count reset/update; init defaults. |
| Main | `src/main/main.ts` | `game:ready` accepts `enabledToolGroups`; pass to `requestOrders`; return `toolInvocationCounts`. |
| OpenRouter | `src/main/openRouter.ts` | Tool-group registry reusing TOOL1/2/3_NAMES (§2.5); single source for definitions + prompt; `buildToolDefinitions(enabledToolNames)`; `buildSystemPromptForTools(..., enabledToolNames)`; `requestOrders(..., options)` with filtering and per-group counts; optional `getToolGroupList()` for renderer. |
| Preload | `src/main/preload.ts` | Expose `ready(payload?)` with optional `enabledToolGroups`; optionally expose `openRouter.getToolGroupList()` for §2.5 centralization. |

---

## 5. Open Questions for the Implementer / Product Owner

- **Persistence of enabled tools:** This plan leaves enabled state in renderer memory only (default all on). If product later wants “remember last choice,” a small follow-up can add persistence (e.g. localStorage or main-process store and IPC get/set).
- **Toggle affordance:** The plan uses one control per row: **click** = toggle enable/disable, **text** = count (display-only). If that feels ambiguous in the UI, consider splitting into a checkbox (enable/disable) plus a read-only count label; confirm with product owner if desired.
- **Empty enabled set:** If the user disables all three groups, `enabledToolNames` is empty. Backend should still call OpenRouter (no tools, no tool loop iterations); system prompt should say no tools available; return success with empty orders and zero counts.
- **Tool counts when OpenRouter not in use (resolved):** Product owner does not expect the tool controls to show anything useful until OpenRouter is working; implementer's choice for omit vs. zeros when AI is skipped. (Heading: removed per product owner.)

---

## 6. Verification Checklist (end-to-end)

- [ ] On startup, AI panel shows tabs “Tools” and “Model”; Model is selected; API key and model are in Model tab; status/log below; no "OpenRouter (AI)" heading (removed per product owner).
- [ ] Tools tab shows Planning, Assessment, Estimation with toggles; all default to enabled; counts show 0.
- [ ] Disabling a group and clicking Ready: that group’s tools are not in the request; its count stays 0; other groups’ counts update.
- [ ] Clicking Ready resets displayed counts to 0, then updates from response when AI runs.
- [ ] No regression: key save, model list, model selection, status log, and Ready flow (submit orders, resolve turn, update map) still work as before.
