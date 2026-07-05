# Milestone 1.6 — Naval Transport Sealift Execution Plan

*Execution plan for a coding agent implementation of milestone 1.6, aligned to `.spec/devleopment-plan-v3.2.md` and `.spec/combat-rules-v2.2.md`.*

> **Superseded rules (see `.spec/combat-rules-v3.md` §9):** Success criteria 12–14 below described coastal transport survival, coastal independent movement while embarked, and universal auto-debark on independent movement. Those behaviors are replaced by terrain-neutral transport loss, human manual debark before movement, and LLM-opponent auto-debark on independent movement orders.

---

## 1. Goal, non-goals, and success criteria

### 1.1 Goal

Implement a reliable and understandable sealift capability that adds mixed-stack embark/debark control in the stack popup, enforces cargo constraints, applies transport behavior through movement/combat/resolution, updates AI support, and performs startup data hygiene for invalid ports.

### 1.2 Non-goals

1. Rebalancing unit stats, movement ranges, or combat odds outside required embarked behavior.
2. Redesigning map generation pipeline beyond the required invalid-port cleanup rule.
3. Introducing additional UX controls not required by the milestone contract.
4. Adding non-essential test coverage for boilerplate delegation paths.

### 1.3 Success criteria (binary)

1. Mixed stack in a coastal `res1` hex with a valid port shows a new sealift section in stack popup; section also remains visible in non-embark contexts when embarked units are present so debark/review state is explicit.
2. Each naval row in sealift section shows naval name + two vertically stacked land-unit dropdowns + per-dropdown debark button.
3. Dropdown options are `(none)` + eligible land units in that stack.
4. Debark button is enabled only when corresponding dropdown is not `(none)` and resets selection to `(none)` when clicked.
5. Selecting a land unit in any dropdown embarks it on that naval unit and de-selects it from every other dropdown in popup.
6. De-selecting a land unit by any mechanism debarks it.
7. Selecting armor in slot 1 clears and disables slot 2 for that naval unit; selecting infantry or `(none)` re-enables slot 2.
8. Embark/debark changes apply immediately on interaction and are guaranteed persisted by popup close.
9. Embarked units travel with assigned naval unit, cannot move independently on water hexes, cannot fight ranged/melee/return fire on water, and retain defensive bonuses.
10. On water hexes, sealift dropdowns and debark buttons are disabled for mixed stacks.
11. On coastal hexes without valid port, dropdowns are disabled but debark remains enabled for selected units (debark-only mode).
12. Naval destruction on water destroys assigned cargo; naval destruction on coastal auto-debarks assigned cargo.
13. On coastal hexes, embarked land units can receive movement orders and can fight normally.
14. If an embarked land unit leaves the naval unit's coastal hex via movement order, it auto-debarks first.
15. LLM prompts and order support are updated to encourage and support embark/debark/sealift operations.
16. In initialization/new-game database build paths, `res1` hexes with ports but no open water side lose ports at `res1` and all contained `res4` hexes (hard cutover, no legacy DB migration).
17. New/updated public backend methods include orienting comments and required logs.
18. Tests cover happy paths and essential failure contracts; lint and tests pass.

---

## 2. Locked implementation rules for this milestone

1. **Sealift section visibility:** Show when selected stack includes both naval and land units in coastal/water contexts; additionally always show when any unit in the stack is embarked, even if controls are disabled by context.
2. **Capacity model:** One naval can carry either `1 armor` or `2 infantry` (or `1 infantry`), represented by two dropdown slots with armor occupying full capacity.
3. **Single-assignment invariant:** Each land unit may be assigned to at most one naval unit at a time within popup state and persisted game state.
4. **Embarkation mutability by terrain context:**
   - coastal with valid port: embark + debark allowed,
   - coastal without valid port: debark only,
   - water: neither embark nor debark allowed.
5. **Apply timing choice:** Use immediate apply on each dropdown/debark interaction, while still guaranteeing persisted correctness by popup close.
6. **Transport-loss rule:** Cargo fate depends only on naval loss hex type (water = cargo destroyed, coastal = cargo debarked).
7. **Auto-disembark before independent land movement:** Land movement orders from coastal hex clear `embarkedOn` when destination differs from assigned naval hex.
8. **Port validity cleanup rule:** Invalid ports are removed during initialization/new-game database build paths (hard cutover, no legacy DB migration).

---

## 3. Reliability and maintainability principles

1. Keep authoritative embark/debark legality in backend services; renderer enforces UI affordances but does not become source of truth.
2. Use deterministic helper functions for assignment reconciliation (set membership, duplicate elimination, capacity checks).
3. Add orienting comments to all new/updated public non-overriding backend methods.
4. Logging contract:
   - debug-level for public backend mutators,
   - trace-level for public getter/query methods,
   - error-level for caught exceptions.
5. Favor small focused helpers over large branching handlers in popup and resolution code.
6. Keep data-contract compatibility in `shared` IPC/order types to reduce renderer-main drift.
7. Preserve replay determinism and resolution ordering while adding transport behaviors.

---

## 4. Proposed contracts and data invariants

### 4.1 Data invariants

1. Land unit `embarkedOn` is either `null` or references an existing naval unit in same hex.
2. For a naval unit at any point in resolution:
   - total assigned cargo weight <= 2,
   - armor count <= 1.
3. No land unit appears in more than one naval cargo list.
4. If assigned naval unit is removed:
   - on water, assigned land units are removed,
   - on coastal, assigned land units have `embarkedOn = null` and remain in that hex until separately ordered to move.

### 4.2 UI state model (proposed)

1. Add popup-local sealift state keyed by naval unit id:
   - `slot1LandUnitId | null`,
   - `slot2LandUnitId | null`,
   - derived enable/disable flags.
2. Add derived selectors:
   - `isMixedStack`,
   - `isCoastalHex`,
   - `hasValidPortAtHex`,
   - `isWaterHex`.
3. Use one assignment-reconciliation helper that:
   - clears duplicates globally,
   - applies armor slot rule,
   - computes changed embark/debark deltas.

### 4.3 Service entry points (names illustrative, align with existing naming)

- `getSealiftOptionsForStack(...)` (trace log)
- `applySealiftAssignments(...)` (debug log)
- `validateSealiftAssignment(...)` (trace log)
- `applyAutoDisembarkBeforeMovement(...)` (debug log)
- `applyTransportLossForDestroyedNaval(...)` (debug log)
- `sanitizeInvalidPortsAtStartup(...)` (debug log)
- `buildSealiftBriefingSection(...)` (trace log)

---

## 5. Phased execution plan (ordered and independently verifiable)

### Phase A — Rule lock, contracts, and fixtures

Work:

1. Freeze sealift IPC/order/service contracts and shared enums for slot semantics.
2. Add test fixtures for mixed stacks (coastal+port, coastal-no-port, water).
3. Add orienting comments/log scaffolding to new public backend methods.

Verification:

- Typecheck/lint passes with no behavior changes.
- Contract tests for payload shapes and parser acceptance.

Dependencies: none.

---

### Phase B — Stack popup sealift UI skeleton

Work:

1. Extend stack popup to conditionally render sealift section for mixed stacks, and to keep it visible when embarked units are present in disabled/debark-only contexts.
2. Render per-naval row with:
   - naval name left,
   - two right-side dropdowns stacked vertically,
   - debark button beside each dropdown.
3. Keep section hidden for homogenous stacks with no embarked units.

Verification:

- UI tests/snapshots for presence/absence across mixed, embarked-disabled-context, and homogenous no-embark stacks.
- Manual visual check for expected layout and spacing.

Dependencies: Phase A.

---

### Phase C — Assignment semantics, deduping, and capacity behavior

Work:

1. Wire dropdown change handlers to sealift state and immediate backend apply path.
2. Enforce uniqueness: selecting a land unit clears same unit from all other slots.
3. Enforce armor occupancy rule:
   - selecting armor in slot 1 clears slot 2 and disables it,
   - selecting infantry/none re-enables slot 2.
4. Wire debark buttons:
   - enabled only for non-none selection,
   - clicking sets slot to `(none)` and debarks.

Verification:

- Component tests:
  - duplicate-selection auto-clear,
  - armor disables second slot,
  - infantry keeps second slot enabled,
  - debark button state transitions.
- Service tests for capacity and single-assignment invariants.

Dependencies: Phase B.

---

### Phase D — Terrain-context interaction gating

Work:

1. Implement control-state gating based on hex context:
   - water: dropdowns disabled + debark disabled,
   - coastal no-port: dropdowns disabled + debark enabled for assigned slots,
   - coastal valid-port: normal behavior.
2. Ensure gating is derived from authoritative terrain/feature state after startup sanitization.

Verification:

- UI tests for each terrain context.
- Manual checks for disabled/enabled combinations and button behavior.

Dependencies: Phase C.

---

### Phase E — Immediate apply and popup close guarantee

Work:

1. Implement immediate apply strategy for each dropdown/debark interaction.
2. Guarantee milestone contract: no later than popup close, persisted state still matches latest user-visible assignment state.
3. Add close-handler guardrails for cancellation/error handling with clear logging and no stale UI state.

Verification:

- Integration tests:
  - changed assignment persists on close,
  - no stale state after close/re-open,
  - error path logs and preserves consistency.

Dependencies: Phase C-D.

---

### Phase F — Movement and combat behavior for embarked units

Work:

1. Enforce movement restriction on water: embarked land cannot receive independent movement.
2. Enforce combat restrictions:
   - embarked cannot do ranged/return fire on any hex type,
   - on water, embarked cannot melee,
   - on coastal, embarked can fight normally.
3. Preserve defensive bonus handling for embarked units.
4. Implement auto-debark when coastal independent movement order would separate land from assigned naval; independent movement then executes.

Verification:

- Resolution tests for:
  - no independent water movement while embarked,
  - coastal melee participation,
  - water melee exclusion,
  - ranged/return fire exclusion while embarked,
  - auto-debark before coastal movement.

Dependencies: Phase E.

---

### Phase G — Transport-loss resolution rules

Work:

1. On naval casualty, apply cargo loss outcome by hex type:
   - water => destroy assigned land units,
   - coastal => clear assignment and keep units in hex.
2. Ensure this applies consistently regardless of casualty phase source (air strike, ranged, melee).

Verification:

- Combat-resolution integration tests for each phase/terrain combination.
- Determinism check with fixed seed where relevant.

Dependencies: Phase F.

---

### Phase H — AI prompt, order support, and parser/validator updates

Work:

1. Update AI briefing sections to include:
   - available naval capacity,
   - cargo assignments,
   - embark opportunities at valid ports,
   - transport risk context.
2. Ensure order parsing/validation supports:
   - `embark`,
   - `transport_move`,
   - `disembark`.
3. Add prompt guidance encouraging proactive multi-turn sealift planning when water crossing is required.

Verification:

- Schema/validator tests for valid and invalid sealift orders.
- Briefing contract tests for required sealift fields.

Dependencies: Phase G.

---

### Phase I — Initialization/new-game invalid-port sanitization

Work:

1. During initialization/new-game database build paths, detect `res1` hexes with ports and `<1` open water side.
2. Remove ports from:
   - `res1` feature list,
   - all child `res4` features under that `res1`.
3. Ensure downstream consumers treat sanitized hexes as non-port for:
   - naval production eligibility,
   - embark eligibility.

Verification:

- Data-pipeline tests for before/after feature state in initialized databases.
- Production/embark eligibility tests prove sanitized hex is treated as no-port.

Dependencies: Phase A (can run parallel to B-H if ownership is separated).

---

### Phase J — End-to-end hardening and regression sweep

Work:

1. Run acceptance matrix for all 16 milestone requirements.
2. Verify no regressions in existing stack popup, multi-select, movement preview, and turn resolution.
3. Verify logging/orienting comments/test scope compliance.

Verification:

- Targeted test suite + lint clean.
- Manual checklist pass.

Dependencies: Phases A-I.

---

## 6. Suggested test matrix (happy paths + essential failures)

1. **Happy:** Mixed coastal+port stack shows sealift section; homogenous stacks do not.
2. **Happy:** Per-naval row has two dropdowns + debark buttons with proper defaults.
3. **Happy:** Selecting land unit embarks and clears duplicates globally.
4. **Happy:** Armor selection disables second slot; infantry keeps it enabled.
5. **Happy:** Debark button resets to `(none)` and debarks.
6. **Happy:** Coastal no-port allows debark-only; no re-embark.
7. **Happy:** Water disables dropdowns and debark controls.
8. **Happy:** Assignment changes apply immediately and remain correct after popup close/re-open.
9. **Happy:** Embarked units move with naval on water and cannot receive independent movement.
10. **Happy:** Embarked units on coastal can fight and move; when separating movement is ordered, auto-debark occurs first.
11. **Happy:** Naval loss on water destroys cargo.
12. **Happy:** Naval loss on coastal auto-debarks cargo.
13. **Happy:** Startup sanitization removes invalid ports from `res1` and child `res4`.
14. **Essential failure:** Attempt to assign same land unit to two navals results in one authoritative assignment only.
15. **Essential failure:** Capacity-violating assignments are rejected and logged.
16. **Essential failure:** Invalid AI sealift order payload is rejected safely and logged.

Avoid tests for direct delegation wrappers, DTO accessors/constructors, and styling internals.

---

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| UI assignment state diverges from backend truth | High | Backend authoritative apply/validate path + integration tests on immediate apply and popup close persistence. |
| Duplicate-slot race conditions produce invalid cargo | High | Single reconciliation helper and serialized update flow. |
| Embarked combat rule regressions in existing phases | High | Phase-specific resolution tests (air/ranged/melee) before merge. |
| Terrain gating edge cases (coastal no-port vs water) | Medium | Dedicated context selector tests and manual scenario checks. |
| Invalid-port cleanup breaks map assumptions | Medium | Initialization/new-game sanitization tests + explicit production/embark eligibility regression checks. |
| AI order schema drift from gameplay rules | Medium | Parser/validator contract tests and briefing field assertions. |
| Excessive logging noise | Low | Structured concise logs and avoid large payload dumps. |

---

## 8. Acceptance checklist

- [ ] Sealift section appears for mixed land+naval stacks and remains visible when embarked units are present.
- [ ] Section remains hidden for homogenous land-only or naval-only stacks.
- [ ] Each naval row has two dropdowns and matching debark buttons.
- [ ] Dropdown options are `(none)` plus stack land units.
- [ ] Debark button enable/disable behavior matches selection state.
- [ ] Selecting a land unit clears it from all other dropdowns.
- [ ] De-selection by any route debarks the land unit.
- [ ] Armor in slot 1 disables and clears slot 2 for same naval.
- [ ] Infantry/none keeps or re-enables slot 2.
- [ ] Embark/debark changes apply immediately and remain persisted by popup close.
- [ ] Water mixed stacks: dropdowns + debark disabled.
- [ ] Coastal without port: dropdowns disabled, debark enabled for assigned slots.
- [ ] Embarked units move with naval, cannot independently move on water.
- [ ] Embarked units cannot ranged attack or return fire while embarked.
- [ ] Water-hex embarked units do not melee; coastal embarked units fight normally.
- [ ] Coastal independent movement order auto-debarks embarked land unit before move, and movement executes.
- [ ] Naval destroyed on water destroys assigned cargo.
- [ ] Naval destroyed on coastal auto-debarks assigned cargo.
- [ ] AI briefing/orders support embark/disembark/transport operations.
- [ ] Initialization/new-game sanitization removes invalid ports at `res1` and child `res4`.
- [ ] New/updated public backend methods include orienting comments + required logs.

---

## 9. Resolved clarification decisions

1. **Apply timing:** Immediate apply on each interaction.
2. **Section visibility:** Show section when embarked units are present (including disabled/debark-only contexts).
3. **Symbology scope:** Behavior only in this milestone; symbology updates are deferred.
4. **Debark destination:** Debarked units remain in current hex until separately ordered.
5. **Order conflict policy:** Auto-debark + independent move wins when both are present.
6. **Sanitization timing:** Hard-cutover sanitation in initialization/new-game database build paths; no existing DB migration.
7. **AI guidance style:** Use strong doctrine encouraging sealift when water crossing is required.

---

*End of plan.*
