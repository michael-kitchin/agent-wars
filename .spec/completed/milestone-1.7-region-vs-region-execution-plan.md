# Milestone 1.7 — Region-vs-Region Scenario Execution Plan

*Execution plan for coding-agent implementation of milestone 1.7 (scenario slice: region-vs-region), designed for phased reliability, independent verification, and maintainable code.*

---

## 1. Goal, scope, and success criteria

### 1.1 Goal

Implement a reliable region-vs-region scenario flow where human and AI each select a home region at new game time, start units in hexes intersecting those regions, pursue a clear scenario-specific victory condition, and always see both home-region boundaries on the map regardless of fog or visibility state.

### 1.2 In scope for this plan

1. New game overlay controls for region selection:
   - left: `Human Player:`
   - right: `AI Player:`
   - each with a randomize button.
2. Region option source: sorted unique region names from `data/generated/terrain_res1_naming.json`.
3. Default selections: random value per dropdown on overlay open/reset.
4. New-game payload + backend reset/seed path to persist selected regions.
5. Spawn seeding best-effort constrained to selected home regions with deterministic substitution rules.
6. Scenario win condition:
   - control all hexes intersecting opponent home region **or**
   - eliminate all urban production (res4 urban hexes aggregated across that opponent home region), while your own home region still has at least one urban cell — strategic elimination of all enemy units alone is **not** a victory condition (units can be rebuilt while home hexes remain).
7. Persistent dual home-region map outlines:
   - always visible, independent of fog and control.
   - outline individual region hexes using player-color primary stroke with fine black edging for contrast.
   - when both players choose the same region, use the existing mixed human/AI stack gray for both region outlines.
8. LLM prompt/briefing updates describing goals and both home regions.

### 1.3 Out of scope

1. Additional scenario types beyond region-vs-region.
2. Broader scenario-selection UX redesign.
3. Rebalancing unit stats or baseline economy rules (unless required by this scenario contract).

### 1.4 Success criteria (binary)

1. New game overlay renders both region dropdowns above fog toggle with exact labels.
2. Dropdown options are the sorted unique region-name set from res1 naming data.
3. Each dropdown has a randomize button that picks a valid random option for that side.
4. Overlay defaults each side to a random valid region on open/reset.
5. New-game action passes selected regions through IPC and persists scenario state for the match.
6. Human and AI initial unit placement is best-effort constrained to hexes intersecting their selected regions, with deterministic substitution when placement is impossible:
   - no-water case: replace each unplaceable naval unit with `+1 armor` and `+1 infantry`,
   - no-land case: replace unplaceable land units with an equal count of naval units.
   - enforce unit caps during substitution; drop excess units deterministically (infantry is lowest priority / first dropped among land units).
7. Scenario permits overlapping/adjacent starts (same region or neighboring regions) without failure.
8. Match win objective is evaluated once at end of turn; winner is the side that fully controls the opponent home region (all intersecting res1 hexes), or that has eliminated all enemy-home urban production while their own home still has urban capacity — not “last standing units.”
9. Home-region outlines for both sides remain visible regardless of fog setting and hex visibility/control state.
10. Outline styling remains legible on all terrain through black edging and player-color core stroke, with mixed-region gray fallback when both sides choose the same region.
11. AI briefing/prompt explicitly states scenario objective and identifies both home regions.
12. New/updated public backend methods include orienting comments and required logs.
13. Tests cover happy paths and essential failures only; lint and tests pass.

---

## 2. Reliability and maintainability constraints

1. Keep region-selection source of truth in backend/shared contracts; renderer should not derive canonical region lists from ad-hoc parsing.
2. Introduce explicit scenario config structures (typed) instead of loose string fields.
3. Keep spawn selection deterministic after random region picks are finalized (seed-aware where existing randomness rules apply).
4. Respect logging contract:
   - debug for public backend mutators,
   - trace for public backend getters/query methods,
   - error for caught exceptions.
5. Add orienting comments on all new/updated public non-overriding backend methods.
6. Prefer small helpers for region indexing, per-hex outline generation, unit substitution, and win-condition checks.
7. Maintain existing renderer/main separation via shared IPC types.
8. Keep new/updated source files under the preferred 600-line size where practical (hard cap 1000), decomposing into focused modules as needed.
9. Keep public method argument lists within preferred limits by introducing parameter objects where clarity/reuse improves reliability.
10. Enforce cap-aware substitution with deterministic drop ordering and explicit logging of all dropped units/reasons.

---

## 3. Proposed architecture changes

### 3.1 Data contracts

1. Extend shared new-game payload with scenario region fields:
   - `humanHomeRegion`
   - `aiHomeRegion`
2. Add typed scenario state representation retrievable from backend snapshot path as needed by renderer and AI briefing.
3. Add a backend accessor for available home regions (trace-logged), built from res1 naming data once and cached.

### 3.2 Region index + outline derivation

1. Build a region index from res1 naming envelope:
   - map `regionName -> Set<res1 h3 index>` where hex intersects region via country rows.
2. Derive per-region renderable outlines by drawing selected-region hex borders directly (no contiguous/disjoint polygon special-casing).
3. Keep outline derivation deterministic and cacheable across match resets.

### 3.3 Spawn and objective integration

1. Replace hard-coded geographic-stage region spawning in scenario mode with selected-region constrained candidate pools.
2. Implement best-effort placement substitutions:
   - each unplaceable naval unit -> `+1 armor` and `+1 infantry`,
   - unplaceable land units -> equal-count naval substitutions.
3. Restrict land placement candidates to standard passable land terrain kinds:
   - `plains`, `mountains`, `wetlands`, `coastal`, `desert`, `forest`.
4. Enforce per-type unit caps during substitution and drop overflow deterministically (land overflow priority: infantry dropped before armor).
5. Apply substitutions in stable unit-id order for reproducible outcomes.
6. Keep substitutions deterministic, side-local, and clearly logged.
7. Add scenario-aware win evaluator:
   - opponent-home-region-total-control path (evaluated at end of turn only),
   - opponent-home-region urban elimination path (sum of `urbanHexCount` over opponent home res1 hexes is zero while friendly home sum remains positive; mutual zero urban yields no urban-only winner until control resolves).
8. Ensure control criterion uses region hex set intersection, not current visibility.

### 3.4 Renderer integration

1. Extend new game overlay HTML/CSS for dual region selectors and randomize buttons.
2. Populate options from backend-provided canonical region list.
3. Draw two always-visible map overlays for home-region hex outlines with layered stroke style:
   - black outer/fine edge
   - player-color main stroke.
4. If both players select the same region, use the existing mixed human/AI stack gray for both outlines.
5. Reuse the exact existing mixed-stack gray color token/constant (no new gray variant).

### 3.5 AI briefing and prompt integration

1. Add scenario section in AI prompt context describing:
   - own home region,
   - enemy home region,
   - dual victory condition.
2. Ensure region goals are included in both initial and event-driven consultations.

---

## 4. Phased execution plan (independently verifiable)

### Phase A — Contract lock and region-source plumbing

Work:

1. Define/extend shared IPC and backend scenario payload types.
2. Add backend method to return sorted unique region names from res1 naming data.
3. Add tests for region-list extraction and sorting behavior.
4. Add orienting comments and required logs.

Verification:

- Typecheck passes.
- Unit tests prove region list is non-empty, sorted, and stable.
- Manual call path from renderer can fetch list without starting a game.

Dependencies: none.

---

### Phase B — New game overlay controls and payload wiring

Work:

1. Update overlay markup/style with side-by-side region selectors above fog checkbox.
2. Add randomize buttons for both selectors.
3. On overlay open/reset, assign random defaults for each selector.
4. Wire selection values into `game:newGame` payload.

Verification:

- UI behavior test/manual checks:
  - controls render in correct order,
  - randomize updates only related selector,
  - defaults randomize on each overlay open/reset.
- IPC payload test validates selected values are transmitted.

Dependencies: Phase A.

---

### Phase C — Backend new-game persistence and scenario state

Work:

1. Extend main-process new-game handler and reset flow to accept/persist selected regions.
2. Validate incoming region names against canonical set with safe fallback/error strategy.
3. Add scenario-state storage/read path for use by seeding, win checks, and AI briefings.

Verification:

- Integration tests for valid/invalid region payloads.
- New game reset persists selected regions and survives immediate state read.

Dependencies: Phase B.

---

### Phase D — Region-constrained spawn seeding

Work:

1. Build spawn candidate pools from selected home-region hex sets.
2. Seed both sides using best-effort in-region placement for all unit types.
3. Apply deterministic substitution rules for unplaceable units (`naval -> armor+infantry`, `land -> naval`).
4. Handle overlap and adjacency without invariant breaks (same-region and overlapping spawns allowed).

Verification:

- Happy-path tests: placeable units for both sides start in selected regions.
- Happy-path tests: substitution rules activate correctly when in-region terrain type is unavailable.
- Happy-path tests: substitution application order is deterministic by unit id.
- Happy-path tests: land placement uses only allowed passable land terrain kinds.
- Happy-path tests: same-region outline uses the existing mixed-stack gray constant/token.
- Essential failure tests: cap overflow during substitution drops excess deterministically with expected priority and logging.
- Manual scenario runs confirm overlap/adjacent starts are possible, including same-region starts.

Dependencies: Phase C.

---

### Phase E — Scenario win-condition evaluator

Work:

1. Implement region-control objective check against opponent home-region hex set.
2. Integrate with existing game-over flow as alternative to unit-elimination win.
3. Evaluate objective once at end-of-turn resolution.
4. Ensure objective remains independent from fog/visibility masking.

Verification:

- Tests for both win paths:
  - opponent units reach zero,
  - full control of opponent region hexes.
- Regression test confirms no premature victory on partial control.

Dependencies: Phase D.

---

### Phase F — Always-visible home-region boundary overlays

Work:

1. Compute and cache per-hex outline data for both selected home regions.
2. Add renderer overlay draw pass for dual home-region outlines.
3. Apply layered styling (player color + fine black edging), with mixed-region gray fallback for same-region selections.
4. Ensure render path ignores fog, stale/explored state, and control changes.

Verification:

- Visual checks across fog on/off and at varying zoom.
- Snapshot/manual checks that both boundaries remain visible at all times.
- Performance check for redraw overhead on pan/zoom.

Dependencies: Phase D (for region sets), can proceed parallel with Phase E after region state exists.

---

### Phase G — AI prompt/briefing scenario awareness

Work:

1. Update AI briefing generation to include region-vs-region objective context.
2. Explicitly include both home-region names and objective wording in prompt sections.
3. Add validation to prevent missing scenario context in AI requests.

Verification:

- Prompt contract tests ensure required scenario fields are present.
- Manual log/inspection verifies AI receives scenario objective on initial and later consultations.

Dependencies: Phase C and Phase E.

---

### Phase H — End-to-end hardening and regression sweep

Work:

1. Run acceptance checklist for this scenario slice.
2. Validate logging/comment rules across touched backend methods.
3. Confirm tests stay focused on happy paths + essential failures.
4. Run lint and relevant test suites.

Verification:

- Green lint/tests.
- Manual end-to-end playthrough checklist completed.

Dependencies: Phases A-G.

---

## 5. Test matrix (happy paths + essential failures only)

1. **Happy:** region list extraction returns sorted unique names.
2. **Happy:** overlay renders both selectors + randomize buttons above fog checkbox.
3. **Happy:** new-game payload carries selected regions and fog setting together.
4. **Happy:** placeable seeded units for each side are inside their selected home region.
5. **Happy:** no-water substitution converts each unplaceable naval to `+1 armor` and `+1 infantry`.
6. **Happy:** no-land substitution converts unplaceable land units to equal-count naval units.
7. **Happy:** same-region and adjacent-region starts initialize successfully.
8. **Happy:** home-region boundaries always visible with fog on/off.
9. **Happy:** same-region selections render both outlines in mixed-stack gray.
10. **Happy:** region-control victory checks only at end of turn.
11. **Happy:** control-all-opponent-home-region triggers game over.
12. **Happy:** destroy-all-opponent-units still triggers game over.
13. **Happy:** cap overflow during substitution enforces caps and drops excess deterministically (infantry dropped first for land overflow).
14. **Essential failure:** invalid region payload rejected or safely normalized with explicit logging.
15. **Essential failure:** missing scenario objective fields in AI briefing contract test fails fast.

Avoid tests for styling internals, simple DTO accessors, and direct delegation wrappers.

---

## 6. Risk register and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Region extraction ambiguity from naming data | High | Centralized backend extractor + fixture tests against real naming envelope shape. |
| Spawn dead-ends in sparse regions | High | Pre-validate candidate capacity and define deterministic fallback/error policy. |
| Region-outline overlay performance regressions | Medium | Cache per-hex outline derivation and avoid recompute on every frame. |
| Win-condition false positives | High | Dedicated region-control tests with partial/full control cases. |
| AI ignores scenario objective | Medium | Explicit scenario section in prompts + contract tests for required fields. |
| Visual outline readability on mixed terrain | Medium | Layered black+color stroke style + same-region gray fallback + manual contrast checks. |
| Substitution overflow causes non-deterministic roster outcomes | High | Stable unit-id ordering + explicit overflow priority rules + drop logging assertions. |

---

## 7. Acceptance checklist

- [ ] New game overlay shows `Human Player:` and `AI Player:` region selectors side-by-side above fog checkbox.
- [ ] Each selector has a randomize button that chooses a valid region.
- [ ] Selector defaults are random on overlay open/reset.
- [ ] Options are sorted unique region names from res1 naming data.
- [ ] New-game IPC/backend persists selected regions.
- [ ] Placeable units spawn in hexes intersecting their selected home region.
- [ ] Unplaceable naval units are substituted as `+1 armor` and `+1 infantry` each.
- [ ] Unplaceable land units are substituted with equal-count naval units.
- [ ] Substitution logic enforces unit caps and drops overflow deterministically.
- [ ] Infantry is dropped before armor when land overflow occurs.
- [ ] Same/adjacent-region starts are supported.
- [ ] Game evaluates region-control objective once at end of turn.
- [ ] Game ends when one side controls all hexes intersecting opponent home region.
- [ ] Game also ends when one side has no units.
- [ ] Both home-region boundaries are always visible regardless of fog/visibility/control.
- [ ] Outline style uses player color with black edging for readability.
- [ ] Same-region selection uses mixed-stack gray outline for both sides.
- [ ] Same-region outline gray reuses the exact existing mixed-stack gray constant/token.
- [ ] AI briefing/prompt includes both home regions and scenario objective.
- [ ] New/updated public backend methods have orienting comments and required logs.
- [ ] Lint and tests pass.

---

## 8. Resolved decisions

Resolved:

1. Region options use all unique region values from naming data.
2. Unit placement is best-effort with deterministic substitution:
   - `1 unplaceable naval -> +1 armor +1 infantry`
   - unplaceable land units -> equal-count naval units.
3. Same- and overlapping-region spawn is allowed.
4. Same-region border color uses existing mixed human/AI stack gray.
5. Region-control victory is evaluated once at end of turn.
6. Region outlines are hex-level outlines (no contiguous/disjoint special handling).
7. Region-vs-region is implicit/default; no explicit scenario selector in this slice.
8. AI prompts use structured scenario fields plus a required standardized rendered objective section in the prompt template.
9. Substitutions enforce unit caps; overflow units are dropped deterministically (land overflow drops infantry before armor).
10. Land placement candidates are limited to standard passable land terrains: `plains`, `mountains`, `wetlands`, `coastal`, `desert`, `forest`.
11. Substitution processing order is deterministic by stable unit-id ordering.
12. Same-region outlines reuse the exact existing mixed human/AI stack gray constant/token.

---

*End of plan.*
