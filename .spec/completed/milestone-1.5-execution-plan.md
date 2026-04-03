# Milestone 1.5 — Air Units, Strikes, and Infrastructure Effects

*Execution plan for a coding agent. Aligns with `.spec/devleopment-plan-v3.1.md` milestone **1.5 — Air Power and Infrastructure Destruction** and `.spec/combat-rules-v2.1.md`.*

---

## 1. Goal, non-goals, and success criteria

### 1.1 Goal

Implement a reliable, understandable milestone 1.5 slice covering:

- Air unit production availability and queue constraints (airport dependency).
- Air unit basing, visibility, and movement (ferry) contracts.
- Air strike planning UX (`Strike` button, target-type dropdown, cancel behavior).
- Strike assignment/rule validation parity with existing ranged-attack planning.
- Infrastructure-destruction production effects (urban/airport/seaport impacts).
- Resolution-order updates for air strike and ferry phases.
- AI integration updates for air operations (briefing, callbacks, and order schema behavior).
- Terrain feature replacement with `Rubble` and updated urban/rubble rendering style.

### 1.2 Non-goals (out of scope for this plan)

- Rebalancing combat probabilities, unit stats, or infrastructure counter-fire values.
- Adding new scenario content or AI strategy tuning beyond required data plumbing.
- Reworking unrelated tooltip systems outside strike/build interactions.
- Save-migration paths for unreleased schemas unless implementation discovers a hard dependency.

### 1.3 Success criteria (binary)

1. Selecting air units at a valid base shows a `Strike` button where ranged actions appear, with matching styling and visibility rules for mixed selections.
2. Clicking `Strike` shows a target-type dropdown (`Urban Hexes`, `Enemy Units`, `Airports`, `Seaports`) and a `Cancel` button to its right.
3. Clicking a valid target hex while strike mode is active plans an air strike and draws a dotted strike line with distinct (non-ranged) coloring.
4. Multi-air-unit strike assignment behavior matches existing ranged assignment semantics.
5. Invalid strike attempts (range/type/rule violations) are rejected with the same toast mechanism/styling as ranged rejections.
6. If a res1 hex urban count drops below a unit type prerequisite, that unit type is removed from that hex build queue.
7. If a res1 hex urban count reaches 0, that build queue is cleared.
8. Destroying an airport destroys all based air units and removes air units from that hex queue.
9. Destroying a seaport removes naval units from that hex queue.
10. Destroying urban/airport/seaport updates res1 totals and randomly replaces the corresponding number of matching res4 features with `Rubble` in that res1.
11. `Rubble` renders with current urban visual style (same colors + angled crosshatching), while `Urban` rendering updates to vertical/horizontal crosshatching.
12. Air production only appears where air production prerequisites are met, and uses milestone-locked air cost/cap values.
13. Air units provide expected visibility radius from base airport, including after strike/ferry actions.
14. Air ferry movement obeys ownership/intact-airport validation, abort rules, and one-action-per-turn constraint (strike or ferry).
15. Air units are destroyed when their base airport is destroyed or captured per combat rules.
16. AI briefing includes milestone-required air operations context (coverage, strike options, airport/seaport vulnerability), and infrastructure-destruction callbacks are emitted correctly.
17. Air orders in AI response/output schema support strike and ferry actions with validation parity.
18. New/updated public backend methods include orienting comments and required log levels.
19. Tests cover happy paths and essential failure contracts only; lint and tests pass.

---

## 2. Locked product rules for implementation

1. **Air strike planner controls:**
   - Visibility and placement follow ranged planner patterns exactly.
   - Same-style button treatment as existing ranged controls.
2. **Air production and basing rules:**
   - Air units can be built only where airport-dependent production prerequisites are satisfied.
   - Air cost is `30`; default air cap is `3` (fallback cap changes are out of this plan unless explicitly requested).
3. **Air visibility/movement rules:**
   - Air visibility radius is `3` hexes from base airport.
   - Air strike range is `3` hexes from base airport.
   - Ferry movement range is `4` hexes between airports, with resolution-time validation.
   - One action per turn: strike or ferry, never both.
4. **Strike target types (UI and validation contract):**
   - `units`, `urban`, `airport`, `seaport`.
5. **Strike assignment semantics:**
   - Same multi-unit assignment model as ranged (single-click plan, per-unit assignment behavior parity).
6. **Strike rejection semantics:**
   - Reject out-of-range, wrong/missing target type, and other invalid rule states via existing rejection toast pipeline.
7. **Queue pruning rules from infrastructure loss:**
   - Urban threshold drops prune now-invalid types.
   - Urban = 0 clears queue.
   - Airport destroyed removes queued air and based air units.
   - Seaport destroyed removes queued naval.
8. **Res1/res4 sync:**
   - Destruction mutates res1 aggregate counts.
   - Equivalent number of matching res4 features in parent res1 are replaced by `Rubble`, chosen randomly.
9. **Rendering rules:**
   - `Rubble` uses current urban visual treatment.
   - `Urban` updates to vertical + horizontal crosshatching.
10. **AI and tooling rules:** Air operations are represented in AI briefing/pre-computation outputs per milestone requirements; callback/event emission includes infrastructure destruction events relevant to air/infrastructure gameplay; air actions follow response/order schema contracts (`air_strike`, `ferry`) with backend validation; if tool/service spec docs are maintained in-repo, milestone-required schema changes are documented in `.spec`.

---

## 3. Reliability and maintainability principles

1. Keep strike-validation and infrastructure-impact rules in backend/domain services, not duplicated in UI.
2. Reuse ranged planning abstractions where possible to reduce drift and defects.
3. Encapsulate randomness for rubble replacement behind a seeded/random-provider boundary suitable for deterministic tests.
4. Use explicit invariants for production queues after infrastructure changes (no invalid entries may persist).
5. Add orienting comments on new/updated public non-overriding methods.
6. Logging contract:
   - public backend mutators: debug-level logs,
   - public getter-style methods: trace-level logs,
   - caught exceptions: error-level logs.
7. Prefer small pure helpers for queue-pruning and res4 replacement selection to maximize testability.

---

## 4. Proposed domain/API contract updates

### 4.1 Domain model additions/updates

1. Extend terrain feature enumeration/model with `RUBBLE`.
2. Ensure res1 aggregate counters and res4 feature records support synchronized mutation for:
   - urban decrements,
   - airport destroyed flag/count impact,
   - seaport destroyed flag/count impact.
3. Ensure production queue entry schema/enum supports at least:
   - `infantry`, `armor`, `naval`, `air`.

### 4.2 Service methods (proposed names; adapt to codebase)

- `planAirStrike(playerId, selectedUnitIds, targetHex, targetType)` (debug log)
- `validateAirStrikeOrder(...)` (trace log when used as query/validation)
- `planAirFerry(playerId, airUnitIds, destinationAirportHex)` (debug log)
- `validateAirFerryOrder(...)` (trace log when used as query/validation)
- `getAirVisibilityCoverage(playerId, unitId)` (trace log)
- `buildAirOperationsBriefing(playerId, turnContext)` (trace log)
- `emitInfrastructureDestroyedEvent(type, res1HexId, metadata)` (debug log)
- `applyInfrastructureDestructionEffects(res1HexId, targetType, destroyedCount)` (debug log)
- `pruneBuildQueueForInfrastructureState(res1HexId)` (debug log)
- `replaceRes4FeaturesWithRubble(res1HexId, featureType, count, rng)` (debug log)
- `getAirStrikeOptionsForSelection(...)` (trace log)
- `resolveAirBaseCaptureAndDestructionEffects(...)` (debug log)

Implementation note: keep public API names aligned with existing ranged/production naming conventions, even if these exact names differ.

---

## 5. Phased execution plan (ordered, independently verifiable)

### Phase A — Rule lock and shared constants

Work:

1. Add/confirm centralized constants for:
   - air strike target types and labels,
   - air strike line styling token(s),
   - air visibility/strike/ferry range values,
   - air production cost/cap configuration keys,
   - queue pruning rules tied to urban/airport/seaport prerequisites.
2. Add orienting comments and log scaffolds in new/updated service entry points.
3. Define/confirm `Rubble` terrain-feature model contract.

Verification:

- Unit tests for constants/parsing/mapping (target type labels -> enum values).
- No behavioral change yet in existing gameplay flows.

**Dependencies:** none.

---

### Phase B — Air strike UI controls parity with ranged

Work:

1. Add `Strike` button visibility logic to selected-air-at-base state using ranged visibility rules.
2. Add click transition `Strike` -> target-type dropdown + right-side `Cancel`.
3. Reuse existing ranged planner UI mechanics for enter/exit mode, cancel, and selection reset behavior.

Verification:

- Component/UI tests:
  - strike control appears for valid air selections,
  - hidden for invalid selections,
  - mixed selection parity with ranged behavior,
  - cancel exits mode and restores prior UI state.
- Manual check for style parity with ranged button/cancel treatment.

**Dependencies:** Phase A.

---

### Phase C — Strike targeting, assignment, and strike-line visualization

Work:

1. Wire target hex click handling in strike mode to `planAirStrike`.
2. Implement strike-line rendering:
   - dotted line,
   - similar geometry to ranged line,
   - distinct color token.
3. Ensure multi-air-unit assignment uses same assignment semantics as ranged attacks.

Verification:

- Interaction tests for single/multi air-unit assignment on valid targets.
- Rendering tests (or snapshot checks) for dotted strike line with distinct styling token.
- Regression checks: ranged visuals/assignment unchanged.

**Dependencies:** Phase B.

---

### Phase D — Backend strike validation and rejection pipeline

Work:

1. Implement/extend backend strike validators:
   - in-range (air strike range),
   - selected target-type exists at target hex,
   - rules-compliance checks consistent with combat rules.
2. Integrate with existing rejection toast flow for consistent look/behavior with ranged rejection.
3. Ensure all rejection paths log sufficient debug context; caught exceptions emit error logs.

Verification:

- Service tests:
  - valid strike accepted,
  - out-of-range rejected,
  - wrong/missing target type rejected.
- UI integration tests: rejection toast appears with expected styling/behavior.

**Dependencies:** Phase C.

---

### Phase E — Infrastructure destruction to production/queue effects

Work:

1. On urban destruction:
   - update res1 urban totals,
   - prune queue entries that no longer meet urban prerequisites,
   - clear queue when urban reaches 0.
2. On airport destruction:
   - destroy based air units,
   - remove queued air units.
3. On seaport destruction:
   - remove queued naval units.
4. Centralize pruning logic in one domain service path invoked after any relevant infra change.

Verification:

- Unit tests:
  - threshold-drop pruning (e.g., armor/naval removed when urban too low),
  - urban=0 queue clear,
  - airport/seaport-specific queue pruning.
- Integration tests:
  - airport destruction removes based air units immediately and prunes queue.

**Dependencies:** Phase D.

---

### Phase F — Res1/res4 synchronization and rubble replacement randomness

Work:

1. Implement feature replacement routine per target type:
   - choose matching res4 features within res1 randomly,
   - replace with `Rubble` count-equivalent to destruction impact.
2. Ensure replacement is capped by currently available matching features.
3. Persist res1 aggregate updates and res4 replacements transactionally.
4. Add deterministic test support via injectable RNG/seedable selection.

Verification:

- Unit tests for:
  - count correctness,
  - cap behavior,
  - randomness selection boundaries.
- Integration tests for transactional consistency between res1 totals and res4 replacements.

**Dependencies:** Phase E.

---

### Phase G — Rendering updates for urban and rubble

Work:

1. Add `Rubble` renderer style identical to current urban style (same color + angled crosshatching).
2. Update `Urban` renderer style to vertical/horizontal crosshatching.
3. Validate legend/tooltip labels where terrain feature names are displayed.

Verification:

- Visual regression/snapshot tests for urban and rubble rendering patterns.
- Manual map inspection for readability and no accidental style regressions.

**Dependencies:** Phase F.

---

### Phase H — End-to-end integration, diagnostics, and hardening

Work:

1. Validate full turn-resolution sequence interactions:
   - strike planning -> resolution -> infrastructure effects -> queue pruning -> rendering.
2. Add concise diagnostics across boundaries (selection, validation outcome, destruction effects, queue deltas).
3. Run focused regression pass for existing ranged planning, production, and tooltip workflows.

Verification:

- End-to-end deterministic scenario tests (fixed seed where relevant).
- Lint clean and target test suites pass.
- Manual acceptance checklist fully satisfied.

**Dependencies:** Phases A-G.

---

### Phase I — Air production, visibility, and ferry movement contracts

Work:

1. Add/extend air production gating in build queue UX/backend validation:
   - airport-dependent availability,
   - milestone-locked cost/cap integration in production flow.
2. Implement/verify air visibility coverage computation and state exposure for planning UI and AI/engine consumers.
3. Implement ferry planning and validation:
   - range validation,
   - owned/intact destination airport checks at resolution time,
   - abort-to-origin behavior and origin-loss destruction behavior.
4. Enforce one-action-per-turn rule for each air unit (strike xor ferry).

Verification:

- Unit tests for production gating and cap/cost contract checks.
- Unit/integration tests for visibility radius coverage.
- Unit/integration tests for ferry success, abort, and destruction edge cases.
- Essential failure test: strike+ferry dual assignment on same unit in same turn is rejected.

**Dependencies:** Phases A-D.

---

### Phase J — Turn sequencing, base-capture destruction, and end-to-end parity

Work:

1. Integrate full five-phase sequence hooks where milestone 1.5 requires them:
   - air strike (pre-move) -> ranged (pre-move) -> ground/naval movement -> ferry movement -> melee.
2. Implement post-resolution air base survival checks:
   - airport destroyed/captured => based air units destroyed.
3. Verify infrastructure destruction effects and queue pruning occur in correct resolution timing boundary.
4. Run replay determinism checks for rubble replacement and air resolution ordering when seeded RNG is present.

Verification:

- End-to-end turn tests proving phase order and timing effects.
- End-to-end test proving air unit destruction on base loss/capture.
- Replay determinism tests with fixed seed.

**Dependencies:** Phases E-I.

---

### Phase K — AI, event, and tool-schema integration for air operations

Work:

1. Extend pre-computation/briefing generation to include air operations section:
   - air unit base + coverage footprint,
   - strike targets in range by type with rule-validity context,
   - airport/seaport vulnerability indicators.
2. Ensure callback/event layer emits infrastructure destruction events with required type metadata.
3. Ensure AI order/output schema and validators fully support:
   - `air_strike` with `targetHex` + `targetType`,
   - `ferry` with destination airport.
4. Confirm/implement milestone rule that air actions are one-turn tactical actions (not standing orders), unless architecture already enforces this via action model.
5. If applicable in this repository, update spec docs in `.spec` for MCP/tool contract changes tied to milestone 1.5.

Verification:

- Tests for briefing content contract presence and field correctness.
- Tests for infrastructure callback/event emission payloads.
- Schema/validator tests for valid and invalid `air_strike`/`ferry` AI actions.
- Essential failure test: invalid AI air action payload is rejected safely and logged.

**Dependencies:** Phases I-J.

---

## 6. Suggested test matrix (happy paths + essential failures)

1. **Happy:** Air selection at base exposes `Strike`; click reveals dropdown + `Cancel`.
2. **Happy:** Air production option appears only with valid airport-dependent prerequisites and uses milestone-locked air cost/cap.
3. **Happy:** Valid `Enemy Units` strike assignment succeeds; strike line appears.
4. **Happy:** Valid infrastructure target selection for each type (`Urban`, `Airport`, `Seaport`) succeeds when present and in range.
5. **Happy:** Mixed and multi-air selection behavior matches ranged assignment contracts.
6. **Happy:** Ferry order succeeds when destination airport is owned/intact and within range.
7. **Happy:** Ferry aborts to origin when destination becomes invalid; air unit is destroyed if origin is also invalid.
8. **Happy:** One-action-per-turn enforced (`strike` xor `ferry`).
9. **Happy:** Air visibility radius from base is exposed and correct after strike/ferry actions.
10. **Happy:** Urban destruction reduces res1 totals and prunes disallowed queued unit types.
11. **Happy:** Airport destruction removes based air units and queued air.
12. **Happy:** Seaport destruction removes queued naval.
13. **Happy:** Res4 replacements with `Rubble` match required counts (within available-cap rules).
14. **Happy:** Urban and rubble visual patterns match updated style rules.
15. **Essential failure:** Out-of-range strike rejected with ranged-style toast.
16. **Essential failure:** Target-type mismatch (e.g., airport type on non-airport hex) rejected with ranged-style toast.
17. **Essential failure:** Invalid strike state (unit not eligible to strike) rejected safely with error logging for exceptions.
18. **Essential failure:** Same-turn strike+ferry assignment rejected safely and logged.
19. **Happy:** AI briefing includes air operations section with expected coverage/target/vulnerability fields.
20. **Happy:** Infrastructure destruction emits callback/event payload with correct type metadata.
21. **Essential failure:** Invalid AI `air_strike` or `ferry` payload rejected by schema/validator and logged.

Avoid tests for pure delegation wrappers, DTO boilerplate, and styling internals beyond contract-level snapshots.

---

## 7. Risks and mitigations

|Risk|Impact|Mitigation|
|---|---|---|
|UI/back-end strike rule divergence|High|Shared validation contract + integration tests around rejection reasons.|
|Queue corruption after infrastructure changes|High|Single pruning entry point with transactional updates and invariant tests.|
|Incorrect air-phase sequencing changes gameplay outcomes|High|Add explicit phase-order integration tests and deterministic replay checks.|
|Ferry validation drift between planning and resolution|High|Centralize ferry validation helper and cover destination-invalid/origin-invalid cases.|
|Non-deterministic tests from rubble randomness|Medium|RNG injection and fixed-seed tests for deterministic assertions.|
|Ranged-planner regressions while reusing code|Medium|Side-by-side regression tests for ranged vs strike planner behavior.|
|Visibility regression under strike/ferry actions|Medium|Dedicated visibility contract tests before/after air actions.|
|AI briefing/schema drift from gameplay rules|Medium|Contract tests for briefing fields and AI action validator parity with domain rules.|
|Visual ambiguity between urban and rubble|Medium|Explicit style tokens + visual regression snapshots + manual checks.|
|Excessive logging volume|Low|Structured concise fields; avoid payload dumps.|

---

## 8. Acceptance checklist (manual)

- [ ] `Strike` button appears only in correct air-selection states and matches ranged placement/style.
- [ ] Clicking `Strike` swaps to target-type dropdown and right-side `Cancel`.
- [ ] Target types available: `Urban Hexes`, `Enemy Units`, `Airports`, `Seaports`.
- [ ] Air production option appears only when airport-dependent prerequisites are met.
- [ ] Air production cost/cap behavior matches milestone-locked values.
- [ ] Valid target click plans strike and draws distinct dotted strike line.
- [ ] Invalid strike attempts show ranged-style rejection toast.
- [ ] Multi-air-unit assignment behavior matches ranged semantics.
- [ ] One-action-per-turn enforced for each air unit (`strike` xor `ferry`).
- [ ] Ferry behavior matches rule contract for success, destination invalid abort, and origin-loss destruction.
- [ ] Air visibility coverage from base airport updates correctly after air actions.
- [ ] Urban threshold loss prunes now-invalid queue entries.
- [ ] Urban at zero clears queue.
- [ ] Airport destruction destroys based air units and removes queued air.
- [ ] Seaport destruction removes queued naval.
- [ ] Res1 totals update correctly when urban/airport/seaport are destroyed.
- [ ] Matching res4 features are replaced with `Rubble` randomly within the same res1.
- [ ] Replay-mode seeded runs produce deterministic rubble/air-order outcomes (if replay seed is enabled).
- [ ] `Rubble` visuals match prior urban style.
- [ ] `Urban` visuals use vertical/horizontal crosshatching.
- [ ] New/updated public backend methods have orienting comments and required logs.

---

## 9. Implementation-order recommendation

1. Phase A (contracts/constants) to reduce ambiguity.
2. Phase I (air production/visibility/ferry contracts) to establish core air rules first.
3. Phases B-D (strike UX + validation path) to establish player-facing behavior safely.
4. Phases E-F (destruction effects + res1/res4 consistency) to preserve state correctness.
5. Phase G (rendering updates) once data model is stable.
6. Phase J (turn-sequence/base-capture integration + replay determinism).
7. Phase K (AI/event/schema integration for air operations).
8. Phase H regression hardening and final cross-system verification.

This order minimizes risk by establishing rule contracts before UI wiring, then validating state mutation before visual polish.

---

## 10. Clarification decisions (locked)

1. **Queue-prune order preservation:** Preserve exact relative order of remaining valid queue entries.
2. **Airport/seaport rubble conversion count:** Replace exactly `1` matching res4 feature per destroyed airport/seaport event.
3. **Enemy-units target eligibility messaging:** Selecting a hex with only friendly units fails using the same rejection reason/message contract as invalid ranged targets.
4. **Strike-line color token:** Implementation selects a visually distinct color token from existing palette without adding unnecessary palette risk.
5. **Randomness reproducibility:** Use deterministic rubble replacement in replay flows when seeded RNG is available; do not add unnecessary complexity/risk beyond current replay architecture.
6. **Infrastructure timing:** Queue pruning/clearing applies immediately during resolution when destruction is applied.
7. **Mixed-selection behavior:** Air strike controls follow ranged mixed-selection logic exactly (replace/augment behavior parity with current capability-specific action handling).
8. **Numeric rule lock for this milestone:** Use air cost `30`, cap `3`, visibility `3`, strike range `3`, ferry range `4` unless explicitly changed later by balancing scope.
9. **Broad-scope lock interpretation:** "Everything else described" includes milestone-1.5 air AI/event/schema integration and associated `.spec` contract documentation where such specs are maintained.

---

*End of plan.*
