# Milestone 1.4 — LLM Production Command and Observation Support

*Execution plan for a coding agent. Extends current 1.4 control/production implementation so the LLM can reliably observe and manage build queues through both prompt-driven check-ins and tool calls.*

---

## 1. Goal, non-goals, and success criteria

### 1.1 Goal

Enable the AI opponent to:

- understand production rules and build constraints,
- observe current production status in structured briefing data,
- manage build queues via final response JSON during normal check-ins,
- manage build queues via dedicated tool calls when it needs iterative exploration,
- and have this capability gated/visible in the UI like existing tool groups.

### 1.2 Non-goals

- Rebalancing unit costs or production formulas.
- New economic systems (multiple resources, upkeep, supply modifiers).
- Res4-level production logic.
- Human UI redesign beyond any minimal observability needed for tool access/status.

### 1.3 Success criteria (binary)

1. Prompt/briefing includes accurate production rules, queue states, and available actions.
2. LLM can submit valid production management actions in normal final JSON.
3. LLM can call dedicated production tools for query/update flows.
4. Production tool access is controllable from the Tools UI and counted like other groups.
5. Orders from JSON and tool-calls follow deterministic merge/precedence rules.
6. Invalid production actions fail safely with clear errors and no DB corruption.
7. Tests cover happy paths and essential failure contracts only.
8. Build, lint, and tests pass.

---

## 2. Proposed capability shape

### 2.1 Two management paths

1. **Check-in JSON path (primary):**
   - LLM returns production updates in final response JSON (same turn payload as movement/ranged).
   - Best for concise planned changes.
2. **Tool-call path (interactive):**
   - LLM calls production tools (`query`, `add`, `update`, `remove`) before final submission.
   - Best for exploration and validation loops.

### 2.2 Suggested JSON contract extension

Add top-level optional field:

- `productionOrders: ProductionOrder[]`

Where each entry is one of:

- `{"action":"add_build_entry","hex":[lat,lng],"unitType":"infantry|armor|naval","count":1..99}`
- `{"action":"update_build_entry","hex":[lat,lng],"entryId":number,"unitType":"infantry|armor|naval","count":1..99}`
- `{"action":"remove_build_entry","hex":[lat,lng],"entryId":number}`

If `productionOrders` is present, each order must include all required fields for its action. Orders missing required fields are dropped and logged as dropped orders.

Implementation note: keep movement/combat order schema unchanged; production block is additive.

### 2.3 Suggested tool set (new tool group)

- `query_production(hex?)`
- `add_build_entry(hex, unitType, count)`
- `update_build_entry(hex, entryId, unitType, count)`
- `remove_build_entry(hex, entryId)`

All tools return `status: ok|error` with explicit error strings.

---

## 3. Reliability and maintainability principles

1. Keep production mutation logic centralized in existing backend domain methods (no duplicate logic in OpenRouter glue).
2. Define one canonical validation path reused by both JSON-applied orders and tool calls.
3. Preserve deterministic turn sequence: planning edits now, production resolves only after `Ready` in turn resolution.
4. Logging rules:
   - new/updated public mutators: debug logs,
   - caught exceptions: error logs,
   - getter-style methods: trace logs.
5. Add orienting comments on all new/updated public non-overriding methods.
6. Prefer small pure transformers for parse/normalize/apply steps to improve testability.
7. Preserve existing res1 lat/lng precision contract used by the LLM-facing interfaces.

---

## 4. Phased execution plan

### Phase A — Contract lock and shared DTOs

**Work**

1. Define shared types for production snapshots and production JSON order entries.
2. Define strict parse/normalize rules for `productionOrders`, including required-field enforcement per action.
3. Document precedence/merge behavior between tool-side mutations and final JSON actions.
4. Document partial-apply behavior: valid orders apply; invalid orders are dropped and logged.

**Verification**

- Unit tests for parser/normalizer (valid payloads, malformed payloads, bounds).
- No gameplay behavior change yet.

**Dependencies:** none.

---

### Phase B — Prompt and briefing production observability

**Work**

1. Extend briefing formatter to include:
   - production rules summary (costs, prereqs, turn timing),
   - per-controlled-hex queue state,
   - available unit types by hex,
   - actionable hints (which hexes can build what).
2. Extend system prompt guidance:
   - when to use production tools vs direct JSON orders,
   - clear examples of valid production actions.
3. Gate all production prompt/briefing guidance behind the `production` tool-group enabled state, matching existing controllable tool behavior.
4. Ensure AI perspective filtering remains correct (subjective state model compatible).

**Verification**

- Formatter tests for production sections.
- Prompt assembly tests asserting production guidance appears only when enabled.

**Dependencies:** Phase A.

---

### Phase C — Final JSON production command application

**Work**

1. Parse `productionOrders` in final LLM response.
2. Map lat/lng hex references to res1 h3 and apply actions via existing backend queue APIs.
3. Apply with safe partial semantics:
   - each action returns per-entry success/error,
   - invalid actions are dropped and logged with dropped-order diagnostics,
   - failures do not crash turn processing.
4. Emit concise diagnostics for applied/skipped production actions.

**Verification**

- Tests for happy-path add/update/remove via JSON.
- Essential failure tests (invalid hex, unauthorized, invalid count/unit type, missing entry).

**Dependencies:** Phase B.

---

### Phase D — Dedicated production tool-call support

**Work**

1. Add production tool metadata and dispatch handlers in OpenRouter loop.
2. Route tool calls to existing backend queue/query methods.
3. Add deterministic tool result sanitization and concise result payloads.
4. Keep tool-call and JSON-apply paths behaviorally equivalent.

**Verification**

- Tool dispatch tests for each production tool.
- Parity tests: equivalent JSON and tool-call operations yield same DB state.

**Dependencies:** Phase C.

---

### Phase E — UI tool-group control and observability

**Work**

1. Add new tool group entry (e.g., `production`) in tool registry.
2. Ensure Tools tab toggle and invocation counter behave like existing groups.
3. Wire enabled/disabled state into OpenRouter request filtering for production tools.
4. When disabled, remove production guidance and action schema/examples from prompts/briefings in the same way other controllable tools are removed.
5. Keep precedence rule unchanged when enabled (`productionOrders` applies last after any tool calls in the turn).

**Verification**

- Registry/unit tests for group visibility and enabled filtering.
- Renderer integration check for toggle and count updates.

**Dependencies:** Phase D.

---

### Phase F — End-to-end hardening

**Work**

1. End-to-end tests for:
   - check-in JSON production management,
   - tool-based production management,
   - mixed use in one turn,
   - disabled tool-group behavior.
2. Confirm no regression in existing movement/combat/tool workflows.
3. Final logging/comment audit for compliance.

**Verification**

- Full test suite green.
- Manual smoke checklist for AI production behavior and UI gating.

**Dependencies:** Phases A-E.

---

## 5. Suggested test matrix (happy paths + essential failures)

1. **Happy:** briefing includes queue status and valid build options per hex.
2. **Happy:** JSON `productionOrders` add/update/remove applies correctly.
3. **Happy:** production tools perform same operations as JSON path.
4. **Happy:** tool-group disabled hides production tools from request and prevents calls.
5. **Happy:** tool-group disabled removes production prompt/briefing guidance and production action schema/examples.
6. **Happy:** mixed movement/ranged/production JSON remains parseable and applied.
7. **Essential failure:** invalid count (`0`, `>99`, non-int) rejected and dropped with logged diagnostics.
8. **Essential failure:** invalid unit type for hex prerequisites rejected and dropped with logged diagnostics.
9. **Essential failure:** non-controller mutation rejected and dropped with logged diagnostics.
10. **Essential failure:** unknown entryId/remove target rejected safely and logged.
11. **Essential failure:** malformed `productionOrders` entries (missing required fields) are dropped, valid entries still apply, no crash.

---

## 6. Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Prompt bloat reduces model quality | High | Keep production block concise; move detail into tools/briefing tables. |
| Divergent behavior between JSON and tools | High | Single backend mutation path; parity tests. |
| Invalid AI actions causing state corruption | High | Strict validation + transactional apply + per-action error isolation. |
| Tool-group gating mismatch UI vs backend | Medium | Central registry source of truth and filtering tests. |
| Overly noisy logs | Low | Structured summary logs, avoid dumping large payloads. |

---

## 7. Suggested enhancements beyond requested scope

1. Add production-focused callback event in AI vocabulary:
   - `production_queue_empty(hexId)` and/or `production_stalled(hexId, reason)`.
2. Add compact aggregate production summary in briefing header:
   - total controlled urban capacity, total queued units by type, estimated completion horizon.
3. Add deterministic "recommended next production edits" helper (optional tool) if model quality needs support.

---

## 8. Open questions to finalize before implementation

No blocking product questions remain.

Locked decisions:

1. Tool group id/label: `production` / `Production`.
2. Default enabled: yes.
3. JSON field name: `productionOrders`.
4. Precedence: when both paths are used in one turn, final JSON applies last.
5. Coordinate contract: `[lat,lng]` only for LLM-facing contracts; no raw h3 exposure.
6. Scope: opponent AI only for now.
7. `add_build_entry` specifics are required: `unitType` and `count` are mandatory when the order is present.
8. Disabled `production` tool group removes production tools and production prompt/briefing/action-schema mentions.
9. Mixed-validity `productionOrders` use partial apply: valid entries apply; invalid entries are dropped and logged.

---

## 9. Coordinate precision lock (res1)

Current codebase contract (already implemented and tested) is:

- `H3_RESOLUTION = 1` uses `LATLNG_DECIMAL_PLACES = 2`.
- `buildLatLngCoordinateMap()` rounds to this precision for all LLM-facing coordinate maps.
- Prompt/briefing formatting paths (`openRouter`, `briefingFormatter`, Tool 5 injection) use `toFixed(LATLNG_DECIMAL_PLACES)`.

Implementation requirement for this milestone:

1. Do not introduce production prompt/tool formatting that bypasses `LATLNG_DECIMAL_PLACES`.
2. Reuse the existing coordinate map/format helpers so production hex references stay precision-consistent.
3. Add/extend tests to ensure production prompt/tool examples honor the same precision contract.

---

## 10. Recommended implementation order in one coding session

1. Phase A types/contracts.
2. Phase B prompt/briefing observability.
3. Phase C JSON apply path.
4. Phase D production tools.
5. Phase E UI gating/counting.
6. Phase F integration and regression pass.

This order minimizes rework and keeps each increment independently verifiable.

---

*End of plan.*

