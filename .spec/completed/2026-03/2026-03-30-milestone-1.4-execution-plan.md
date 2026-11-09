# Milestone 1.4 — Hex Control and Production Queues

*Execution plan for a coding agent. Aligns with `.spec/devleopment-plan-v3.md` milestone **1.4 — Economy and Production**, scoped to the detailed rules provided for hex control and build queues.*

---

## 1. Goal, non-goals, and success criteria

### 1.1 Goal

Implement a reliable, understandable production system centered on res1 hex control:

- res1 hexes have exactly one control state: uncontrolled or controlled by one player.
- control changes only when contesting enemy occupation is resolved (no control flips in contested hexes).
- controlled hexes expose a constrained build queue UI in the res1 tooltip.
- queue progress advances each turn using urban capacity and unit costs.
- paid units spawn in their source res1 hex after combat resolution.
- control changes clear queue/progress immediately and can cause same-turn production loss.

### 1.2 Non-goals (out of scope for this milestone execution)

- Supply-line combat modifiers (mentioned in v3 milestone text but not in current detailed rule set).
- Res4-level independent control tracking (res4 inherits res1 control only).
- New resource types beyond urban production capacity.
- Deep economy balancing beyond locked costs and gating rules.

### 1.3 Success criteria (binary)

1. Each res1 hex is represented as uncontrolled or controlled by one player only.
2. Contested occupancy never changes control until opposing occupancy no longer exists.
3. Control persists across turns until eligible enemy occupation takes over.
4. Build controls appear only for controlling player and only when urban prereqs allow.
5. Build option gating is correct:
   - infantry requires >= 1 urban,
   - armor requires >= 2 urban,
   - naval requires >= 5 urban and >= 1 seaport.
6. If urban count is 0, build section is replaced by explanatory message.
7. Queue order is honored strictly; production spends capacity in queue order each turn.
8. Unit costs are enforced exactly: infantry 10, armor 20, naval 50.
9. Fully paid units spawn in source res1 hex after combat.
10. If control changes before production/spawn in that turn, pending queue and spawn are lost.
11. Tests cover happy paths and essential failure/contract cases only.
12. Lint and tests pass.
13. Spawn is allowed in contested hexes when the controller remains unchanged; spawned units can participate starting next turn.
14. When build queue editing starts, tooltip enters modal mode and does not auto-dismiss while editing.
15. Queue edits persist immediately on each change; modal close does not revert edits.
16. Production accrual/spawn is executed only as part of turn resolution after `Ready` is clicked.

---

## 2. Locked product rules for implementation

1. **Control state model (res1):**
   - `null` (uncontrolled) or `playerId` (single controller).
2. **Contest rule:**
   - if a hex contains units from >=2 players, control does not change while contested.
3. **Persistence rule:**
   - once controlled, a hex remains controlled until another player validly takes control.
4. **Res4 inheritance:**
   - res4 control is derived from parent res1; no independent res4 control storage.
5. **Build queue model:**
   - queue is an ordered list of entries `{ unitType, remainingCount }`.
   - add entries with `Build`; remove with row `x`.
6. **Build gating by terrain features:**
   - infantry option only if urban >= 1.
   - armor option only if urban >= 2.
   - naval option only if urban >= 5 and seaports >= 1.
7. **No-urban behavior:**
   - hide build controls and show explanatory message when urban = 0.
8. **Production throughput:**
   - each turn, a controlled hex contributes `urbanCount` production points.
   - costs: infantry 10, armor 20, naval 50.
   - queue consumes points from front to back; partial funding carries forward.
9. **Spawn timing:**
   - production/spawn happens after combat.
10. **Control-change loss rule:**
   - if control changes before production/spawn, queue is cleared and pending output is lost.
11. **Contested spawn behavior:**
   - if hex is contested but control did not change, production/spawn still occurs for controller.
   - spawned units are eligible for combat starting the next turn.
12. **Queue entry count bounds:**
   - integer range is `1..99` inclusive.
   - default new entry count is `1`.
13. **Build queue modal interaction:**
   - once user begins build queue interaction, tooltip becomes modal.
   - modal does not auto-dismiss while the user is editing inside the dialog.
   - clicking cancel, pressing `Escape`, or clicking any control outside the dialog closes it.
   - queue changes are persisted immediately as the user edits.
   - closing the modal does not revert edits.
14. **Turn trigger boundary:**
   - queue editing is planning-phase state.
   - production and spawning occur only in resolution flow triggered by `Ready`.

---

## 3. Reliability and maintainability principles

1. Keep control and production rules in a single domain service, not split across UI and engine.
2. Use explicit deterministic turn sequencing: combat -> control finalization -> production/spawn.
3. Enforce queue invariants through validated public service methods (no direct mutation).
4. Add orienting comments on new/updated public non-overriding methods.
5. Logging contract:
   - public backend mutators: debug-level logs,
   - caught exceptions: error-level logs,
   - public getter-style non-mutators: trace-level logs.
6. Prefer pure functions for core queue/payment calculations and cover them with focused tests.

---

## 4. Proposed data model and contracts

### 4.1 Persistent state additions (proposed)

1. `res1_control`
   - `h3_index TEXT PRIMARY KEY`
   - `controller_player_id TEXT NULL`
2. `res1_build_queue`
   - `id INTEGER PRIMARY KEY`
   - `h3_index TEXT NOT NULL`
   - `queue_index INTEGER NOT NULL`
   - `unit_type TEXT CHECK (unit_type IN ('infantry','armor','naval'))`
   - `remaining_count INTEGER NOT NULL CHECK (remaining_count > 0)`
3. `res1_build_progress`
   - `h3_index TEXT PRIMARY KEY`
   - `stored_points INTEGER NOT NULL DEFAULT 0`

Implementation note: `stored_points` represents partial payment carry-over for the queue head.

### 4.2 Service/API contracts (proposed)

- `getHexControl(h3Index)` (trace log)
- `getBuildQueue(h3Index, requestingPlayerId)` (trace log + authorization)
- `addBuildQueueEntry(h3Index, requestingPlayerId, unitType, count=1)` (debug log)
  - `count` must be integer in `1..99`
- `removeBuildQueueEntry(h3Index, requestingPlayerId, queueEntryId)` (debug log)
- `processProductionForTurn(turnNumber)` (debug log)
- `resolveHexControlAfterCombatAndMovement()` (debug log)

All mutators validate:
- controller authorization,
- unit type gate prerequisites by current hex metadata,
- count bounds,
- queue index consistency after insert/remove.

---

## 5. Phased execution plan (ordered and independently verifiable)

### Phase A — Rule lock, constants, and schema scaffolding

**Work**

1. Add central constants module:
   - unit costs,
   - build prerequisites,
   - explanatory no-urban message key/text.
2. Add DB schema/tables for control, queue, and progress (hard cutover; no legacy save migration path).
3. Add repository/service skeletons with orienting comments and required log levels.

**Verification**

- Schema tests confirm tables/indexes are present.
- Unit tests for constants/prerequisite helpers.
- Existing gameplay unchanged while new systems are not yet wired.

**Dependencies:** none.

---

### Phase B — Control ownership engine integration

**Work**

1. Implement deterministic control resolution from post-combat board state:
   - uncontested single-player occupancy can set control,
   - contested occupancy preserves existing control.
2. Implement control persistence when no valid takeover occurs.
3. Implement control-change handler that clears queue + progress.
4. Add integration hook into resolution pipeline before production phase.

**Verification**

- Integration tests:
  - uncontrolled -> controlled when first uncontested occupation occurs,
  - contested hex does not change controller,
  - prior controller persists across empty/uncontested non-takeover states per locked rule,
  - control takeover clears queue/progress.

**Dependencies:** Phase A.

---

### Phase C — Build queue domain operations and validation

**Work**

1. Implement queue add/remove operations:
   - append in order,
   - default count = 1,
   - remove by row id and reindex.
2. Implement unit-type availability validation from hex metadata:
   - infantry/armor/naval gate checks.
3. Enforce controller-only access for queue mutation.
4. Add DTO/snapshot shape for tooltip consumption.

**Verification**

- Unit tests for add/remove/reindex behavior.
- Unit tests for gate checks using representative urban/seaport combinations.
- Essential failure tests:
  - non-controller mutation rejected,
  - unavailable unit type rejected,
  - invalid count rejected.

**Dependencies:** Phase B.

---

### Phase D — Per-turn production accrual and spawning

**Work**

1. Implement pure `applyProduction(queue, storedPoints, urbanCount)` calculator:
   - consume points in queue order,
   - produce zero-to-many completed units each turn,
   - return updated queue, updated storedPoints, and spawn list.
2. Integrate calculator into turn pipeline after combat/control finalization.
3. Spawn completed units in source res1 hex with existing unit-creation pipeline.
4. If control changed this turn, ensure queue is already cleared and no spawn occurs.

**Verification**

- Unit tests for calculator:
  - partial carry-over behavior,
  - multi-unit completion in one turn with high urban counts,
  - strict queue ordering.
- Integration tests:
  - example parity:
    - 2 urban -> infantry in 5 turns,
    - 10 urban -> naval in 5 turns,
    - 100 urban -> up to 5 armor/turn when queued.
  - same-turn control change prevents would-be spawn.

**Dependencies:** Phase C.

---

### Phase E — Tooltip UI for build queue management

**Work**

1. Add build section to res1 tooltip for controlling player only.
2. Add `Build` button that appends editable queue entry.
3. Add entry controls:
   - type selector constrained by available options,
   - editable count initialized to 1,
   - `x` remove button.
4. Match style of stack popup buttons (solid-blue fill) for `Build` and `x`.
5. If urban = 0, hide build controls and show explanatory message.
6. Convert tooltip to modal interaction once queue editing begins:
   - add small cancel button in corner (toast-like pattern),
   - add `Escape` key handler,
   - suppress auto-dismiss from passive hover-loss while modal is active,
   - close modal on outside-click interactions (including `Ready` and other controls),
   - persist add/edit/remove changes immediately.

**Verification**

- UI component tests for conditional rendering and option gating.
- Interaction tests for add/edit/remove queue behavior.
- Visual/manual check for button style parity.
- Interaction test: tooltip remains open during active in-dialog editing and closes on cancel, `Escape`, or any outside control interaction.
- Interaction test: queue edits are immediately persisted and remain after cancel close/reopen.

**Dependencies:** Phases C-D.

---

### Phase F — Turn-resolution integration and regression hardening

**Work**

1. Wire full deterministic sequence:
   - movement/combat resolution,
   - control resolution + queue-clear on takeover,
   - production accrual/spawn (only during resolution triggered by `Ready`).
2. Add end-to-end scenario tests for multi-turn production and takeover loss.
3. Add concise dev diagnostics (debug logs with hex, controller, queue length, points, spawned count).

**Verification**

- End-to-end deterministic replay tests pass with fixed seed.
- No regressions in existing movement/combat tests.
- Lint clean.

**Dependencies:** Phases A-E.

---

## 6. Suggested test matrix (happy paths + essential failures)

1. **Happy:** first uncontested entry claims uncontrolled hex.
2. **Happy:** contested hex blocks control change.
3. **Happy:** controller persists until valid enemy uncontested takeover.
4. **Happy:** queue add/remove maintains stable order.
5. **Happy:** unit type availability matches urban/seaport prerequisites.
6. **Happy:** production accumulates and spawns correct counts over turns.
7. **Happy:** production respects queue ordering when multiple entries exist.
8. **Happy:** takeover clears queue and progress immediately.
9. **Essential failure:** non-controller cannot modify queue.
10. **Essential failure:** invalid unit type for hex prerequisites rejected.
11. **Essential failure:** out-of-range or non-integer queue counts rejected (`<1`, `>99`, non-int).
12. **Essential failure:** spawn pipeline failure logs error and fails safely without corrupting queue.
13. **Essential failure:** no production/spawn work executes during planning-phase queue edits before `Ready`.

Avoid tests for pure delegation wrappers and DTO boilerplate.

---

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Ambiguous control timing causes inconsistent outcomes | High | Lock explicit turn order and test contested/takeover transitions. |
| Queue corruption from concurrent edits and turn processing | High | Serialize queue mutations in backend service and keep DB writes transactional. |
| Hidden UI/backend rule mismatch for build options | Medium | Use shared validation constants in backend and UI option derivation tests. |
| Production rounding/carry-over bugs | Medium | Isolate calculator as pure function with table-driven tests. |
| Overly noisy logs | Low | Use structured concise fields, avoid large payload dumps. |

---

## 8. Acceptance checklist (manual)

- [ ] Contested hexes never flip control while multiple players occupy.
- [ ] Controlled hexes persist with last valid controller until takeover conditions are met.
- [ ] Tooltip build controls are only visible to the controller.
- [ ] Build section hidden with clear explanation when urban = 0.
- [ ] Infantry/armor/naval options appear only when prerequisites are met.
- [ ] `Build` and `x` buttons match stack popup button style (solid blue).
- [ ] Queue entries are editable and removable with stable ordering.
- [ ] Queue entry count accepts only integers `1..99` and defaults to `1`.
- [ ] Costs are enforced exactly (10/20/50).
- [ ] Units spawn only after combat in the source res1 hex.
- [ ] Same-turn control change clears queue and prevents would-be spawn.
- [ ] Contested hexes still spawn for unchanged controller; spawned units only fight starting next turn.
- [ ] Build queue tooltip becomes modal during editing, does not auto-dismiss mid-edit, and closes on cancel, `Escape`, or outside control interaction.
- [ ] Queue edits persist immediately and are not reverted by cancel-close.
- [ ] No production/spawn occurs before `Ready` triggers turn resolution.
- [ ] No obvious turn-loop performance regression.

---

## 9. Follow-up status

No blocking product-rule questions remain for milestone 1.4 planning.

Hard cutover decision is locked: this is unreleased software and no legacy save migration path is required.

---

## 10. Recommended coding-session order

1. Phase A schema/constants.
2. Phase B control resolution and takeover clear.
3. Phase C queue mutation + validation contracts.
4. Phase D production calculator + spawn integration.
5. Phase E tooltip controls and styling.
6. Phase F end-to-end sequencing and regression pass.

This order minimizes rework and keeps each increment independently verifiable.

---

*End of plan.*

