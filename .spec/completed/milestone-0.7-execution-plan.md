# Milestone 0.7 — Callback System and Event-Driven Consultation: Execution Plan

*Version 1.0 — March 2026*

This document is an execution plan for implementing **Milestone 0.7 — Callback System and Event-Driven Consultation** from the [Strategic Development Plan v3](devleopment-plan-v3.md) and [POC Analysis](poc-analysis.md). It is written for a coding agent. Phases are organized for **maximum reliability and clarity**, with each phase **independently verifiable or verifiable with previously completed phases**. Generated code must be **reliable and understandable** for future developers. This work requires a **significant refactor** of the 0.6 milestone codebase: the turn lifecycle and when the LLM is invoked change from "every turn (or when precomputed orders are used)" to "only when a callback event fires."

---

## Scope Summary

**In scope**

- **Callback event system:** A finite, engine-evaluable event vocabulary. The LLM subscribes to events via a `callbacks` array in its response JSON. After each turn's resolution, the engine evaluates all active subscriptions and **mandatory override** conditions. When any event fires, the engine re-runs pre-computation and consults the LLM; when no event fires, the engine does not invoke the LLM and uses standing-order-generated orders only for the next resolution.
- **Event vocabulary (initial set):** `turns(N)`, `unit_engaged(unitId)`, `unit_destroyed(side?)`, `unit_arrived(unitId)`, `threat_escalation(unitId, severity)`, `territory_changed(hexId?)`.
- **Mandatory overrides (always fire regardless of LLM subscription):** (0) First consultation (none yet this game); (1) Any AI unit participates in combat for the first time since the last consultation; (2) Any AI unit is destroyed; (3) Any AI unit without a standing order exists; (4) An AI unit's standing order enters a blocked or error state; (5) No LLM consultation for 5 turns (deadman timer).
- **LLM output format (revised):** Response JSON includes optional `callbacks` array (new subscriptions replace previous ones for that player) and optional `memoryUpdates` array (write/delete applied in addition to or instead of tool calls; spec allows moving write operations to response-only for 0.7+). Orders remain as today (`movementOrders`, `rangedAttacks`, `strategy`); explicit `orders` array with `assign_order`/`cancel_order` is optional future extension — for 0.7 the AI can continue to use tool calls for standing orders.
- **Storage:** All callback- and consultation-related state is persisted in the **database** (SQLite), not in-memory. This includes: callback subscriptions, "pending AI orders for next turn" (when consultation ran after last resolution), last-consultation turn, and "AI units that have participated in combat since last consultation" for mandatory overrides. Database persistence aligns with future load/save/replay (whether in 0.x or the real game): this state will be part of the saved game and can be restored on load.
- **Mode toggle:** A/B testing between **every-turn consultation** (0.5/0.6 behavior) and **event-driven consultation** (0.7). When event-driven is on, Ready uses pending orders from last consultation when present; otherwise generates orders from standing orders only (no LLM call). After each resolution, the engine evaluates callbacks and optionally runs the LLM and stores results for the next turn.
- **Briefing and pre-computation:** When the LLM is consulted (event-driven or every-turn), pre-computation and briefing format remain as in 0.6. The briefing includes an "ACTIVE CALLBACKS" section listing current subscriptions and when they fire (e.g. "turns(3) fires turn 15").

**Out of scope for this plan**

- Territory control or objective hexes (no `territory_changed` payload from game logic until Phase 1; event can exist with no-op or placeholder).
- Fog of war (no `new_contact`; mandatory overrides stay as listed).
- Response JSON as the **only** path for write operations (assign_order, cancel_order, memory_write, memory_delete). For 0.7 the AI may still use tools for writes; optional `memoryUpdates` in response is additive.
- Full analytics UI; logging and result shape are sufficient for playtest.

**Technical constraints**

- Reuse 0.6 pre-computation, briefing formatter, and `requestOrders`. Standing-order order generation (`generateOrdersForStandingOrders`) is reused when no consultation runs.
- The refactor is centered in the **turn lifecycle**: who decides AI orders for the next resolution (LLM vs standing-order-only), and when consultation runs (after resolution vs at Ready). Preserve 0.5/0.6 behavior when event-driven mode is off.

**Persistence (database).** All new state introduced for 0.7 (callback subscriptions, pending AI orders, last consultation turn, units-in-combat-since-consultation) is stored in SQLite, not in process memory. This is the first explicit persistence decision for LLM consultation state beyond the existing `ai_memory` and `standing_orders` tables. Storing it in the database from the start supports future load/save/replay (in 0.x or the real game) without a later migration from in-memory to DB. When the game is reset (new game or DB recreated), all 0.7 state must be cleared or recreated with the schema so no callback/pending data leaks across games.

---

## Compliance with Project Rules

Implementing agents must follow the project's coding rules. The following apply to all new and updated code in this milestone:

1. **Reliability and clarity:** Generated code must be correct and easy to understand. Double-check the first time a path is implemented.
2. **Logging:** Use existing `logDebug`, `logError`, `logTrace`. Debug for public method invocations, error for caught exceptions, trace for getter-style methods that don't modify state. Include enough detail for troubleshooting. Do not check log level before calling unless building potentially large strings inline.
3. **Testing:** Happy paths and essential failure cases only. Test code contracts and essential behavior, not implementation details. Do not add tests for thin delegation, DTOs/accessors, or REST-controller-style boilerplate. Remove any test cases made unnecessary by these restrictions.
4. **Orienting comments:** All new public non-overriding methods must have orienting comments (why the method exists, when to use it, how to use it, results and exceptions). Interface methods focus on contracts; implementation methods focus on high-level implementation details.
5. **Specs:** Design and spec guidance stay in `.spec` as markdown.
6. **Reuse:** Prefer existing code and patterns; do not duplicate tool logic or lifecycle logic. Use the codebase's existing patterns and idioms so new code stays consistent and maintainable.

---

## References

- **Development plan:** [.spec/devleopment-plan-v3.md](devleopment-plan-v3.md) — Hybrid AI Architecture, Callback Event System, Milestone 0.7 description, event vocabulary, mandatory overrides, LLM output format, playtest hypothesis.
- **POC analysis:** [.spec/poc-analysis.md](poc-analysis.md) — Event-driven consultation, cost/latency benefits.
- **MCP tools spec:** [.spec/completed/mcp-tools-spec.md](completed/mcp-tools-spec.md) — Tool interfaces, standing orders, memory.
- **0.6 implementation:** [.spec/completed/milestone-0.6-implementation-notes.md](completed/milestone-0.6-implementation-notes.md) — Pre-computation, briefing, toggle, metrics. Code: `openRouter.ts`, `precomputation.ts`, `briefingFormatter.ts`, `gameIpcHandlers.ts`, `tool5StandingOrders.ts` (`generateOrdersForStandingOrders`).

---

## Database Schema Additions (Summary)

For implementers, the following persistent state is added in the database (see individual phases for table/key design):

| State | Where stored | Cleared on |
|-------|----------------|------------|
| Callback subscriptions | Table e.g. `ai_callback_subscriptions` | New game / schema init |
| Pending AI orders (next turn) | Table e.g. `ai_pending_orders` or `game_config` | After consumed at Ready, or new game |
| Last consultation turn | e.g. `game_config` key `ai_last_consultation_turn` | New game |
| Opponent units in combat since consultation | Table e.g. `ai_combat_since_consultation` or `game_config` JSON | When consultation runs, or new game |

Ensure the same code path that resets/recreates the game (e.g. `gameDb` init or new-game handler) also creates these tables and clears or initializes this state. If the application has a "new game" action that does not recreate the database from scratch, that path must explicitly clear or reset all 0.7 state (subscriptions, pending orders, last consultation turn, combat-since-consultation set) so no callback or pending data leaks into the new game.

---

## Event Vocabulary and Mandatory Overrides (Spec)

| Event | Parameters | Fires when |
|-------|------------|------------|
| `turns` | `n`: integer | N turns have elapsed since subscription (e.g. subscribe turn 10 with n=3 → fires turn 13). |
| `unit_engaged` | `unitId`: string | This AI unit participates in combat (ranged or melee) this resolution. |
| `unit_destroyed` | `side?`: "own" \| "enemy" \| or specific unitId | A unit is destroyed; if side given, filter by owner. |
| `unit_arrived` | `unitId`: string | This AI unit's standing march order reaches destination (status becomes arrived). |
| `threat_escalation` | `unitId`: string, `severity`: "moderate" \| "critical" | This AI unit's threat assessment worsens to the specified level (from unit assessments). |
| `territory_changed` | `hexId?`: optional | Control of an objective hex changes (out of scope for 0.7 game logic; event type can exist, no-op or never fire). |

**Mandatory overrides (always fire, even if not subscribed):**

0. **First consultation:** No LLM consultation has occurred yet this game (lastConsultationTurn unset or 0). Ensures the AI is consulted at least once so it can set callbacks and orders.
1. Any AI unit participates in combat **for the first time** since the last consultation.
2. Any AI unit is destroyed.
3. Any AI unit without a standing order exists (newly spawned, order completed, order cancelled).
4. An AI unit's standing order enters a blocked or error state (blocked, target_lost, target_out_of_range, target_destroyed, etc.).
5. No LLM consultation has occurred for 5 turns (deadman timer).

---

## Success Criteria (Playtest)

When the plan is implemented:

- **Event-driven mode:** When enabled, the LLM is consulted only when an event fires (or a mandatory override). On quiet turns, AI orders are generated from standing orders only; no LLM call. Total LLM invocations per game drop; total cost and latency drop (target: ~30–50% of turns consulted on a typical small-map game; per-game cost down at least 50% vs every-turn).
- **Coherence:** Play 3–5 full games. "Could I tell which turns the AI was thinking and which were autopilot?" Target: no — standing orders should carry the game plan; when consulted after an event, the AI response shows awareness of what changed (via briefing).
- **Mandatory overrides:** If the LLM sets poor criteria (e.g. `turns(10)` on a fast-moving front), mandatory overrides (unit engaged, destroyed, unordered, blocked, deadman) still trigger consultation. Verify in tests and one manual run.
- **Regression:** With event-driven mode off, behavior matches 0.6 (every-turn or precomputed path unchanged).

---

## Prerequisites

- **Milestone 0.6** complete: pre-computation, briefing, A/B toggle (`usePrecomputation`), metrics. `requestOrders` returns orders; standing-order generation runs inside `requestOrders` and is also available via `generateOrdersForStandingOrders`.
- **Current flow:** Renderer calls `game:requestAiOrders` (background) → precomputed AI orders stored; on Ready, renderer sends `game:ready` with optional `precomputedAiOrders`/`precomputedAiRangedOrders`. If not provided, main calls `requestOrders` then `ready(aiOrders, aiRangedOrders)`. Resolution runs inside `ready()`; after return, phase is planning and turn_number incremented.
- **Refactor scope:** Introduce event-driven path behind a toggle. When event-driven is on: (1) After resolution, evaluate callbacks; if any fire, run `requestOrders`, parse `callbacks` from response, store pending AI orders and new subscriptions. (2) On next Ready, if pending orders exist use them; else generate from standing orders only (no LLM). When event-driven is off, keep current 0.6 behavior.

---

## Phase 1: Callback Subscription Storage and Schema

**Goal:** Persist callback subscriptions for the opponent player in the database. No evaluation or lifecycle changes yet. Independently verifiable via storage and retrieval.

**Tasks**

1. **Schema:** Add a **SQLite table** for callback subscriptions (database persistence supports future load/save/replay). Example:
   - `ai_callback_subscriptions (player_id TEXT, event_type TEXT, params TEXT, subscribed_turn INTEGER, PRIMARY KEY (player_id, event_type, params_hash))` or one row per subscription with a unique id. Params stored as JSON (e.g. `{"n": 3}` for turns, `{"unitId": "opponent-armor-1"}` for unit_arrived).
   - For 0.7, only one player (`opponent`) has subscriptions. Replace-all semantics per consultation: each LLM response's `callbacks` array replaces the full set of subscriptions for that player.
   - Add the table in the same bootstrap/migration that creates `turn_state`, `standing_orders`, etc., so it is created and cleared with the rest of the game state when the DB is recreated (e.g. new game).

2. **CRUD module:** New module (e.g. `src/main/callbackSubscriptions.ts`): `getSubscriptions(playerId): Subscription[]`, `replaceSubscriptions(playerId, subscriptions): void`, `clearSubscriptions(playerId): void`. Subscription type: `{ event: string; params: Record<string, unknown> }` (e.g. `{ event: 'turns', params: { n: 3 } }`). All operations read/write the database.

3. **Integration with DB:** Add the table in `gameDb.ts` (or the module that initializes the schema) alongside other game tables. When the game is reset (DB recreated or new game), this table is dropped/recreated with the schema so no callback state leaks across games unless save/load is implemented later.

4. **Logging:** Debug log when subscriptions are replaced; trace when read.

**Verification**

- Unit test: set subscriptions for opponent (e.g. two entries: turns(3), unit_arrived(armor-1)); read back; replace with one; read back. Assert content and replace-all semantics.
- No change to `requestOrders`, `ready`, or renderer.

**Exit condition:** Callback subscriptions can be stored and retrieved by player. No evaluation logic yet.

---

## Phase 2: Mandatory Override State and Evaluation Helpers

**Goal:** Track state required for mandatory overrides (last consultation turn, "AI units in combat since last consultation") and implement pure functions that, given current game state and this tracked state, return whether each mandatory override fires. No invocation of LLM or change to Ready path yet.

**Tasks**

1. **Last consultation turn:** Persist the turn number at which the LLM was last consulted for the opponent in the **database** (e.g. `game_config` key `ai_last_consultation_turn` or a small table). Update when a consultation completes (Phase 5). Read when evaluating callbacks. Database persistence keeps this consistent with load/save/replay.

2. **Units in combat since consultation:** After each resolution, record which opponent unit IDs participated in combat (ranged or melee). When we consult the LLM, clear this set (or set "last consultation turn" and treat "in combat since" as units that participated in any resolution after that turn). So: persist a set or list of unit IDs: "opponent units that have been in combat since last consultation." After resolution, add this turn's combat participants (opponent side) to the set. When consultation runs, clear the set. Evaluation: "mandatory override: first combat" fires if and only if at least one opponent unit participated in combat this resolution and that unit was not in the set before we added this turn's participants (i.e. first time since last consultation we see that unit in combat). Implement as: before adding this turn's participants, if any participant is not yet in the set → fire; then add all this turn's opponent combat participants to the set.

3. **Helper: evaluate mandatory overrides:** Function `evaluateMandatoryOverrides(state, lastConsultationTurn, opponentUnitsInCombatSinceConsultation, thisResolutionOpponentCombatants): MandatoryOverrideResult[]`. Returns list of reasons that fired (e.g. `{ type: 'first_combat', unitId }`, `{ type: 'unit_destroyed', unitId }`, `{ type: 'unordered_unit', unitId }`, `{ type: 'standing_order_blocked', unitId }`, `{ type: 'deadman', turnsSince: number }`). Implement each rule:
   - First combat: any of `thisResolutionOpponentCombatants` not in `opponentUnitsInCombatSinceConsultation` (before adding).
   - Unit destroyed: any opponent unit was removed this resolution (pass in removed unit IDs from resolution result).
   - Unordered unit: any opponent unit has no standing order (query standing_orders / getStandingOrderInjectionText or tool5).
   - Standing order blocked: any opponent unit's standing order has status in { blocked, target_lost, target_out_of_range, target_destroyed, arrived, contact } (warning states).
   - Deadman: `state.turnNumber - lastConsultationTurn >= 5` (and lastConsultationTurn > 0).
   - First consultation: `lastConsultationTurn` is 0 or unset → fire so the AI gets one chance to set callbacks and orders.

4. **Persist "opponent units in combat since consultation":** Store in the **database** (e.g. a table `ai_combat_since_consultation (player_id, unit_id)` or a single row with a JSON array of unit IDs in `game_config`). Update after resolution (add this turn's opponent combat participants); clear when consultation completes (Phase 5). Ensures this state is part of saved game for future load/save/replay.

**Verification**

- Unit tests: with fixture state and mock lastConsultationTurn / combat sets, call `evaluateMandatoryOverrides`. Assert correct firing for: first consultation (lastConsultationTurn 0 or unset); first combat (unit in this resolution, not in set); unit destroyed (removed list non-empty); unordered unit (unit with no order); blocked order (unit with status blocked); deadman (turn - lastConsult >= 5).
- No change to Ready or requestOrders yet.

**Exit condition:** Mandatory override evaluation is implemented and testable; state for "last consultation turn" and "units in combat since consultation" is defined and updatable.

---

## Phase 3: Subscription (LLM-Requested) Event Evaluation

**Goal:** Given post-resolution state and current subscriptions, evaluate each subscription and return which events fired. Do not invoke the LLM. Events that require pre-computation (e.g. threat_escalation) can be evaluated by running pre-computation for assessment data and comparing to previous or to thresholds; keep Phase 3 focused on events that need only state + subscriptions.

**Tasks**

1. **turns(N):** For each subscription `{ event: 'turns', params: { n } }`, compute the turn at which it was subscribed (store `subscribed_turn` when replacing subscriptions). Fire if `state.turnNumber >= subscribed_turn + n`.

2. **unit_engaged(unitId):** Fire if `unitId` is in the set of opponent units that participated in combat this resolution (same data as mandatory "first combat" — opponent combat participants this turn).

3. **unit_destroyed(side?):** Fire if any unit was destroyed this resolution; if `params.side === 'own'` filter to opponent units; if `'enemy'` filter to human; if specific unitId, fire only if that unit was destroyed.

4. **unit_arrived(unitId):** Fire if this opponent unit's standing order status is `arrived` (and optionally that it became arrived this turn — compare to previous status or infer from order state; simplest: fire if status is arrived at evaluation time and we didn't already fire for this unit this turn if you need idempotence).

5. **threat_escalation(unitId, severity):** Requires threat data from assessments. Run unit assessment for that unit (or use pre-computation result if available); if any threat has `severity === params.severity`, fire. Option: run pre-computation once in "evaluate all events" and reuse for threat_escalation checks.

6. **territory_changed:** No-op for 0.7 (no territory control). Return not fired or omit from evaluation.

7. **Orchestrator:** `evaluateSubscriptionEvents(state, subscriptions, resolutionContext): SubscriptionEventResult[]`. `resolutionContext` includes: opponent combat participants this turn, removed unit IDs, previous standing order statuses if needed. Return list of events that fired (for logging and to decide "any fired?").

**Verification**

- Unit tests: subscriptions with turns(3) at turn 10 → fire at turn 13; unit_engaged(armor-1) with armor-1 in combat participants → fire; unit_destroyed with human unit in removed list → fire; unit_arrived(inf-1) with inf-1 status arrived → fire. Threat_escalation with mocked assessment → fire when severity matches.
- No LLM call; no change to Ready.

**Exit condition:** All subscription event types (except territory_changed) are evaluable; orchestrator returns which subscription events fired. Mandatory overrides (Phase 2) and subscription events (Phase 3) together define "any event fired."

---

## Phase 4: LLM Response Format — Parse callbacks and memoryUpdates

**Goal:** Extend the LLM response parser to accept optional `callbacks` and `memoryUpdates` in the same JSON object as `movementOrders`/`rangedAttacks`/`strategy`. Apply memory updates (write/delete) in the same order as the response; persist new callback subscriptions (replace-all for opponent). Do not yet change when the LLM is invoked (still every turn or when precomputed in 0.6 flow).

**Tasks**

1. **Parse callbacks:** In `parseOrdersResponse` (or a dedicated parser for the extended format), read optional `callbacks` array. Each item: `{ event: string, params?: object }`. Normalize event names (e.g. `turns` vs `turns(N)` — spec uses `turns` with params `{ n }`). Validate event type against the vocabulary; ignore unknown. Store `subscribed_turn` as current state.turnNumber when saving (so turns(N) fires at currentTurn + N).

2. **Parse memoryUpdates:** Read optional `memoryUpdates` array. Each item: `{ action: 'write' | 'delete', key: string, content?: string, tier?: 'persistent' | 'stored' }` for write; `{ action: 'delete', key: string }` for delete. Call existing memory layer (tool4) to apply: for write, upsert; for delete, delete. Apply in order. Enforce same limits and validation as tool4 (e.g. 500 char content, tier limits).

3. **Apply after successful order parse:** When `requestOrders` succeeds and parses the final response, if `callbacks` present call `replaceSubscriptions('opponent', normalizedSubscriptions)`. If `memoryUpdates` present, apply each. Log at debug: number of callbacks set, number of memory updates applied.

4. **Backward compatibility:** If the LLM does not send `callbacks` or `memoryUpdates`, behavior unchanged. Existing tests that don't send these still pass.

**Verification**

- Unit test: parse response JSON with `callbacks: [{ event: 'turns', params: { n: 3 } }, { event: 'unit_arrived', params: { unitId: 'opponent-armor-1' } }]`. Assert subscriptions replaced and readable via getSubscriptions. Parse response with `memoryUpdates: [{ action: 'write', key: 'x', content: 'y', tier: 'stored' }]`; assert memory contains key.
- Integration: one requestOrders run with a model that can output callbacks (or mock response); assert subscriptions and memory updated.

**Exit condition:** LLM can set callbacks and memory updates via response JSON; subscriptions and memory are updated after a successful consultation. No change yet to when consultation runs.

---

## Phase 5: After-Resolution Callback Evaluation and Conditional Consultation

**Goal:** After each resolution, run callback evaluation (mandatory overrides + subscription events). If any fire, run pre-computation and `requestOrders`, then store the returned orders as "pending AI orders for next turn" and update subscriptions (and memory) from the response. Update "last consultation turn" and clear "opponent units in combat since consultation." If no event fires, do not call the LLM; leave "pending AI orders" empty so the next Ready will use standing-order-only orders.

**Tasks**

1. **Entry point:** Add a function `afterResolution(state, resolutionResult)` (or equivalent) that receives the game state **after** resolution (turn_number already incremented, phase planning) and the resolution result (removed unit IDs, opponent combat participants, etc.). Call it from the Ready path immediately after `ready()` returns and state is refreshed (e.g. in the IPC handler that calls `handleGameReady`, or inside a new `handleAfterResolution` that the renderer or main invokes after Ready).

2. **Gather resolution context:** From `resolutionResult` and state: list of opponent unit IDs that participated in combat this resolution (ranged + melee); list of removed unit IDs; optionally previous standing order statuses if needed for "arrived" semantics. Pass to evaluators. **Implementation note:** The current `ready()` return value includes `removedUnitIds`, `removedUnits`, and `kills`, but may not include "opponent combat participant" unit IDs. If not, extend the return type (or the data passed to afterResolution) to include e.g. `opponentCombatParticipantUnitIds: string[]`, computed inside `ready()` from ranged attackers (from aiRangedOrders/human ranged), defenders at target hexes, and units in melee combat hexes (from post-move unit positions). This list is required for mandatory override "first combat" and for subscription event `unit_engaged`.

3. **Update "units in combat since consultation":** Before evaluating mandatory overrides, compute set of opponent combat participants this resolution. Check "first combat" (any participant not in the set). Then add all this turn's opponent combat participants to the persisted set. When consultation runs (below), clear this set and set last_consultation_turn = currentTurn.

4. **Evaluate:** Call `evaluateMandatoryOverrides(...)` and `evaluateSubscriptionEvents(...)`. If either returns at least one fired event, set `shouldConsult = true`.

5. **If shouldConsult:** Call `requestOrders(state, modelId, { enabledToolNames, usePrecomputation: true })` (reuse 0.6 path). On success: store `result.orders` and `result.rangedAttacks` as "pending AI orders for next turn"; parse and apply `callbacks` and `memoryUpdates` from the same response (Phase 4); set last_consultation_turn = state.turnNumber; clear "opponent units in combat since consultation." On failure: log; do not set pending orders (next turn will use standing-order-only). Do not block the renderer: run afterResolution asynchronously after Ready returns, or run synchronously if fast; if async, ensure pending orders are written before the user can click Ready again (or accept that first Ready after resolution might not have pending yet — then use standing-order-only for that one turn).

6. **If !shouldConsult:** Do not call requestOrders. Clear "pending AI orders for next turn" (or leave empty). Do not update last_consultation_turn or combat set (deadman will fire later).

7. **Persist pending orders:** Store "pending AI orders" and "pending AI ranged orders" for the next turn in the **database** (e.g. table such as `ai_pending_orders` with player_id, turn_number, movement_orders JSON, ranged_orders JSON, or one row in `game_config` keyed by player). When the next Ready runs, if event-driven mode is on and pending orders exist, use them and clear them; else use standing-order-only generation. Database persistence allows this state to be saved and restored for load/save/replay.

**Verification**

- Test: run resolution (e.g. via ready with mock AI orders); call afterResolution with state and resolution result that includes one mandatory override (e.g. unordered unit). Assert requestOrders is called (or that shouldConsult is true and in integration requestOrders runs). Assert pending orders and subscriptions updated.
- Test: resolution with no events firing. Assert requestOrders not called; pending orders empty.
- Test: deadman — last consultation 5+ turns ago; assert shouldConsult true.

**Exit condition:** After each resolution, callback evaluation runs; when any event fires, consultation runs and pending orders + subscriptions are stored; when none fire, no LLM call and no pending orders.

---

## Phase 6: Ready Path — Use Pending Orders or Standing-Order-Only in Event-Driven Mode

**Goal:** When event-driven mode is on, at Ready time: if pending AI orders (from last run of afterResolution) exist, use them and do not call requestOrders. If no pending orders, generate AI orders from standing orders only (call `generateOrdersForStandingOrders`) and do not call the LLM. When event-driven mode is off, preserve 0.6 behavior (use precomputed from renderer or call requestOrders at Ready).

**Tasks**

1. **Mode flag:** Add `useEventDrivenConsultation?: boolean` to the Ready payload (and optionally to requestAiOrders). When true, the lifecycle uses "after resolution → evaluate → maybe consult → store pending" and "at Ready → use pending or standing-order-only." When false, current 0.6 flow: precomputed or requestOrders at Ready.

2. **HandleGameReady:** When `useEventDrivenConsultation` is true: If pending AI orders exist (from Phase 5), use them as `aiOrders` and `aiRangedOrders` and clear pending. Else, call `generateOrdersForStandingOrders('opponent', state, ...)` to get movement and ranged orders; use those. Do not call `requestOrders` in this branch. When `useEventDrivenConsultation` is false, keep existing logic: use payload precomputed if provided, else call requestOrders.

3. **Standing-order-only generation:** Obtain `latLngByH3` and `resolveToH3` from the same coordinate map as requestOrders (from state.hexes). Call `generateOrdersForStandingOrders('opponent', state, latLngByH3, resolveToH3)`. Use returned `movementOrders` and `rangedAttacks` (same shape as requestOrders result). Ensure the standing order status update runs before generating orders so that "arrived" and "blocked" are current. Today that logic runs inside requestOrders when building the prompt; when we don't call requestOrders (standing-order-only path), the same update must run first. Use whatever function or sequence the codebase already uses for expire/update of standing order statuses (e.g. in tool5); do not duplicate the logic.

4. **After Ready:** Ensure `afterResolution` is invoked after each successful Ready when event-driven is on. So: Ready handler returns; then main (or renderer) calls an IPC `game:afterResolution` or the Ready handler itself calls afterResolution before returning (with post-resolution state). If afterResolution is async, document that pending orders may be set after a short delay; prefer running afterResolution synchronously after ready() so that by the time the next planning phase is shown, pending orders are already set if consultation ran.

5. **Renderer:** When event-driven mode is on, do not send precomputed AI orders from background requestAiOrders for the purpose of "skip requestOrders at Ready" — the main process will supply AI orders from pending or standing-order-only. Option: when event-driven is on, do not start background requestAiOrders at all (no precomputed); Ready always gets orders from main (pending or standing-order-only). So the renderer sends `useEventDrivenConsultation: true` and no precomputed orders; main handles everything.

**Verification**

- Integration: enable event-driven, run one turn (Ready with standing-order-only or mock orders). After resolution, trigger one mandatory override (e.g. unordered unit). Assert afterResolution runs and pending orders are set. Next Ready: assert no requestOrders call and the resolved orders match pending.
- Integration: event-driven on, no event fires for one resolution. Next Ready: assert orders come from generateOrdersForStandingOrders only; no requestOrders.
- Regression: event-driven off, run as 0.6; precomputed path and requestOrders-at-Ready path unchanged.

**Exit condition:** Event-driven mode uses pending orders when available and standing-order-only otherwise; Ready never calls the LLM in event-driven mode; afterResolution runs after each resolution when event-driven is on.

---

## Phase 7: Briefing and Prompt Updates for Callbacks

**Goal:** When building the briefing (0.6 path), add an "ACTIVE CALLBACKS" section so the LLM sees current subscriptions and when they fire. Reduce max tool iterations when pre-computation is on (optional per dev plan: "max-iteration cap drops from 10 to 5" — current code uses 50; can leave at 50 for 0.7 or lower to 5 per spec). Document in prompt that the LLM may output a `callbacks` array to subscribe to events and that write operations may be in `memoryUpdates`.

**Tasks**

1. **Briefing section:** In `briefingFormatter.ts`, add a section "ACTIVE CALLBACKS" (or include in the existing briefing). List each subscription with human-readable description (e.g. "turns(3) → fires turn N", "unit_arrived(opponent-armor-1)"). If no subscriptions, "None. You may add callbacks in your response JSON to be consulted on specific events." Data from `getSubscriptions('opponent')` and current turn number.

2. **Prompt instructions:** In the system prompt (openRouter or briefing), add 1–2 sentences: the LLM may include a `callbacks` array in its final JSON to subscribe to events (turns, unit_engaged, unit_destroyed, unit_arrived, threat_escalation); when an event fires, the engine will re-consult with an updated briefing. Optionally: you may include `memoryUpdates` (write/delete) in the same JSON instead of calling memory tools.

3. **Remove placeholder:** Replace the 0.6 placeholder line "Callbacks not yet active (Milestone 0.7)" with the real ACTIVE CALLBACKS content or a pointer to it.

**Verification**

- Unit test: formatBriefing with mock subscriptions; assert output contains ACTIVE CALLBACKS and the listed events.
- Manual: run one consultation with event-driven on; set callbacks in response; next time briefing shows them.

**Exit condition:** The LLM sees current callbacks in the briefing and is instructed to output callbacks (and optional memoryUpdates) in the response JSON.

---

## Phase 8: UI Toggle and Metrics for Event-Driven Mode

**Goal:** Expose event-driven mode to the user (checkbox or toggle alongside "Use pre-computation (0.6)") and ensure metrics (consultation count, cost, latency) are available for playtest comparison.

**Tasks**

1. **Toggle:** Add "Use event-driven consultation (0.7)" (or similar) to the AI/options panel. State is in-session only (no persistence). Send with Ready and optionally with requestAiOrders. Pass through to handleGameReady and afterResolution.

2. **Metrics:** Log or return: whether consultation ran this turn (after resolution); total consultations this game (optional, if game session is identifiable); per-consultation cost and wall-clock time (already in requestOrders result). For "standing-order-only" turns, cost and latency are zero; surface that in status or result (e.g. `aiConsulted: false`, `aiCost: 0`).

3. **Status line:** When event-driven is on and no consultation ran, show a short status (e.g. "AI executing standing orders (no event fired).") so the user understands why there was no delay.

**Verification**

- With event-driven on, run several turns; confirm some turns show consultation and some show standing-order-only. Confirm metrics in logs or UI.
- With event-driven off, confirm 0.6 behavior and metrics unchanged.

**Exit condition:** User can enable event-driven mode; metrics and status support the playtest hypothesis and comparison with every-turn mode.

---

## Phase 9: Documentation and Cleanup

**Goal:** Document the 0.7 design, event vocabulary, mandatory overrides, and how to run event-driven vs every-turn. Add orienting comments to new modules. Remove or guard temporary logging.

**Tasks**

1. **.spec:** Add "Milestone 0.7 implementation notes" under `.spec`: where callback storage and evaluation live, where afterResolution is called, how pending orders flow to Ready, event list and mandatory overrides, how to run event-driven playtests.

2. **Code comments:** Add orienting comments for **every** new public non-overriding method (purpose, when to use, how to use, results/exceptions). Include module-level comments at the top of the callback subscription module, evaluation module, and at afterResolution: purpose (event-driven consultation for hybrid architecture), when to use (event-driven mode on), and how it fits the lifecycle (post-resolution → evaluate → maybe consult → store pending; Ready → use pending or standing-order-only).

3. **Constants:** Document deadman interval (5 turns), event types, and any caps. Document that territory_changed is no-op for 0.7.

4. **Tests:** Ensure all new code paths have happy-path and essential failure tests; no tests for thin DTOs or delegation-only functions per project rules.

**Verification**

- Read-through: a new developer can enable event-driven mode, run a game, and interpret which turns were consultations vs standing-order-only from logs or UI.
- Linter clean; existing tests pass.

**Exit condition:** 0.7 behavior and event-driven flow are documented; code is ready for playtesting and for Phase 1 (production architecture) to build on.

---

## Verification Summary

| Phase | Verification |
|-------|--------------|
| 1 | Store and retrieve callback subscriptions; replace-all semantics. |
| 2 | Mandatory override evaluation returns correct results for fixtures; state (last consultation, combat set) defined and updatable. |
| 3 | Subscription events (turns, unit_engaged, unit_destroyed, unit_arrived, threat_escalation) evaluate correctly; orchestrator returns fired events. |
| 4 | Parse callbacks and memoryUpdates from LLM response; apply and persist; backward compatible. |
| 5 | After resolution, evaluate callbacks; when any fire, run requestOrders and store pending orders + subscriptions; when none, no LLM. |
| 6 | Ready with event-driven on uses pending or standing-order-only; never calls LLM at Ready in event-driven mode; afterResolution runs after Ready. |
| 7 | Briefing includes ACTIVE CALLBACKS; prompt describes callbacks (and optional memoryUpdates) in response. |
| 8 | Toggle and metrics exposed; status reflects consultation vs standing-order-only. |
| 9 | Docs and comments in place; tests green. |

---

## Risk and Scope Notes

- **Async afterResolution:** If requestOrders is slow, running afterResolution synchronously after Ready could delay the Ready response. Prefer running afterResolution synchronously and accepting that the user may see a short "Resolving…" until it completes; alternatively run afterResolution asynchronously and document that the first Ready of the next turn might not yet have pending orders (then use standing-order-only for that turn). Choose one and document.
- **Standing order status update:** When we don't call requestOrders, we must still run the standing order status update (expire, arrived, blocked, etc.) before generating orders. In the standing-order-only path (Phase 6), run the same update the codebase already uses (e.g. in tool5); do not duplicate logic or assume a specific function name.
- **Territory control:** No game logic for objective hexes in 0.7; `territory_changed` never fires. Event type can exist in the schema and in the prompt; evaluation returns not fired.
- **Backward compatibility:** 0.5/0.6 paths (every-turn, precomputed) must remain unchanged when event-driven is off. All new code is behind the event-driven toggle or additive (subscriptions, pending orders).

---

## Questions for Reliable Execution

If any of the following are unclear from the codebase when implementing, resolve them in a way that matches this plan and document the choice in the 0.7 implementation notes:

1. **New game vs DB recreate:** Does the app have a "new game" that leaves the DB in place? If yes, that path must clear 0.7 state (see Database schema additions). If the DB is always recreated on launch, schema init is enough.
2. **Opponent combat participants:** If `ready()` does not currently return opponent unit IDs that participated in combat this resolution, extend it (or the data passed to afterResolution) so callback evaluation has that list. Phase 5 task 2 describes the requirement.
3. **afterResolution sync vs async:** Plan allows either; choose based on whether blocking Ready until consultation completes is acceptable. Document the choice and any UX impact (e.g. "Resolving…" shown until afterResolution returns).

---

## Summary

1. **Phase 1:** Callback subscription storage (schema + CRUD).
2. **Phase 2:** Mandatory override state and evaluation (last consultation turn, combat set, evaluateMandatoryOverrides).
3. **Phase 3:** Subscription event evaluation (turns, unit_engaged, unit_destroyed, unit_arrived, threat_escalation; orchestrator).
4. **Phase 4:** Parse and apply `callbacks` and `memoryUpdates` from LLM response; persist subscriptions and memory.
5. **Phase 5:** After-resolution hook: evaluate callbacks; if any fire, run requestOrders and store pending orders + subscriptions; update last consultation and combat set.
6. **Phase 6:** Ready path: event-driven on → use pending or standing-order-only; never call LLM at Ready in event-driven mode; invoke afterResolution after Ready.
7. **Phase 7:** Briefing and prompt: ACTIVE CALLBACKS section; instruct LLM to output callbacks (and optional memoryUpdates).
8. **Phase 8:** UI toggle and metrics for event-driven mode.
9. **Phase 9:** Documentation and cleanup.

Completion of Phase 9 delivers Milestone 0.7: callback system and event-driven consultation with A/B comparison against every-turn consultation, validating that the hybrid architecture maintains coherent AI play at lower cost and latency.
