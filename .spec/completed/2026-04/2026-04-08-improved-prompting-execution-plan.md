# Improved Prompting Execution Plan

Execution plan for implementing stronger, more actionable LLM briefings with a new `Possible unit actions` section and clearer scenario-goal context. This plan is organized into independently verifiable phases and emphasizes reliability, maintainability, and parity with human-visible information.

---

## 1. Goal and success criteria

### 1.1 Goal

Implement prompt and briefing updates so the coding agent can reliably:

1. Add a new per-friendly-unit `Possible unit actions` section with the requested grouping/formatting rules.
2. Suppress non-applicable and empty lines/sections.
3. Enforce the `Enemy homeland hexes` vs `Hexes nearest to enemy homeland` mutual-exclusion rule.
4. Replace overlapping precomputation-derived information with this new section while preserving any unique useful context.
5. Make scenario objective clarity explicit (`destroy all enemy units or urban hexes`) and provide enough information for goal achievement without giving the AI information unavailable to a human player.
6. Route objective text through a scenario-goals helper so prompt substitution can evolve safely by scenario later.

### 1.2 Binary success criteria

1. Prompt includes `Possible unit actions` with one block per AI-owned unit id and unit type.
2. Per unit, only applicable action groups appear (`Moves`, `Air strikes`, `Ranged attacks`).
3. Empty parent/child sections are suppressed.
4. Within each action group, `Enemy homeland hexes` and `Hexes nearest to enemy homeland` are never both present.
5. Existing redundant precomputation text is removed or replaced.
6. Non-redundant useful precomputation details remain represented in the new section in consistent style.
7. Scenario objective text is explicit and internally consistent with win conditions.
8. Prompt content does not leak hidden information beyond human visibility rules.
9. Tests cover happy paths plus essential failure contracts only.
10. Scenario objective text is supplied via a dedicated helper function (single substitution point in prompt assembly).

---

## 2. Scope

### 2.1 In scope

- Prompt assembly in `src/main/openrouter/openRouter.ts`.
- Briefing block composition in `src/main/briefingFormatter.ts` and `src/main/openrouter/briefingSections.ts` as needed.
- Precomputation integration contracts from `src/main/precomputation.ts` (reuse and/or extend, no duplicated tactical logic).
- Supporting prompt helpers in `src/main/openrouter/promptText.ts`.
- Prompt contract tests in `src/main/briefingFormatter.test.ts`, `src/main/precomputation.test.ts`, and `src/main/openrouter/openRouter.matrix.test.ts`.
- Scenario-goal substitution helper (single function used by prompt builder; returns current scenario goal text only).

### 2.2 Out of scope

- Combat rules changes.
- Fog-of-war mechanics changes (except presentation/filtering guarantees in prompt output).
- UI redesign unrelated to prompt text.

---

## 3. Target output contract for new section

### 3.1 Canonical shape (logical)

For each friendly unit:

- `FU<n> (<type>)`
  - `Moves` (optional)
    - `Enemy homeland hexes` (optional)
    - `Hexes nearest to enemy homeland` (optional, mutually exclusive with previous)
    - `Other hexes` (optional)
  - `Air strikes` (optional)
    - same 3 child buckets and exclusivity rule
  - `Ranged attacks` (optional)
    - same 3 child buckets and exclusivity rule

Each target hex line should include:

- hex coordinate (`H#` actual coordinate string in implementation),
- target composition summary (`N type` counts),
- where relevant, infrastructure counts (`urban`, `seaports`, `airports`).

### 3.2 Required suppression rules

1. Omit action categories that cannot apply to the unit type.
2. Omit categories with no legal options.
3. Omit sub-buckets with zero entries.
4. In one action category, show either:
   - `Enemy homeland hexes`, or
   - `Hexes nearest to enemy homeland`,
   but never both.
5. `Enemy homeland hexes` means scenario-defined enemy home-region hexes only.
6. `Ranged attacks` and `Air strikes` include only targets legally executable this turn from current unit position.
7. Unit composition summaries include currently observed enemy units only.
8. Instructions/objective context must mention both region names when scenario data is available:
   - AI (LLM) homeland region name,
   - human player homeland region name.
9. If either homeland region name is unavailable, omit that specific line (do not emit placeholder text like `unknown`).

### 3.3 Data-parity rule (human-equivalent info)

Only include targets/composition/infrastructure that are visible/known under the same constraints as human player information. This section uses currently observed enemy-unit composition only.

### 3.4 Nearest-to-homeland selection rule

For a given action category where no legal enemy-home-region targets exist:

1. Compute shortest hex distance from each legal target hex to the scenario-defined enemy home-region set.
2. Select all legal target hexes tied at the minimum distance.
3. Emit those hexes under `Hexes nearest to enemy homeland`.

---

## 4. Reliability and maintainability principles

1. Centralize action-option derivation in reusable pure helpers (avoid duplicated logic across formatter and prompt builder).
2. Keep existing source-of-truth systems (`GameStateSnapshot`, tool executors, visibility/discovery state) authoritative.
3. Prefer composable typed mappers:
   - raw tactical candidates -> classified buckets -> formatted prompt lines.
4. Keep prompt formatting deterministic and stable for testability.
5. Preserve concise, readable output (bounded verbosity for large maps).
6. Ensure all newly added or updated public backend methods include orienting comments and required logging levels per project rules.

---

## 5. Phased implementation plan

### Phase A - Contract lock and baseline fixtures

Work:

1. Define a typed internal contract for `Possible unit actions` rows and buckets.
2. Lock suppression/exclusivity rules in tests before major text changes.
3. Capture baseline prompt fixtures for:
   - no enemy visible,
   - mixed unit roster,
   - region-vs-region homeland context.

Verification:

- New tests pass for data-shape/suppression contracts without requiring full final formatting.
- No runtime behavior changes yet.

Dependencies: none.

---

### Phase B - Tactical option derivation helpers

Work:

1. Build/extend pure helpers that derive per-unit legal options:
   - move destinations,
   - ranged attacks,
   - air strikes.
2. Add classification helpers for target buckets:
   - enemy homeland,
   - nearest-to-homeland (only when enemy homeland set is unavailable for that action),
   - other.
   - tie handling: include all hexes at the same minimum nearest distance.
3. Add aggregation helpers for per-hex summaries:
   - enemy unit counts by type,
   - urban/seaport/airport counts.
4. Ensure helper inputs are constrained to human-equivalent visibility (currently observed enemy-unit composition only).

Verification:

- Helper tests cover happy paths and essential edge/failure cases (empty sets, invalid/missing data).
- Deterministic ordering validated (stable output across runs).

Dependencies: Phase A.

---

### Phase C - New briefing section assembly

Work:

1. Integrate helper outputs into briefing/prompt assembly with final markdown-like structure.
2. Enforce suppression and exclusivity rules in formatter layer.
3. Replace duplicate legacy precomputation lines that are superseded by this section.
4. Preserve any unique prior context by re-homing it into this section style.

Verification:

- Snapshot/string tests confirm exact section presence and omission behavior.
- Existing unrelated briefing sections remain unchanged.

Dependencies: Phase B.

---

### Phase D - Scenario objective clarity and fairness pass

Work:

1. Add a scenario-goals helper that returns objective text for prompt substitution (single invocation point in prompt assembly).
2. For now, helper returns current objective text (`destroy all enemy units or urban hexes`) in prompt-ready form.
3. Update strategic/objective text wiring to consume helper output and keep it scenario-ready for future variants.
4. Keep objective wording flexible (tests/assertions validate semantics, not exact string literal).
5. Ensure objective/instructions mention both homeland region names (AI and human) when available.
6. Confirm objective text is aligned with real game adjudication logic.
7. Validate that prompt context remains no better than what a human can infer from visible game state.
8. Add explicit wording for uncertainty where data may be stale or out of sight.

Verification:

- Objective lines present in generated prompt(s) for relevant scenarios.
- Essential parity tests/assertions prevent hidden-information leakage.

Dependencies: Phase C (can partially proceed in parallel after Phase A contracts are defined).

---

### Phase E - Regression hardening and quality gates

Work:

1. Run focused test suites for touched prompt/precomputation modules.
2. Add/update only essential tests (happy paths + critical failure contracts).
3. Run lint checks on touched files and fix introduced issues.
4. Review logs/comments for updated public backend methods against project standards:
   - public backend method invocations: debug-level logs,
   - getter-style methods: trace-level logs,
   - caught exceptions: error-level logs.
5. Verify orienting comments are present and correctly formatted on all new/updated public, non-overriding backend methods.

Verification:

- Touched tests/lint green.
- No prompt regressions in unrelated sections.

Dependencies: Phases C and D.

---

## 6. Test matrix (minimal but sufficient)

1. Happy: mixed roster renders per-unit action blocks with correct action applicability.
2. Happy: empty action category suppressed per unit.
3. Happy: empty target sub-bucket suppressed.
4. Happy: homeland vs nearest-to-homeland exclusivity enforced.
5. Happy: redundant legacy precomputation text removed when replaced.
6. Happy: unique prior info retained in new section style.
7. Happy: scenario objective text includes destruction condition clearly.
8. Essential failure: missing homeland metadata degrades gracefully with deterministic fallback buckets.
9. Essential failure: visibility-restricted state does not expose hidden enemy positions/composition.

---

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Prompt bloat reduces model focus | High | Keep compact wording and strict suppression of non-applicable/empty lines; keep deterministic ordering so dense sections remain scannable. |
| Duplicate or conflicting tactical info remains | Medium | Single-source formatter for `Possible unit actions`; remove superseded legacy lines in same PR. |
| Hidden-info leakage through precomputation merge | High | Explicit visibility-gated helper inputs + regression tests that compare visible-only fixtures. |
| Ambiguous homeland/nearest classification | Medium | Central classifier with strict precedence and unit tests for tie/empty cases. |
| Future maintainability drift | Medium | Extract typed helpers and keep formatting separated from derivation logic. |

---

## 8. Implementation checklist

- [ ] Add typed contracts for action-section derivation.
- [ ] Implement/extend per-unit action derivation helpers.
- [ ] Implement target-bucket classifier with exclusivity rule.
- [ ] Implement per-hex summary formatter for units/infrastructure.
- [ ] Integrate new section into briefing assembly.
- [ ] Remove or replace superseded precomputation briefing lines.
- [ ] Preserve unique prior tactical context in new style.
- [ ] Update scenario objective text for clarity/consistency.
- [ ] Add/adjust focused tests.
- [ ] Run lint/tests and resolve issues.
- [ ] Verify logging-level compliance on all new/updated public backend methods (debug/trace/error rules).
- [ ] Verify orienting-comment compliance on all new/updated public, non-overriding backend methods.

---

## 9. Confirmed implementation decisions

1. Add a scenario-goals helper and use it as the single prompt substitution source for objective text.
2. Objective wording is flexible as long as semantic meaning is preserved.
3. Prompt instructions should mention both homeland region names (AI and human) when available; omit unavailable-name lines.
4. Enemy homeland semantics are scenario-defined home-region hexes.
5. Nearest-to-homeland uses a practical minimum-distance rule; include all ties at that minimum distance.
6. Unit composition summaries use currently observed enemy units only.
7. Air-strike and ranged-attack options are limited to actions legally executable this turn from current unit position.
8. Do not add explicit truncation limits.
9. Additional non-duplicative precomputation detail should be placed where it fits best:
   - action/hex-specific detail under corresponding hex lines inside action groups,
   - non-action-specific detail in adjacent sections using similar style.

---

End of plan.
