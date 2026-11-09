# Hex Visibility and Home-Region Outlining Execution Plan

*Execution plan for implementing always-visible/discovered home-region hex behavior, ownership-driven home-region outline colors, contested gray precedence, and AI prompt ownership summaries. Structured for phased reliability, independent verification, and maintainable code.*

---

## 1. Goal, scope, and success criteria

### 1.1 Goal

Implement a reliable ruleset where:

1. Home-region hexes for both sides are always discovered/visible to that side regardless of unit presence.
2. Home-region outline colors always reflect current ownership of those hexes.
3. Contested hexes render gray, and intersecting home-region hexes remain permanently gray.
4. LLM prompts include both home-region ownership summaries in the same style as existing control summaries.
5. Non-home-region hex behavior remains unchanged.

### 1.2 In scope

1. Fog-of-war visibility/discovery state integration for home-region hexes.
2. Home-region outline color derivation based on current controller state (`res1Control`) plus contested/intersection precedence.
3. Explicit handling for:
   - same-region home selections,
   - intersecting-but-not-same home regions.
4. Prompt text updates for strategic context (both sides' home-region ownership counts/percentages).
5. Focused test updates for happy paths and essential failure contracts.

### 1.3 Out of scope

1. Changes to non-home-region hex discovery or outline behavior.
2. New scenario types or scenario-selection UX redesign.
3. Combat/control mechanics changes beyond those required for representation rules.

### 1.4 Success criteria (binary)

1. Human home-region hexes are always included in human visible/explored sets while match is active.
2. AI home-region hexes are always included in AI visible/explored sets while match is active.
3. Intersecting home hexes are always included in both sides' visible/explored sets.
4. Home-region outline rendering reflects current controller color (human/AI) for non-gray home hexes.
5. Contested home-region hexes render gray.
6. Intersecting home-region hexes are permanently gray, even when controlled by one side.
7. In intersecting-but-not-same cases, non-intersecting home hexes follow ownership-color rules while intersecting hexes remain gray.
8. Non-intersecting home hexes start controlled by their home-region player.
9. After initialization, non-intersecting home hexes follow default engine control rules (including capture/recapture outcomes).
10. Intersecting home hexes follow default engine control behavior while remaining gray.
11. LLM prompt strategic context includes perspective-relative home-region ownership summaries for both sides using count/percentage formatting exactly consistent with current global control summaries.
12. Non-home-region visibility and outline behavior remains unchanged.
13. Updated/new public backend methods include orienting comments and required logs (trace getters, debug mutators, error on caught exceptions).
14. Tests and lint pass for touched areas.

---

## 2. Reliability and maintainability constraints

1. Keep ownership-color rule computation centralized in a reusable helper module rather than duplicating in renderer draw paths.
2. Keep home-region visibility augmentation centralized in fog-state computation, not spread across consumer UI code.
3. Preserve existing `res1Control` as the ownership source of truth; do not introduce competing ownership stores.
4. Use deterministic rule precedence:
   - permanent intersection gray,
   - contested gray from multi-side co-occupancy,
   - otherwise controller color.
5. Keep function signatures small and typed; introduce parameter objects if argument count grows.
6. Add concise orienting comments for all new/updated public non-overriding backend methods.
7. Keep files within preferred size limits by extracting targeted helpers where needed.
8. Treat non-intersecting home-region hexes as always visible to their home player and initialized as controlled by that home player.
9. Treat intersecting home hexes as always visible to both players while keeping control on default engine behavior.
10. Preserve default engine control progression after initialization for both intersecting and non-intersecting home hexes (no custom ownership lock).
11. Ensure new/updated public backend method invocations emit debug-level logs, getter-style methods emit trace-level logs, and caught exceptions emit error-level logs with troubleshooting detail.

---

## 3. Target implementation surfaces

### 3.1 Visibility/discovery (main process)

Primary files:

- `src/main/game-db/fogState.ts`
- `src/main/visibility.ts`
- `src/main/gameActions.ts` (only if refresh sequencing adjustments are needed)

Responsibilities:

1. Guarantee side-specific home-region hex injection into `visibleHexes` and `exploredHexes`, and for intersections inject into both sides.
2. Preserve existing fog semantics for all other hexes.
3. Ensure snapshot outputs for renderer/AI include corrected sets.

### 3.2 Home-region metadata and intersection derivation

Primary files:

- `src/main/regionScenario.ts`
- `src/main/game-db/scenarioState.ts` (read path if needed)

Responsibilities:

1. Produce side home-hex sets and stable intersection set (`human ∩ ai`).
2. Reuse existing scenario region resolvers to avoid divergent region math.

### 3.3 Outline color model + rendering

Primary files:

- `src/renderer/rendering/terrainRendering.ts`
- `src/renderer/rendering/polygonOutline.ts` (if style helper extension is needed)
- `src/renderer/core/constants.ts` (reuse existing gray/player color tokens)

Responsibilities:

1. Compute per-home-hex outline color based on ownership + contested + intersection precedence.
2. Render dual home-region overlays with dynamic color changes as control changes.
3. Ensure non-home-region hex rendering remains untouched.

### 3.4 Prompt updates

Primary files:

- `src/main/openrouter/openRouter.ts`
- `src/main/openrouter/briefingSections.ts` (if sectionized prompt text is preferable)

Responsibilities:

1. Add ownership summary lines for both home regions.
2. Use count and percentage format aligned with current strategic-context style.
3. Ensure summary uses live controller state and scenario home-region hex sets.

### 3.5 Test surfaces

- `src/main/visibility.test.ts`
- `src/main/gameDb.test.ts` (fog/home-region contract tests)
- `src/main/openrouter/openRouter.matrix.test.ts`
- `src/main/rendererConsolidation.test.ts` (or closest renderer test coverage path)
- `src/main/gameActionsProduction.test.ts` (only if contested ownership-state behavior requires explicit contract coverage)

---

## 4. Phased execution plan (independently verifiable)

### Phase A — Rule contract lock and helper design

Work:

1. Define explicit rule precedence and data contracts in code comments/types.
2. Introduce reusable pure helpers:
   - home-region hex set resolution,
   - intersection detection,
   - outline ownership-state classification (`intersection | contested | controlledByHuman | controlledByAi`).
3. Add orienting comments/logging for any new public backend methods.

Verification:

- Typecheck passes.
- Unit tests for pure helper contracts (happy path + essential edge cases only).
- No behavior change yet in render/fog flows.

Dependencies: none.

---

### Phase B — Always-discovered/visible home-region integration

Work:

1. Update fog-state assembly to union each side's home-region hexes into both `visibleHexes` and `exploredHexes` for that side.
2. Keep stale-intel and enemy-filter behavior unchanged for non-home-region cells.
3. Add debug logs on snapshot refresh summarizing counts added by home-region rule.

Verification:

- Tests confirm home-region hexes remain visible/explored with zero friendly units present.
- Regression tests confirm non-home-region fog behavior remains unchanged.
- Manual check: start match turn 1 with fog enabled and inspect both perspectives.

Dependencies: Phase A.

---

### Phase C — Home-region control initialization alignment

Work:

1. Ensure non-intersecting home hexes are initialized to home-player control in `res1Control` at scenario setup/reset.
2. Keep intersecting home hexes on default engine control rules.
3. Preserve default control progression after initialization (including capture/recapture) without adding a persistent ownership lock.
4. Add required debug/trace/error logs for new/updated public backend methods used in this flow.

Verification:

- Tests confirm non-intersecting home hexes are initialized to home-player control at game start.
- Tests confirm both intersecting and non-intersecting home hexes follow normal/default control transitions after initialization.
- Regression tests confirm non-home control behavior unchanged.

Dependencies: Phase A.

---

### Phase D — Ownership-driven home-region outline coloring

Work:

1. Extend home-region overlay draw path to accept per-hex style classification.
2. Apply precedence:
   - if hex in intersection set -> gray (permanent),
   - else if hex has multi-side co-occupancy -> gray,
   - else -> controller color.
3. Ensure color updates on control changes without requiring full match reset.

Verification:

- Renderer tests/manual assertions for capture and recapture color transitions.
- Tests for same-region and intersecting-but-not-same scenarios maintain permanent gray on intersecting cells.
- Regression check confirms non-home-region outlines unchanged.

Dependencies: Phase A + Phase C; can run parallel with Phase B after helpers exist.

---

### Phase E — Prompt ownership summaries for both home regions

Work:

1. Add strategic-context lines summarizing ownership for:
   - human home region,
   - AI home region.
2. Use current control map and scenario home-hex sets to compute:
   - owned hex count,
   - total home-region hexes (including intersecting hexes),
   - ownership percentage.
3. Keep format aligned exactly with existing global control summary precision/style and ensure inclusion in both initial and subsequent request flows, using perspective-relative phrasing.

Verification:

- Prompt matrix tests assert presence and formatting of both summary lines.
- Manual prompt inspection confirms values update with ownership changes.

Dependencies: Phase A + Phase B + Phase C data visibility; can run parallel with Phase D.

---

### Phase F — End-to-end validation and hardening

Work:

1. Run focused regression suites for visibility, renderer, and prompt contracts.
2. Run lint for touched files and fix introduced issues.
3. Verify logging and orienting-comment requirements for all touched public backend methods.
4. Perform scenario-specific manual validation:
   - no-overlap, overlap, same-region.

Verification:

- Green tests/lint in touched scope.
- Manual checklist completed (section 7).
- No unintended changes in non-home-region behavior.

Dependencies: Phases B-E.

---

## 5. Test matrix (happy paths + essential failures only)

1. **Happy:** side home-region hexes stay visible/explored without side units present.
2. **Happy:** capture of opponent home hex updates outline to captor color.
3. **Happy:** recapture reverts outline to current controller color.
4. **Happy:** contested home hex displays gray.
5. **Happy:** same-region home setup displays permanently gray for shared home hexes.
6. **Happy:** intersecting-but-not-same setup shows gray for intersection and ownership colors on non-intersecting home hexes.
7. **Happy:** prompt contains both home-region ownership summaries with count/percentage formatting.
8. **Happy:** non-home-region fog and outlines remain unchanged.
9. **Happy:** intersecting home hexes are visible to both sides at all times.
10. **Happy:** non-intersecting home hexes are initialized to their home player's control.
11. **Happy:** after initialization, non-intersecting home hexes can be captured/recaptured under default control rules.
12. **Essential failure:** missing/invalid scenario home-region metadata path degrades safely with explicit error logging.
13. **Essential failure:** prompt summary helper handles zero-total region set without divide-by-zero and with deterministic output.

Avoid tests for low-value implementation details (render helper internals, trivial accessors, direct delegation wrappers).

---

## 6. Risk register and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Conflicting interpretation of "contested" (occupancy vs control unknown) | High | Contested is explicitly multi-side co-occupancy; enforce via helper tests and a single shared predicate. |
| Visibility union accidentally reveals non-home information | High | Apply additive union only to exact home hex sets; add regression assertions on non-home fog behavior. |
| Outline updates lag after control changes | Medium | Compute color from live state each render/frame snapshot or on state refresh boundary; add capture/recapture tests. |
| Intersection handling inconsistency across same vs overlapping regions | High | Explicitly derive intersection set and apply permanent-gray precedence globally. |
| Prompt summaries drift from existing style or become inconsistent | Medium | Reuse existing summary formatter pattern and add strict string contract checks. |

---

## 7. Acceptance checklist

- [ ] Human home-region hexes always visible/explored to human.
- [ ] AI home-region hexes always visible/explored to AI.
- [ ] Intersecting home hexes always visible/explored to both players.
- [ ] Captured opponent home hex outlines adopt captor color.
- [ ] Recaptured home hex outlines revert to current owner color.
- [ ] Home hexes with multi-side co-occupancy are gray.
- [ ] Same-region home hexes remain permanently gray.
- [ ] Intersecting home hexes remain permanently gray in intersecting-but-not-same setup.
- [ ] Non-intersecting home hexes in intersecting-but-not-same setup follow ownership color.
- [ ] Intersecting hexes follow normal control rules while remaining gray in outlines.
- [ ] Non-intersecting home hexes start controlled by their home-region player.
- [ ] Non-intersecting home hexes follow default control rules after initialization (capture/recapture works).
- [ ] Prompt includes perspective-relative ownership summary for both home regions in exact existing global-summary style/precision.
- [ ] Non-home-region behavior unchanged.
- [ ] Required logging/orienting comments added for new/updated public backend methods.
- [ ] Touched tests and lint pass.

---

## 8. Resolved decisions

1. **Contested source:** gray applies for home hexes with multi-side unit co-occupancy.
2. **Intersection/same-region precedence:** intersecting home hexes are permanently gray in outline, including all hexes when both sides choose the same region.
3. **Control behavior for intersecting hexes:** intersecting hexes still follow default engine control rules (for example first occupier takes control), even though outline stays gray.
4. **Control expectation for non-intersecting home hexes:** they start controlled by their home-region player, then follow default engine control rules for capture/recapture.
5. **Prompt phrasing:** perspective-relative summaries.
6. **Prompt precision/style:** must match existing global summary precision/style exactly.
7. **Forced visibility implication:** enemy units on always-visible home hexes are visible to that side.
8. **Tie-break clarification:** when intersecting hex control resolution is ambiguous, retain default engine behavior (no custom tie-break logic in this change).
9. **Prompt summary denominator:** use all hexes in each home-region set, including intersecting hexes.

---

*End of plan.*
