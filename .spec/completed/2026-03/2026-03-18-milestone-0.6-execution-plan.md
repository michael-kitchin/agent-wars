# Milestone 0.6 — Pre-Computation and Briefing Format: Execution Plan

*Version 1.0 — March 2026*

This document is an execution plan for implementing **Milestone 0.6 — Pre-Computation and Briefing Format** from the [Strategic Development Plan v3](devleopment-plan-v3.md) and [POC Analysis](poc-analysis.md). It is written for a coding agent. Phases are organized for **maximum reliability and clarity**, with each phase **independently verifiable or verifiable with previously completed phases**. Generated code must be **reliable and understandable** for future developers.

---

## Scope Summary

**In scope**

- **Pre-computation pipeline:** Before invoking the LLM, run assessment and combat-estimation tools for all AI units and assess_hex for every hex with at least one human unit. No tools are removed; they are **also** run by the engine and the results injected into the prompt.
- **Structured briefing format:** Three sections (see [Briefing structure](#briefing-structure-three-sections) below): (1) Strategic narrative (3–5 sentences, chief-of-staff style); (2) Unit status and threats table plus combat estimates table (Markdown); (3) Attention flags (2–3 bulleted imperatives). Memory and standing-order injection remain; they are composed into the briefing block after these sections.
- **Architecture toggle:** A/B testing between **0.5 (iterative)** and **0.6 (pre-computation)**. Same model and starting position can be played with either mode; metrics support comparison.
- **Metrics:** Tool invocation counts (ad-hoc only when pre-computation is on), cost, wall-clock time per AI turn, and token counts when available from the API. No new UI beyond the toggle; metrics can be logged or returned in the existing result shape.

**Out of scope for this plan**

- Callback event system and event-driven consultation (Milestone 0.7).
- Territory control or other persistence of game state between games or restarts (nothing persists; DB recreated from scratch).
- Changes to tool schemas or to the order/response JSON format.
- Fog of war or subjective views (Phase 1).

**Technical constraints**

- Reuse existing tool implementations: `executeTool2` (assess_unit, assess_hex), `executeTool3` (estimate_combat). Pre-computation **calls** these with the same (state, coordMap) used by the LLM flow; it does not duplicate their logic.
- The existing `buildSystemPromptForTools` and `requestOrders` in `openRouter.ts` are the integration points. Pre-computation runs **before** building the system prompt when the toggle is on; the prompt is then built from the briefing instead of (or in addition to) the current unit-roster + standing-order blocks.
- `getStandingOrderInjectionText` and `getInjectionText` (memory) remain the single source for that content; the briefing **includes** their output in a dedicated section so the LLM still sees the same information, in briefing order.

---

## References

- **Development plan:** [.spec/devleopment-plan-v3.md](devleopment-plan-v3.md) — Hybrid AI Architecture, Milestone 0.6 description, briefing example, metrics.
- **POC analysis:** [.spec/poc-analysis.md](poc-analysis.md) — Pre-computation value, state abstraction, Markdown tables, spatial decay.
- **MCP tools spec:** [.spec/completed/mcp-tools-spec.md](completed/mcp-tools-spec.md) — Tool 2 (assess_unit, assess_hex), Tool 3 (estimate_combat), Tool 4 (memory injection), Tool 5 (standing orders, injection). Tool interfaces and response shapes.
- **Current integration:** `src/main/openRouter.ts` — `requestOrders`, `buildSystemPromptForTools`, tool loop, `MAX_TOOL_ITERATIONS`. `src/main/gameIpcHandlers.ts` — `handleGameReady`, `handleRequestAiOrders` (pass `enabledToolNames`; no pre-computation yet). Tools: `executeTool2`, `executeTool3`, `getInjectionText`, `getStandingOrderInjectionText`.

---

## Briefing structure (three sections)

The commander's briefing is the main content of the prompt when pre-computation is on. It has three sections in order. This structure primes strategic reasoning first, then provides scannable data, then states imperatives explicitly.

**Section 1: Strategic narrative (natural language, 3–5 sentences).**  
The "commander's brief" — the big picture the LLM reads first and anchors its reasoning on. Content: momentum, active campaigns, overall posture. Written the way a chief of staff would brief a general. No numbers yet; this primes the model's strategic reasoning before it sees any tables.

**Section 2: Unit status and threats (Markdown tables).**  
- **Table 1 — Unit status:** One row per AI unit. Columns: unit ID, position, standing order + status, nearest enemy + distance, threat severity, and a terse **"action needed"** flag (e.g. yes/no or a short label). This is the scanning surface: the LLM identifies which units need attention by reading down the threat and action columns.  
- **Table 2 — Combat estimates:** Pre-computed likely engagements. Columns: **matchup** (e.g. "armor-1 vs human-inf-2 at [lat,lng]"), **assessment** (category: FAVORABLE / EVEN / UNFAVORABLE etc.), **P(eliminate defender)**, **P(lose own unit)**, **short note** (e.g. return fire, one-line reasoning). A proper table (not inline bullets) so that with 4–6 engagements on a medium map the LLM can compare options side by side.

**Section 3: Attention flags (natural language, bulleted).**  
The 2–3 things that demand immediate decision-making, pulled from the tables but stated explicitly as imperatives. Examples: "Infantry-2 has no standing order and faces a critical threat at distance 2." "Armor-1 arrives at objective next turn — decide follow-on orders." Redundant with the table data on purpose — it tells the model what to think about first.

After these three sections, the briefing includes **YOUR STRATEGIC MEMORY** (existing injection) and the standing-order summary (existing injection or embedded). Callbacks are out of scope for 0.6 (placeholder in 0.7).

**Example — Combat estimates table (Section 2):**

```markdown
| Matchup | Assessment | P(eliminate) | P(lose unit) | Note |
|---------|------------|--------------|--------------|------|
| armor-1 vs human-inf-2 @ [2.1,0.5] | FAVORABLE | 0.50 | 0.33 | Return fire unlikely |
| inf-2 vs human-inf-1 @ [8.2,4.3] | EVEN | 0.17 | 0.33 | Melee if they advance |
```

---

## Compliance with Project Rules

1. **Reliability and clarity:** All new code must be correct and easy to follow. Double-check the first time a path is implemented.
2. **Logging:** Use existing `logDebug`, `logError`, `logTrace`. Debug for public method invocations, error for caught exceptions, trace for getters. No pre-check of log level unless building large strings inline.
3. **Testing:** Happy paths and essential failure cases only. Focus on contracts, not implementation details. No tests for thin delegation, DTOs, or REST controllers.
4. **Orienting comments:** All new public non-overriding methods need orienting comments (purpose, when to use, how to use, results/exceptions).
5. **Specs:** Design/spec docs stay in `.spec` as markdown.
6. **Conventions:** Follow existing codebase conventions (e.g. file headers, naming, TypeScript patterns) unless contradicted by the rules above. Reuse existing code; do not duplicate tool logic (pre-computation calls the same tool executors as the LLM flow).

---

## Questions for Reliable Execution

- **Toggle storage (resolved):** Nothing in the game persists between games or restarts. The 0.5 vs 0.6 toggle is in-session only (e.g. UI state / IPC payload). The database can and should be recreated from scratch between runs (preferred: drop/recreate schema; alternatively recreate data only).
- **Max iterations (resolved):** Keep max iterations at 50 (same as current 0.5) when pre-computation is on. The goal for 0.6 is to measure ad-hoc tool calls and latency, not to limit them; do not reduce the cap.
- **assess_hex in pre-computation (resolved):** Pre-compute assess_hex for every hex that contains at least one human unit (one call per such hex; no cap). With current unit counts this is acceptable.
- **Module placement (resolved):** Put the briefing formatter in a separate module from pre-computation (e.g. `briefingFormatter.ts`) unless that would introduce significant risk. Separate modules preferred given the complexity of each.

---

## Success criteria (playtest)

When the plan is implemented, the following criteria define "done" for 0.6 and support the dev plan playtest hypothesis:

- **A/B toggle:** Same game (same starting position, same model) can be run with 0.5 (iterative) or 0.6 (pre-computation). Toggle is exposed via payload (in-session only; no persistence); no code change required to switch.
- **Metrics:** Each AI turn result (or logs) provides: ad-hoc tool invocation counts (target 0–2 with pre-computation vs. 5–10 without), cost, wall-clock time, and token counts when the API supplies them.
- **Playtest hypothesis (from dev plan):** With pre-computation, AI play quality is comparable or better; ad-hoc tool calls drop to 0–2 per turn; per-turn latency drops by at least 50%; per-turn token cost drops by at least 40%. Subjective check: the AI still makes coherent, intentional-feeling moves when using the briefing.
- **Regression:** With toggle off, behavior and prompt match current 0.5; no regression in order parsing or resolution.

---

## Prerequisites

- **Milestone 0.5** is complete: all five tools (pathfinding, assessment, combat estimation, memory, standing orders) are implemented and wired in `openRouter.ts`; iterative tool loop works; standing order and memory injection are in the system prompt; `requestOrders` returns `toolInvocationCounts` and `cost`.
- **Codebase:** `openRouter.ts` builds prompt via `buildSystemPromptForTools`, calls `executeTool1`–`executeTool5` in the tool loop, uses `getInjectionText` and `getStandingOrderInjectionText`. `gameIpcHandlers` passes `enabledToolNames` (and optionally payload) to `requestOrders`; no pre-computation yet.
- **Verification:** Run a turn with tools enabled; confirm prompt contains unit roster, memory, standing orders, and tool definitions; confirm tool calls and final orders are applied.

**Refactor scope:** This milestone refactors the 0.5 prompt path. When the pre-computation toggle is **off**, the existing 0.5 flow must remain unchanged: same prompt shape, same tool loop, same order handling. All new code is either behind the toggle or additive (e.g. new module). Preserve existing tests for the 0.5 path; add verification for the 0.6 path.

---

## Phase 1: Pre-Computation — Unit Assessments

**Goal:** Implement a function that, given game state and coordinate map, runs `assess_unit` for every AI unit and returns a list of results. No prompt or request flow changes yet. This phase is independently testable.

**Tasks**

1. **Pre-computation API shape:**  
   Define a type for “one assess_unit result” (e.g. `{ unitId: string; result: Tool2AssessUnitResponse }`) and a type for “all unit assessment results” (array or map by unitId). Use the same response shape as `executeTool2('assess_unit', …)` so we don’t duplicate logic.

2. **Run assess_unit for each AI unit:**  
   In a new module (e.g. `src/main/precomputation.ts` ), implement a function such as `runUnitAssessments(state, coordMap): Promise<UnitAssessmentResult[]>` (or synchronous if tools are sync). For each unit with `player === 'opponent'`, call `executeTool2('assess_unit', { unitId: unit.id, radius: 4 }, state, latLngByH3, resolveToH3)`. Collect only successful results (`status === 'ok'`); log and skip errors. Return in a stable order (e.g. by unit id).

3. **Coordinate map:**  
   Pre-computation must use the same `buildLatLngCoordinateMap(hexList)` and `resolveToH3` as `requestOrders`. Accept `coordMap` (or state + hex list) so the caller can pass the same object used for the prompt.

4. **Logging:**  
   Log at debug: start/end of pre-computation, number of AI units, number of successful assessments. Log at error any assess_unit error payload (e.g. unit not found).

**Verification**

- Unit test: with a fixture `GameStateSnapshot` (e.g. 2–3 opponent units, 1–2 human units), call the new function. Assert length of results equals number of opponent units, each result has expected fields (e.g. `unit`, `nearbyEnemies`, `threats`), and no duplicate unitIds.
- Optional: one opponent unit invalid (e.g. wrong h3Index). Assert one result is missing or error is logged; no throw.

**Exit condition:** A single function runs assess_unit for all AI units and returns a list of results. No changes to `buildSystemPromptForTools` or `requestOrders` yet.

---

## Phase 2: Pre-Computation — Combat Estimates and assess_hex

**Goal:** Add "likely engagements" and assess_hex for every hex with a human unit to pre-computation. Reuse `executeTool3` and `executeTool2('assess_hex', …)`.

**Tasks**

1. **Likely engagements:**  
   Define “likely engagement” as an (AI unit, human unit) pair where the AI unit can attack the human **this turn** (ranged or melee). Concretely: for each opponent unit and each human unit, compute hex distance (or use assessment data). If the AI unit’s range ≥ distance, it’s a ranged engagement; if distance ≤ 1 and the AI can move into the hex (or is already adjacent), treat as potential melee. For each such pair, call `executeTool3('estimate_combat', { engagementType, attackers: { units: [aiUnitId] }, targetHex: enemyPosition, defenders: { units: [enemyId] } }, state, latLngByH3, resolveToH3)`. Choose `engagementType` from whether the AI is already in range (ranged) or would be adjacent after move (melee). Cap the number of estimate_combat calls (e.g. 15) to avoid token explosion: e.g. prioritize by distance (closest first) or by threat severity from Phase 1.

2. **Combat estimate result type:**  
   Define a small type for “one pre-computed combat estimate” (e.g. aiUnitId, enemyUnitId, targetHex, assessment, probability summary). Collect only `status === 'ok'` results.

3. **assess_hex for enemy-occupied hexes:**
   Run `assess_hex` for every hex that contains at least one human unit (one call per such hex; no cap). Collect results in a structure keyed by hex position (or list). With current unit counts this is acceptable.

4. **Pre-computation orchestrator:**  
   Add a function e.g. `runPrecomputation(state, coordMap, options?: { skipHexAssessments?: boolean; maxCombatEstimates?: number })` that:
   - Runs Phase 1 (unit assessments).
   - Runs combat estimates (likely engagements) with the chosen cap.
   - Runs assess_hex for every hex that contains at least one human unit unless `skipHexAssessments` is true (default: false/undefined; assessments always included for this milestone; option allows disabling later).
   - Returns a single object: `{ unitAssessments, combatEstimates, hexAssessments? }` with typed arrays. Log total time at debug.

**Verification**

- Unit test: fixture with 2 AI and 2 human units such that 1–2 pairs are in range. Call orchestrator. Assert `combatEstimates.length` ≤ cap and each entry has expected fields (e.g. assessment, targetHex). Assert `unitAssessments` still matches Phase 1.
- Assert hexAssessments has one entry per hex that contains at least one human unit.

**Exit condition:** One function returns unit assessments, combat estimates (capped), and hex assessments for all hexes with a human unit. Still no prompt changes.

---

## Phase 3: Briefing Formatter

**Goal:** Turn pre-computed data plus existing memory and standing-order text into the "Commander's Briefing" block using the [three-section structure](#briefing-structure-three-sections): (1) Strategic narrative, (2) Two Markdown tables (unit status + combat estimates), (3) Attention flags, then memory and standing orders. Implement the formatter in a **separate module** from pre-computation (e.g. `briefingFormatter.ts`) unless that would introduce significant risk.

**Tasks**

1. **Section 1 — Strategic narrative (3–5 sentences):**  
   The commander's brief: big picture the LLM reads first. Write it the way a chief of staff would brief a general. Content: momentum, active campaigns, overall posture. No numbers or tables yet; this primes strategic reasoning before the model sees any data. Derive from state and unit assessments: turn number, AI vs human unit counts, high-level posture (e.g. units in contact, units with no order), critical threats. Keep to 3–5 sentences.

2. **Section 2 — Unit status table (Table 1):**  
   One row per AI unit. Columns: **unit ID**, **position** ([lat, lng]), **standing order + status** (e.g. MARCH to [x,y] — en_route, 2t; or "—" if none), **nearest enemy + distance**, **threat severity**, **action needed** (terse flag: yes/no or short label). **Derive "action needed"** as: yes (or a short label) when the unit has no standing order and has at least one threat, or when the unit's standing order is in a warning state (blocked, target_lost, arrived, contact); otherwise no or blank. Data from unit assessments and standing order source (same as `getStandingOrderInjectionText`). This table is the scanning surface: the LLM identifies which units need attention from the threat and action columns. **Spatial decay:** Use full row for units near enemies or with no order; for units in quiet areas with low threat, use a one-line summary to reduce tokens. If implementation complexity or risk is significant, fall back to full rows for all units.

3. **Section 2 — Combat estimates table (Table 2):**  
   Pre-computed likely engagements as a **Markdown table**, not inline bullets. Columns: **Matchup** (e.g. armor-1 vs human-inf-2 @ [2.1,0.5]), **Assessment** (FAVORABLE / EVEN / UNFAVORABLE etc.), **P(eliminate)**, **P(lose unit)**, **Note** (one-line reasoning or return-fire note). One row per combat estimate. Enables side-by-side comparison when there are 4–6 engagements on a medium map. Use Tool 3 response fields: assessment, probabilityDefenderEliminated, probabilityAttackerLosesUnit, and a short note from reasoning or return-fire detail.

4. **Section 3 — Attention flags (2–3 bulleted imperatives):**  
   Natural language, bulleted. The 2–3 things that demand immediate decision-making, pulled from the tables but stated explicitly as imperatives. Examples: "Infantry-2 has no standing order and faces a critical threat at distance 2." "Armor-1 arrives at objective next turn — decide follow-on orders." Redundant with table data on purpose — tells the model what to think about first. Source: (a) units with no standing order and at least one threat (critical/moderate), (b) units whose standing order is in a warning state (blocked, target_lost, arrived, contact). If none, omit the section or write "None."

5. **Compose full briefing:**  
   Function e.g. `formatBriefing(state, precomputed, standingOrderText, memoryText): string` that outputs in order:
   - Title: `=== COMMANDER'S BRIEFING (Turn N) ===`
   - Section 1: Strategic narrative
   - Section 2: Unit status table, then combat estimates table
   - Section 3: Attention flags (bulleted)
   - YOUR STRATEGIC MEMORY: `memoryText`
   - Standing order block: embed `standingOrderText` or append it. Ensure the LLM still sees the same memory and standing-order content as today.

6. **Callbacks placeholder:**  
   For 0.6, omit or add one line: "Callbacks not yet active (Milestone 0.7)." No logic.

**Verification**

- Unit test: fixed `state`, fixed `precomputed` (e.g. 2 unit assessments, 2 combat estimates), fixed `standingOrderText` and `memoryText`. Call `formatBriefing`. Assert output includes: title; Section 1 (narrative, 3–5 sentences); Section 2 with **two** tables — unit table (2 rows, columns including action needed) and combat table (2 rows, columns Matchup, Assessment, P(eliminate), P(lose unit), Note); Section 3 (attention flags as bullets); YOUR STRATEGIC MEMORY and provided memory text. Assert valid Markdown (pipes align, no raw undefined).
- If attention flags are present in the fixture, assert Section 3 lists the expected imperatives.

**Exit condition:** `formatBriefing` produces the full briefing string with three sections and two tables. Still no change to the request path.

---

## Phase 4: Integrate Pre-Computation and Briefing into requestOrders

**Goal:** When a “pre-computation mode” flag is on, run the pipeline, build the briefing, and use it as the main content of the system prompt; keep tools available for ad-hoc use. When the flag is off, behavior matches current 0.5.

**Tasks**

1. **Options and flag:**  
   Extend `RequestOrdersOptions` (or equivalent) with e.g. `usePrecomputation?: boolean` (default `false`). When `true`, requestOrders will run pre-computation and use the briefing in the prompt.

2. **Run pipeline before prompt:**  
   When `usePrecomputation === true`, after building `coordMap` and before `buildSystemPromptForTools`:
   - Call the pre-computation orchestrator (Phase 2) with current state and coordMap.
   - Call `formatBriefing(state, precomputed, getStandingOrderInjectionText(…), getInjectionText(…))`.
   - Pass the resulting string into prompt construction (see below). Log at debug that pre-computation ran and briefing length (e.g. character count).

3. **Prompt construction with briefing:**  
   When pre-computation is on, the system prompt should:
   - Start with the briefing block (Section 1 strategic narrative, Section 2 unit table and combat estimates table, Section 3 attention flags, memory, standing orders).
   - Then include: coordinate preamble, combat rules and unit stats, “AVAILABLE TOOLS” section (unchanged), and instruction to submit final orders JSON. Do **not** duplicate the long unit roster in prose form; the briefing table is the unit overview. Optionally keep a single short line “Your units: …” and “Human units: …” if useful for reference, or rely entirely on the table. Ensure the model still sees tool definitions and the same “submit your final orders as JSON” instruction.

4. **Refactor buildSystemPromptForTools:**  
   Add an optional parameter e.g. `briefingOverride?: string`. When present, use it as the main block (replacing the current memory + standing order + unit roster placement) and keep the rest (tools, combat rules, submit instruction). When absent, keep current 0.5 behavior. Alternatively, introduce a separate function `buildSystemPromptWithBriefing(state, coordMap, briefing, enabledToolNames)` used only when pre-computation is on, and keep `buildSystemPromptForTools` unchanged for the off path. Choose one approach and document it.

5. **Max iterations unchanged:**  
   Keep the existing max tool iterations (50) when pre-computation is on. Do not reduce the cap; the goal for 0.6 is to measure ad-hoc tool calls and latency, not to limit them.

6. **Ad-hoc tools unchanged:**  
   All tools remain available; the LLM can still call assess_unit, assess_hex, estimate_combat, etc. Pre-computation only **adds** content to the prompt; it does not disable tools.

**Verification**

- Integration-style test or manual run: call `requestOrders` with `usePrecomputation: true` and a state that has opponent units. Assert the system prompt (e.g. logged at debug) contains “COMMANDER'S BRIEFING”, the unit table, and combat estimates. Assert the tool loop still runs and that a final order JSON can be parsed and applied.
- Same flow with `usePrecomputation: false`: assert prompt looks like current 0.5 (no briefing block, same roster and blocks as before). No regression in order parsing or application.

**Exit condition:** Toggling `usePrecomputation` switches between 0.5-style prompt and 0.6-style briefing prompt; both paths produce valid orders and use the same validation/merge logic.

---

## Phase 5: Toggle Exposure and Metrics for A/B Testing

**Goal:** Expose the architecture toggle to the caller (UI or test) and ensure all metrics needed for the playtest hypothesis are available (ad-hoc tool calls, cost, wall-clock time, tokens if available).

**Tasks**

1. **Expose toggle to IPC:**  
   The ready flow and/or request-AI-orders flow receive the toggle. Options:
   - Add to `game:requestAiOrders` and `game:ready` payloads e.g. `usePrecomputation?: boolean`. When true, pass it through to `requestOrders(state, modelId, { enabledToolNames, usePrecomputation: true })`.
   - Do not persist the toggle (nothing persists between games or restarts). Use payload only. Document in the plan or README how to run A/B (e.g. “Run 5 turns with usePrecomputation false, note metrics; same seed with usePrecomputation true”).

2. **Wall-clock time:**  
   In `requestOrders`, record start time before the tool loop and end time when the final response is parsed (or on error). Add to the success result e.g. `wallClockMs?: number`. Surface in the IPC result so the renderer or logs can show “AI turn took N ms.”

3. **Token counts:**  
   OpenRouter response may include `usage: { prompt_tokens, completion_tokens }`. If present, add e.g. `inputTokens?: number; outputTokens?: number` to the result and log at debug. If the API doesn’t return tokens, leave as optional and document.

4. **Tool invocation counts:**  
   Already returned as `toolInvocationCounts`. When pre-computation is on, these counts are **ad-hoc only** (engine-run tool calls are not in this map). Confirm in code/comments that pre-computation calls are not added to `toolInvocationCounts`.

5. **Cost:**  
   Already in result as `cost`. No change.

6. **UI (minimal):**  
   Add a checkbox or toggle in the AI/options panel: “Use pre-computation (0.6): when on, the AI receives a briefing and typically makes 0–2 tool calls per turn.” Optional: show last-turn metrics (tool calls, cost, wall-clock) in the status area or dev panel. Out of scope: full analytics UI; logging and result shape are enough for 0.6.

**Verification**

- With pre-computation on: run one turn, assert result includes `wallClockMs`, `toolInvocationCounts` (expect 0–2 total for assessment/estimation if the model uses the briefing), and `cost`. If usage is available, assert `inputTokens`/`outputTokens` are set.
- With pre-computation off: assert same fields; `toolInvocationCounts` can be higher (5–10 range typical for 0.5). Compare two runs (on vs off) and confirm briefing path has fewer tool calls and lower latency in the logs.

**Exit condition:** Caller can select 0.5 vs 0.6 via payload (in-session only); result includes wall-clock time and optional tokens; tool counts and cost are correct for both modes; A/B comparison is possible.

---

## Phase 6: Documentation and Cleanup

**Goal:** Document the 0.6 design, how to run A/B tests, and any config constants; remove or guard any temporary logging that would be noisy in production.

**Tasks**

1. **.spec update:**  
   Add a short “Milestone 0.6 implementation notes” under `.spec` (or in this file): where the pre-computation pipeline lives, how the briefing is built, how the toggle is passed, and where to find metrics. Reference the dev plan playtest hypothesis and key metrics (ad-hoc tool calls, tokens, wall-clock, cost).

2. **Code comments:**  
   At the top of the pre-computation module and the briefing formatter, add orienting comments: purpose (A/B test and validation for hybrid architecture), when to use (requestOrders with usePrecomputation true), and that 0.7 will add callbacks.

3. **Constants:**  
   Document default values: max combat estimates (e.g. 15), max tool iterations (unchanged at 50). assess_hex is run for all hexes with at least one human unit unless skipHexAssessments is true (default false/undefined). If they are configurable, document where.

4. **Logging:**  
   Keep debug logs for pre-computation run and briefing size; avoid logging full briefing or full tool responses at debug in production. Error logs for failed assessments or formatting errors are kept.

**Verification**

- Read-through: a new developer can find the toggle, run both modes, and interpret tool counts and cost from the result or logs.
- No new linter or type errors; existing tests still pass.

**Exit condition:** 0.6 behavior and A/B process are documented; code is ready for playtesting and for Milestone 0.7 (callbacks) to build on.

---

## Verification Summary

| Phase | Verification |
|-------|--------------|
| 1 | Unit test: N AI units → N assessment results, correct shape. |
| 2 | Unit test: fixture with in-range pairs → combat estimates (capped); hex assessments for all hexes with a human unit. |
| 3 | Unit test: fixed inputs → briefing string with Section 1, Section 2 (two tables), Section 3, memory, standing orders. |
| 4 | Integration: requestOrders with usePrecomputation true → prompt contains briefing; usePrecomputation false → unchanged 0.5 prompt; both paths produce valid orders. |
| 5 | Run both modes; result has wallClockMs, toolInvocationCounts, cost; optional tokens; toggle is usable for A/B. |
| 6 | Docs and comments in place; constants documented; tests green. |

---

## Risk and Scope Notes

- **Token size:** A large map and many units could make the briefing large. The combat-estimate cap and spatial decay in the unit table are there to limit size. assess_hex runs for all hexes with a human unit (no cap). If playtests show oversized prompts, tighten the combat cap or shorten the strategic narrative.
- **Backward compatibility:** With `usePrecomputation` default `false`, existing callers and UI behave as today. No change to order format or to Tool 4/Tool 5 behavior.

---

## Summary

1. **Phase 1:** Pre-computation for all AI units (assess_unit) → typed list of results.  
2. **Phase 2:** Add combat estimates (likely engagements, capped) and assess_hex for all hexes with a human unit; single orchestrator.  
3. **Phase 3:** Briefing formatter: Section 1 (strategic narrative), Section 2 (unit status table + combat estimates table), Section 3 (attention flags), then memory and standing orders.  
4. **Phase 4:** requestOrders accepts usePrecomputation; when on, run pipeline, build briefing, use it in the prompt; max iterations stay at 50 (measure, don't limit).  
5. **Phase 5:** Toggle exposed to IPC/caller; result includes wallClockMs and optional tokens; A/B-ready.  
6. **Phase 6:** Docs and constants; cleanup.

Completion of Phase 6 delivers Milestone 0.6: pre-computation and briefing format with an A/B toggle and metrics for validating the hybrid architecture before implementing the callback system in Milestone 0.7.
