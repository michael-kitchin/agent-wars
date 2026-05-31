# Home-Region Control Visibility Execution Plan

This plan is for implementation by a lower-quality coding agent and is structured to maximize reliability, clarity, and incremental verification.

---

## Goal

Implement the following behavior across **all scenarios with home-region metadata**:

1. Home-region hexes render with outlined owner-colored borders:
   - current border line at that edge becomes transparent,
   - new owner-colored border lines are drawn on both inside and outside of that transparent line,
   - no additional spacing is introduced.
2. Players always see who controls their own home-region hexes (including intersecting home-region hexes), even when ownership would otherwise be hidden by fog/proximity rules.
3. Non-home hexes render normal (single, non-outlined) owner-colored borders only when ownership is visible under normal proximity/fog rules.

---

## Confirmed Decisions

1. Scope includes all scenarios that provide home-region metadata, not only `region_vs_region`.
2. Intersecting home-region hexes use a single neutral/contested outline style (not dual owner colors).
3. Own-home visibility exception includes intersecting home-region hexes.

---

## Reliability and Quality Constraints

1. Centralize ownership-visibility and border-style decisions in shared helpers; do not duplicate logic across renderer files.
2. Preserve existing fog behavior for non-home hexes (no ownership leakage).
3. For new/updated public backend methods:
   - add debug-level logs for mutating/mutator-style invocations,
   - add trace-level logs for getter/query-style methods,
   - add error-level logs for caught exceptions.
4. Add orienting comments for all new and updated fields and non-overriding methods.
5. Keep tests focused on happy paths and essential failure cases only.
6. Prefer decomposition if touched files approach size limits.

---

## Primary Implementation Surfaces

- Rendering and draw order:
  - [src/renderer/rendering/terrainRendering.ts](src/renderer/rendering/terrainRendering.ts)
  - [src/renderer/rendering/polygonOutline.ts](src/renderer/rendering/polygonOutline.ts)
  - [src/renderer/rendering/terrainVisualStyles.ts](src/renderer/rendering/terrainVisualStyles.ts)
  - [src/renderer/renderer.ts](src/renderer/renderer.ts)
- Home-region and ownership classification:
  - [src/shared/homeRegionRules.ts](src/shared/homeRegionRules.ts)
- Fog/snapshot ownership visibility contracts:
  - [src/main/game-db/fogState.ts](src/main/game-db/fogState.ts)
  - [src/shared/ipc/gameStateTypes.ts](src/shared/ipc/gameStateTypes.ts)
- High-value tests likely requiring updates:
  - [src/main/gameDb.test.ts](src/main/gameDb.test.ts)
  - [src/main/visibility.test.ts](src/main/visibility.test.ts)
  - [src/main/rendererConsolidation.test.ts](src/main/rendererConsolidation.test.ts)

---

## Phase Plan

### Phase 1 - Contract Lock and Shared Classifier

Work:

1. Define a single classification contract that decides border style per hex from:
   - home-region membership,
   - intersection membership,
   - ownership visibility for the current player,
   - current owner (`res1Control`).
2. Add/extend shared helper(s) in [src/shared/homeRegionRules.ts](src/shared/homeRegionRules.ts) to return stable style categories.
3. Add orienting comments and required logging on any new/updated public backend entry points.

Verification:

- Unit tests validate classifier output for:
  - own-home visible,
  - intersecting-home neutral,
  - visible non-home normal owner border,
  - hidden non-home no owner border.
- No rendering behavior change in this phase.

Exit criteria:

- Style classification logic is deterministic, documented, and reusable.

---

### Phase 2 - Fog/Snapshot Ownership Visibility Contract

Work:

1. Update [src/main/game-db/fogState.ts](src/main/game-db/fogState.ts) to ensure the player snapshot includes enough perspective-aware ownership visibility for:
   - own home-region hexes,
   - intersecting home-region hexes.
2. Keep non-home ownership visibility strictly under existing normal fog/proximity rules.
3. Ensure contract shape remains explicit and typed in [src/shared/ipc/gameStateTypes.ts](src/shared/ipc/gameStateTypes.ts), if updates are needed.
4. Add required logs and orienting comments for changed public backend methods.

Verification:

- Happy path tests:
  - own-home ownership remains visible without nearby units,
  - intersecting-home ownership remains visible,
  - hidden non-home ownership remains hidden.
- Essential failure test:
  - missing/invalid home-region metadata degrades safely and logs an error.

Exit criteria:

- Renderer can apply style decisions without ad-hoc ownership reconstruction.

---

### Phase 3 - Border Rendering Refactor

Work:

1. Refactor border drawing in [src/renderer/rendering/terrainRendering.ts](src/renderer/rendering/terrainRendering.ts) into explicit passes:
   - transparent center stroke where outlined home-border effect is required,
   - inner and outer owner-colored strokes for home hexes,
   - normal single owner-colored stroke for visibility-eligible non-home hexes.
2. Reuse/extend [src/renderer/rendering/polygonOutline.ts](src/renderer/rendering/polygonOutline.ts) for dual-side outlined strokes with no additional spacing.
3. Apply neutral/contested outlined style for intersecting home-region hexes.
4. Preserve draw order and avoid per-frame expensive recomputation.

Verification:

- Manual visual checks:
  - home outlined effect looks correct at multiple zoom levels,
  - transparent center line is present where required,
  - non-home visible ownership shows normal line,
  - non-home hidden ownership shows no owner-colored border.
- Targeted renderer test updates validate classification-to-style mapping.

Exit criteria:

- All three requested visual behaviors are implemented and legible.

---

### Phase 4 - Cross-Scenario Integration Validation

Work:

1. Validate behavior in each scenario type that provides home-region metadata.
2. Confirm no regressions in scenarios without home-region metadata (behavior should remain unchanged/default).
3. Ensure intersecting-home neutral styling is stable in all relevant scenarios.

Verification:

- Scenario coverage checks:
  - at least one scenario with intersecting home-region hexes,
  - at least one scenario with non-intersecting home-region hexes,
  - at least one scenario where non-home ownership remains fog-hidden.
- Essential failure:
  - scenario with malformed/empty home metadata does not crash render path.

Exit criteria:

- Behavior is correct and stable for all supported scenario variants.

---

### Phase 5 - Hardening and Compliance Gate

Work:

1. Run targeted tests and lint for touched files.
2. Confirm required logs/comments are present for all touched backend public methods/fields.
3. Remove any low-value tests that violate project testing rules (implementation-detail assertions, boilerplate delegation coverage).
4. Perform final readability pass for lower-quality-agent maintainability.

Verification:

- Lint clean on touched files.
- Touched test suites green.
- Manual checklist below fully satisfied.

Exit criteria:

- Implementation is review-ready and rules-compliant.

---

## Test Matrix (Happy Paths + Essential Failures Only)

1. Happy: own-home ownership visible even without unit proximity.
2. Happy: intersecting home hexes visible with neutral outlined border style.
3. Happy: visible non-home ownership renders normal single owner-colored border.
4. Happy: hidden non-home ownership does not render owner-colored border.
5. Happy: outlined home-border effect preserves transparent center and no added spacing.
6. Happy: behavior remains correct at multiple zoom levels.
7. Essential failure: malformed home-region metadata logs error and fails safe without crash.

---

## Risks and Mitigations

1. Risk: ownership leakage on non-home fogged hexes.
   - Mitigation: gate non-home border ownership strictly via existing visibility predicates.
2. Risk: draw-order artifacts (double lines, halo mismatch).
   - Mitigation: explicit pass ordering and visual checks before completion.
3. Risk: inconsistent logic between backend and renderer.
   - Mitigation: shared classifier contract and integration tests across snapshot + renderer.
4. Risk: unclear implementation for lower-quality agent.
   - Mitigation: keep helper interfaces narrow, documented, and phase-gated.

---

## Acceptance Checklist

- [ ] Home-region border center stroke is transparent where outlined effect applies.
- [ ] Home-region hexes have inside/outside owner-colored lines without extra spacing.
- [ ] Intersecting home-region hexes use neutral/contested outlined style.
- [ ] Players always see ownership on their own home-region hexes.
- [ ] Players always see ownership on intersecting home-region hexes.
- [ ] Non-home hexes show normal owner-colored border only when ownership is normally visible.
- [ ] Non-home fog-hidden ownership does not leak through borders.
- [ ] No regressions in scenarios without home-region metadata.
- [ ] New/updated backend public methods/fields include required logs and orienting comments.
- [ ] Tests are limited to happy paths and essential failures.
- [ ] Lint and touched test suites pass.

---

## Execution Discipline for Implementing Agent

1. Complete phases in order.
2. Do not start a new phase until current phase verification passes.
3. If verification fails, fix within the same phase before continuing.
4. Do not commit or push as part of execution; leave all changes uncommitted for human review.

