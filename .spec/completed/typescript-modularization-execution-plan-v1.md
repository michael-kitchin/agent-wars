# TypeScript Modularization Execution Plan (v1)

*Execution plan for a coding agent to reorganize the four largest TypeScript files into smaller, logically grouped modules with behavior parity and high reliability.*

---

## 1) Goal and success criteria

### Goal

Refactor these files into smaller sub-modules while preserving runtime behavior:

- `src/renderer/renderer.ts` (5,543 lines)
- `src/main/openRouter.ts` (2,374 lines)
- `src/main/gameActions.ts` (2,092 lines)
- `src/main/gameDb.ts` (2,084 lines)

### Success criteria (must all be true)

1. No gameplay behavior changes beyond explicitly approved fixes.
2. Existing test suites for touched areas pass (or known environment blockers are documented).
3. Lint/typecheck pass for modified files.
4. Public backend methods retain or improve orienting comments.
5. Public backend mutator/query logging conventions remain correct:
   - mutators: debug-level,
   - getter-style read methods: trace-level,
   - caught exceptions: error-level.
6. New module boundaries are understandable, with low-coupling imports and no circular dependencies.
7. Verification is automated at every phase gate (no manual-only gate).
8. Module sizing target is guidance-based: prefer modules <= ~600 lines where practical, but do not force harmful splits.

---

## 2) Non-goals

- Introducing new gameplay features.
- Schema redesign unrelated to modularization.
- Large UI redesigns.
- Widespread naming churn without functional value.

---

## 3) Refactor principles

1. **Behavior parity first:** extract/move code before changing logic.
2. **Small, verifiable steps:** each phase is shippable and testable.
3. **Adapter-first migration:** preserve old call sites via thin facades until consumers are migrated.
4. **Domain-oriented splits:** module boundaries follow behavior domains, not arbitrary line chunks.
5. **Reliability over aggressiveness:** avoid broad mechanical rewrites that are hard to verify.
6. **Documentation as part of code movement:** orienting comments on updated public backend methods.
7. **Test scope discipline:** add/update only happy-path and essential failure-contract tests; avoid implementation-detail tests.
8. **Single-PR execution:** phases are reliability gates inside one PR, not PR boundaries.

---

## 4) Target module map (proposed)

## 4.1 `src/renderer/renderer.ts`

Proposed decomposition under `src/renderer/`:

- `renderScene.ts` (scene orchestration)
- `renderTerrain.ts` (res1/res4 terrain drawing)
- `renderUnits.ts` (unit sprites/labels/selection visuals)
- `renderOrders.ts` (standing orders, preview paths, planned attacks/ferry)
- `renderOverlays.ts` (infrastructure glyphs, production overlays, stale intel)
- `interaction/selection.ts` (selection state transitions)
- `interaction/inputHandlers.ts` (mouse/keyboard handlers)
- `interaction/buildUi.ts` (build popup/list/button sync)
- `state/projection.ts` (derived maps/caches from snapshot state)
- `animation/resolution.ts` (resolution playback phases and helpers)

## 4.2 `src/main/openRouter.ts`

Proposed decomposition under `src/main/openrouter/`:

- `client.ts` (request transport/retry/abort handling)
- `prompt/promptAssembly.ts` (system/user prompt assembly)
- `prompt/briefing/*` (combat, production, air, standing-order blocks)
- `tools/toolRegistry.ts` (tool routing and validation)
- `tools/toolExecution.ts` (execution loop, tool-call accounting)
- `response/normalization.ts` (schema normalization, drop-reason tracking)
- `memory/integration.ts` (memory read/write transformations)
- `metrics.ts` (cost/tokens/wall-clock accounting)

## 4.3 `src/main/gameActions.ts`

Proposed decomposition under `src/main/game-actions/`:

- `orders/validation.ts` (movement/ranged/air/ferry validation)
- `orders/assignment.ts` (assign/cancel/update order flows)
- `preview/*` (single/group route preview)
- `resolution/*` (turn-ready orchestration and state transitions)
- `infrastructure/effects.ts` (urban/airport/seaport destruction effects)
- `build-queue/integration.ts` (queue ops integration points)
- `selection/groupPolicies.ts` (grouping constraints and shared policies)

## 4.4 `src/main/gameDb.ts`

Proposed decomposition under `src/main/game-db/`:

- `connection.ts` (open/close/pragma/version checks)
- `schema.ts` (DDL and version invariants)
- `seeding/terrainSeed.ts`, `seeding/infrastructureSeed.ts`, `seeding/unitSeed.ts`
- `repositories/hexRepo.ts`
- `repositories/unitRepo.ts`
- `repositories/ordersRepo.ts`
- `repositories/infrastructureRepo.ts`
- `repositories/intelRepo.ts`
- `repositories/configRepo.ts`
- `snapshots.ts` (game state snapshot assembly)
- `recovery.ts` (reset/recovery routines)

---

## 5) Phased execution plan (independently verifiable)

## Phase 0 - Baseline and guardrails

### Work

1. Record baseline metrics:
   - line counts for target files,
   - key automated test commands for touched domains,
   - known environment blockers (for example native dependency requirements).
2. Add a module-boundary checklist in `.spec` for reviewer use.
3. Add/confirm automation scripts for circular-dependency and verification checks if missing.

### Verification (automated)

- `build:main` passes.
- Baseline renderer contracts and core domain tests run.
- Baseline contract outputs are captured in automated assertions where feasible.

### Exit criteria

- Baseline is documented and reproducible by another developer/agent.

---

## Phase 1 - `gameDb.ts` split (connection/schema/repositories/seeding first)

### Work

1. Extract DB lifecycle and schema concerns.
2. Move seeding responsibilities into dedicated seeding modules.
3. Introduce repository-level modules for read/write domains.
4. Keep transaction boundaries and SQL behavior unchanged.

### Verification (automated)

- `build:main` passes.
- `gameDb.test` runs where native prerequisites exist; otherwise run all compile-time and dependent tests and log blocker.
- `terrainMetadataParity.test`, `mapData.test`, and other DB-dependent contract tests pass.
- Add/keep focused repository-level contract tests only where extraction introduces integration risk.

### Exit criteria

- DB concerns are separated; `gameDb.ts` is reduced to coordination/facade responsibilities.

---

## Phase 2 - `gameActions.ts` split (validation -> assignment -> resolution)

### Work

1. Separate validation logic from mutation logic.
2. Extract preview and grouped-order behavior modules.
3. Extract resolution-time effects and infrastructure mutation helpers.
4. Preserve IPC-facing contracts and result payload formats.

### Verification (automated)

- `build:main` passes.
- `gameActionsMultiSelect.test`, `gameActionsProduction.test`, `productionRules.test`, `productionOrders.test`, `submitOrdersPayload.test` pass.
- Add narrow contract tests when extraction changes module boundaries for shared validators.

### Exit criteria

- `gameActions.ts` acts as orchestration; domain logic resides in focused modules.

---

## Phase 3 - `openRouter.ts` split (prompt assembly and tool loop)

### Work

1. Extract prompt assembly blocks into focused modules (`prompt/briefing/*`, `prompt/promptAssembly.ts`).
2. Extract tool loop orchestration and tool routing into dedicated modules.
3. Keep top-level API signatures stable; `openRouter.ts` becomes composition root.
4. Ensure logging parity remains intact during extraction.

### Verification (automated)

- `openRouter.matrix.test` and related tool tests pass.
- Prompt/normalization contract tests pass for extracted modules.
- Debug-log marker assertions pass where tests already cover them.

### Exit criteria

- Request lifecycle is traceable through small modules; top-level file size substantially reduced.

---

## Phase 4 - Renderer split (pure rendering + interaction in two sub-steps)

### Work

1. Extract pure render helpers first (terrain, units, overlays, orders), preserving draw order.
2. Keep `renderer.ts` as an orchestrator facade delegating to extracted modules.
3. Extract interaction/state-projection modules (`interaction/*`, `state/*`, `animation/*`) in a second sub-step.
4. Preserve event flow order, debounce/RAF behavior, and existing IPC usage.

### Verification (automated)

- `rendererConsolidation.test` passes.
- Add renderer extraction contract tests for moved modules (draw orchestration, overlay derivation, order label parity).
- `build:renderer` and renderer bundle generation pass.

### Exit criteria

- `renderer.ts` is materially smaller and mostly composition + wiring.

---

## Phase 5 - Cross-module hardening and cleanup

### Work

1. Remove temporary adapters once all call sites are migrated (adapters are allowed during migration).
2. Normalize import paths and eliminate dead exports.
3. Add/refine orienting comments on updated public backend methods.
4. Ensure consistent logging-level usage after moves.
5. Deepen folder hierarchy where it improves navigability and avoids overly broad modules.

### Verification (automated)

- Full lint/typecheck pass for touched files.
- Targeted tests for touched areas pass.
- Automated circular-dependency/static-import check passes.
- Logging/comment contract audit checks pass.

### Exit criteria

- Refactor is clean, understandable, and free of transitional scaffolding.

---

## Phase 6 - Final verification and handoff

### Work

1. Re-run the full relevant automated test matrix for modified domains.
2. Produce a concise refactor map (old module -> new module ownership).
3. Add a short maintainer note in `.spec` with module responsibilities and dependency direction.
4. Record known environment-specific blockers (if any) with exact reproduction commands.

### Verification (automated)

- Final automated validation checklist completed.
- Required command set is reproducible by another developer/agent.

### Exit criteria

- Refactor is merge-ready with traceable automated verification evidence.

---

## 6) Risk register and mitigations

1. **Risk:** Hidden behavior drift during large moves.  
   **Mitigation:** move-extract in small phase batches within one PR; keep facade wrappers until verified.

2. **Risk:** Circular imports after splitting.  
   **Mitigation:** enforce one-way dependency layering per target module map.

3. **Risk:** Renderer interaction regressions not fully covered by tests.  
   **Mitigation:** add/expand renderer contract tests before and during extraction; no manual-only phase gate.

4. **Risk:** DB boundary refactor alters transaction semantics.  
   **Mitigation:** preserve SQL and transaction order exactly; isolate SQL movement before edits.

5. **Risk:** Logging contract regressions while moving methods.  
   **Mitigation:** logging-level checklist in PR review; targeted grep audit per phase.

6. **Risk:** Oversized "new" modules that simply move bloat.  
   **Mitigation:** use ~600-line guidance target and split further when cohesion allows.

---

## 7) Verification checklist template (per phase)

- [ ] Build/typecheck successful for touched code.
- [ ] Lints for touched files reviewed.
- [ ] Required tests for touched domain pass.
- [ ] No unintended API/IPC contract change.
- [ ] Logging contract preserved (debug/trace/error usage).
- [ ] Public backend method comments remain orienting and accurate.
- [ ] Diff reviewed for accidental logic changes.
- [ ] Automated checks (no manual-only acceptance) are captured in commands/output.

---

## 8) Locked decisions from review

1. No hard module-size cap; ~600 lines is a reasonable guideline target when helpful.
2. One PR is expected; phases are reliability/verification gates within that PR.
3. Execution order is optimized for reliability (backend-first, renderer-after-contract hardening).
4. Temporary adapter/facade exports are allowed and removed during cleanup.
5. Verification is automated for each phase (manual checks can supplement but not gate).
6. Proposed naming and hierarchy are approved; deeper hierarchy is allowed where beneficial.

---

## 9) Final clarifications resolved

1. Adding a lightweight dev dependency is acceptable when needed to automate circular-dependency checks.
2. If unrelated lint/test failures are encountered during a phase, the agent should fix them as they are produced when feasible; if not feasible, document blockers with exact reproduction details.

