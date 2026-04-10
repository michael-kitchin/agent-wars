# Prompt Updates Execution Plan

Execution plan for implementing prompt and scenario-seeding updates focused on clearer hex-centric decision input, reduced prompt overhead, stronger JSON conformance, and deterministic starting-unit behavior. The plan is phased for reliability and independent verification.

---

## 1. Goal and success criteria

### 1.1 Goal

Implement the following capability updates:

1. Reorganize `Possible unit actions` into three mutually constrained hex buckets and render each bucket as a markdown table.
2. Streamline system-prompt preamble text while preserving correctness-critical constraints.
3. Replace naval transport doctrine-heavy wording with compact, actionable state.
4. Add a concrete final-JSON order example (2-3 units) to improve model conformance.
5. Seed one initial air unit per side in home region when possible, with deterministic fallback sequence and cap/terrain validation.

### 1.2 Binary success criteria

1. Every `Possible unit actions` action group uses these bucket headers only:
   - `Enemy homeland hexes`
   - `Hexes nearest to enemy homeland`
   - `Other hexes`
2. `Enemy homeland hexes` and `Hexes nearest to enemy homeland` remain mutually exclusive per action group.
3. Bucket contents are rendered as markdown tables using this schema:
   `| Unit | Action | Hex | Distance | Enemy Units | Hex Features |`.
4. Prompt preamble remains semantically correct (coordinates, anti-invention guardrails, combat constraints) with materially fewer tokens.
5. Sealift/naval section emphasizes immediate actionability (unit, capacity, embark/disembark state) over doctrine narration.
6. Final JSON contract section includes at least one concrete multi-unit valid example aligned with parser/validator behavior.
7. Initial default/global and scenario seeding attempts one air unit per player in home-region airport hexes; if unavailable, fallback is attempted in order `armor -> infantry -> naval`, each with terrain/cap checks.
8. No fallback unit is added when all fallback options are invalid under terrain/cap constraints.
9. Updated tests cover happy paths and essential failure contracts only.

---

## 2. Scope

### 2.1 In scope

- Prompt assembly and system instructions:
  - `src/main/openrouter/openRouter.ts`
  - `src/main/openrouter/promptText.ts`
  - `src/main/openrouter/promptContracts.ts`
  - `src/main/openrouter/briefingSections.ts`
- Possible-actions rendering:
  - `src/main/openrouter/possibleUnitActions.ts`
  - `src/main/openrouter/possibleUnitActions.test.ts`
- Region scenario unit seeding:
  - `src/main/game-db/seeding/regionScenarioSeeding.ts`
  - `src/main/game-db/seeding/seedUnits.ts`
- Prompt/system tests:
  - `src/main/openrouter/openRouter.matrix.test.ts`
  - `src/main/briefingFormatter.test.ts`
  - plus targeted seeding tests where needed.

### 2.2 Out of scope

- Combat resolution rule changes.
- Pathfinding algorithm changes.
- UI redesign beyond reflected prompt output.

---

## 3. Reliability and maintainability principles

1. Keep classification and rendering logic separate (derivation helpers vs formatting).
2. Preserve deterministic ordering to stabilize model behavior and snapshots.
3. Keep prompt text concise but explicit where parser correctness depends on wording.
4. Reuse existing source-of-truth validators instead of introducing parallel rule paths.
5. Keep tests contract-focused (happy + essential failure only).
6. For any new/updated public backend methods:
   - add orienting comments,
   - include required logging levels (debug for public invocations, trace for getter-like methods, error for caught exceptions).

---

## 4. Phased implementation plan

### Phase A - Contract lock and baseline capture

Work:

1. Capture baseline prompt fixtures for representative states:
   - mixed unit roster with legal actions,
   - no visible enemy units,
   - region-vs-region with home-region metadata.
2. Lock current homeland/nearest mutual-exclusion behavior in tests before formatting changes.
3. Define row-level typed shape for the table renderer (unit id/type, action, target hex, distance, enemy summary, feature summary).

Verification:

- New/updated tests pass without changing external behavior yet.
- Baseline fixtures available for before/after prompt-size and structure comparison.

Dependencies: none.

---

### Phase B - Hex-bucket table rendering for possible actions

Work:

1. Refactor `possibleUnitActions` output from nested bullets to three primary subsection buckets:
   - `Enemy homeland hexes`
   - `Hexes nearest to enemy homeland`
   - `Other hexes`
2. Within each subsection, render markdown table rows that can mix action types (`Moves/Melee attacks`, `Ranged attacks`, `Air strikes`) as applicable.
3. Preserve bucket exclusivity rules:
   - if homeland entries exist, nearest bucket is empty,
   - otherwise nearest bucket contains all tied minimum-distance targets.
4. Populate table columns:
   - `Unit`: unit id (and optionally type if needed for clarity),
   - `Action`: existing phrasing label (`Moves/Melee attacks`, `Ranged attacks`, `Air strikes`),
   - `Hex`: `[lat, lng]`,
   - `Distance`: hex distance from unit to target,
   - `Enemy Units`: compact count-by-type summary, else `none`,
   - `Hex Features`: compact urban/seaport/airport summary, else `none`.
5. Keep deterministic row sorting by stable geo ordering with fallback tie-breakers.
6. Suppress empty subsections entirely.

Verification:

- Snapshot tests confirm section and table shape.
- Contract tests confirm exclusivity, bucket suppression, and distance correctness.
- No hidden-info leakage relative to current visibility assumptions.

Dependencies: Phase A.

---

### Phase C - Streamline preamble and guardrail wording

Work:

1. Reduce token-heavy re-explanations in coordinate/combat guardrails while preserving constraints:
   - coordinate format and precision,
   - no invented coordinates,
   - start-position attack legality.
2. Consolidate repetitive policy lines into compact single-pass instruction blocks.
3. Validate that shortened wording remains parser-safe for `parseOrdersResponse` and downstream validators.

Verification:

- Prompt-length delta measured against Phase A baseline.
- Matrix tests pass for parsing/repair flow and legal order extraction.
- No regression in key guardrail semantics.

Dependencies: Phase A (can overlap with Phase B after contracts are stable).

---

### Phase D - Convert sealift doctrine to actionable state

Work:

1. Replace doctrine-style prose in naval transport guidance with decision-ready rows.
2. Ensure each naval row includes immediately actionable data, e.g.:
   - naval unit id and position,
   - current transport capacity representation,
   - nearby embark-capable land units,
   - nearest embark/disembark-relevant hexes where derivable at low cost.
3. Remove long-form "design philosophy" narration from tool guidance and briefing text.

Verification:

- Prompt section remains concise and includes fields required for concrete embark/transport/disembark decisions.
- Existing sealift order validation and generation tests remain green.

Dependencies: Phase A.

---

### Phase E - Add concrete final JSON example

Work:

1. Extend final JSON contract instruction with one compact, valid, concrete example containing 2-3 unit orders.
2. Ensure example includes realistic combinations (for example: `assign_order`, `explicit_move`, optional `ranged_attack`).
3. Keep example synchronized with accepted schema and parser behavior (no legacy top-level arrays/fields).
4. Render this as a distinct `Example` block immediately below the submit contract text, generated by a dedicated accessor method to keep wording centralized and testable.

Verification:

- Contract tests assert example presence and schema alignment.
- `parseOrdersResponse` accepts equivalent payload shape.

Dependencies: Phase C recommended.

---

### Phase F - Scenario seeding update for initial air unit with fallback

Work:

1. Update both default/global and region-vs-region seeding side-plan logic to attempt one initial `air` unit per side:
   - preferred spawn: home-region hex with airport and valid spawn terrain/control assumptions.
2. When no eligible airport hex exists in that home region, attempt fallback in this exact order:
   - `armor`, then `infantry`, then `naval`.
3. For each fallback attempt, validate:
   - terrain compatibility for unit type,
   - per-type cap (`MAX_UNITS_PER_TYPE`) not exceeded.
4. Fallback is substitutive for the intended air slot (not additive); when all fallback options fail, omit the slot.
5. Treat home-region control as an invariant (all home-region hexes controlled by the owning player). Add defensive verification/logging so unexpected state mismatch is observable without blocking seeding.
6. Preserve deterministic placement and existing substitution/cap enforcement behavior for other baseline units.

Verification:

- New tests cover:
  - airport-present -> air seeded,
  - no-airport -> first valid fallback selected by order,
  - all fallback invalid -> no extra unit,
  - cap-constrained scenarios.
- Existing seeding/reset tests remain green.

Dependencies: Phase A.

---

### Phase G - Regression hardening and quality gates

Work:

1. Run focused tests for prompt, parsing, briefing, and seeding modules touched above.
2. Run lint checks for edited files and fix introduced diagnostics.
3. Review all updated public backend methods for orienting comments and required logging-level rules.
4. Perform final pass for readability and maintainability (helper extraction where sections become dense).

Verification:

- Test suites pass for touched modules.
- No newly introduced lint issues in edited files.
- Prompt outputs remain deterministic and understandable.

Dependencies: Phases B-F.

---

## 5. Test matrix (minimal and sufficient)

1. **Possible actions tables**: mixed roster renders expected columns and non-empty bucket tables only.
2. **Bucket exclusivity**: homeland and nearest never co-exist for the same action bucket.
3. **Distance values**: table `Distance` matches computed grid distance for each row.
4. **Preamble compression**: key constraints still present after streamlining.
5. **Naval actionable state**: section reports transport-relevant operational facts, not doctrine-heavy prose.
6. **JSON example conformance**: included example matches accepted schema and parser behavior.
7. **Air seeding happy path**: one initial air per player when airport exists in each home region.
8. **Air seeding fallback**: no-airport path uses armor -> infantry -> naval priority with cap/terrain checks.
9. **Fallback exhausted**: no additional unit when all fallback choices are invalid.

---

## 6. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Table formatting increases prompt size unexpectedly | Medium | Measure before/after token footprint; suppress empty buckets and compact row text. |
| Streamlining removes critical safety constraints | High | Lock key guardrails with semantic assertions in prompt tests before edits. |
| JSON example drifts from parser contract | High | Keep example generated/validated against current `parseOrdersResponse` contract tests. |
| Seeding changes unintentionally alter baseline force balance | High | Gate behavior to explicitly scoped extra-unit rule and add deterministic scenario tests. |
| Fallback order/cap handling ambiguity | Medium | Encode ordered fallback helper with explicit tests for tie/invalid/cap cases. |

---

## 7. Confirmed implementation decisions

1. **Action labels**: keep existing phrasing (`Moves/Melee attacks`, `Ranged attacks`, `Air strikes`).
2. **Distance semantics**: `Distance` remains unit-to-target hex distance; current-hex rows remain excluded unless explicitly reintroduced later.
3. **Empty-cell wording**: use `none` for absent `Enemy Units` and `Hex Features` values to maximize model readability.
4. **JSON example placement**: provide a distinct `Example` block below the contract text via an accessor method.
5. **Initial-air scope**: apply the one-air-slot rule to default/global and scenario seeding paths.
6. **Home-region control assumption**: treat all home-region hexes as controlled by the owning side; add defensive verification logging in case this invariant is violated by future changes.
7. **Fallback semantics**: fallback unit type replaces the intended air slot and follows strict preference order with terrain/cap checks.
8. **Default/global home-region definition**: use existing deterministic spawn regions (human-start region and opponent-start region) as each side's home region for airport eligibility.

---

## 8. Implementation checklist

- [ ] Baseline fixtures and contract tests added.
- [ ] Possible-actions table renderer implemented with exclusivity/suppression rules.
- [ ] Prompt preamble streamlined without correctness regressions.
- [ ] Naval transport section converted to actionable state.
- [ ] Final JSON concrete example added and validated.
- [ ] Region and default/global seeding updated for initial air slot + fallback chain.
- [ ] Focused tests and lints pass for touched files.
- [ ] Logging/orienting-comment compliance confirmed on updated public backend methods.

---

End of plan.
