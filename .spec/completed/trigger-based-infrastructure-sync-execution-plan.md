# Trigger-Based Infrastructure Sync Execution Plan

## Goal

Replace app-layer incremental reconciliation with database-trigger-driven synchronization so `res1_infrastructure` always reflects `res4_feature_overrides` after feature mutations, while retaining a startup/batch reconciliation safety net for legacy drift recovery.

## Requested Constraints (Confirmed)

- Keep de-duplication as a first-class design objective.
- Remove manual/runtime reconciliation steps from gameplay paths.
- Retain only the startup/batch reconciliation step.
- Deliver in independently verifiable phases with strong reliability and maintainability.

## Architecture Decision

- **Authoritative feature source:** `res4_feature_overrides`
- **Derived operational projection:** `res1_infrastructure`
- **Incremental synchronization mechanism:** SQLite triggers on `res4_feature_overrides`
- **Legacy repair mechanism:** startup/batch reconciliation (single set-based statement)

This keeps hot gameplay reads simple/fast while ensuring the source of truth remains at res4 granularity.

## Duplication Minimization Strategy

SQLite does not support stored procedures, so complete elimination of SQL duplication is not possible. To minimize maintenance risk:

1. Define one shared SQL fragment/template for "recompute parent res1 counts from res4 rows."
2. Reuse this fragment in:
   - trigger bodies (incremental updates)
   - startup/batch reconciliation (set-based repair)
3. Add comments documenting that both mechanisms intentionally serve different reliability needs:
   - triggers prevent new drift
   - startup/batch fixes historical drift

## In Scope

- Schema/migration changes to add `AFTER INSERT`, `AFTER UPDATE`, `AFTER DELETE` triggers on `res4_feature_overrides`.
- Refactor app code to remove non-startup manual reconciliation calls.
- Keep startup/batch reconciliation in DB init/open flows.
- Test coverage for trigger behavior and post-destruction sync.
- Logging updates for observability of batch repairs and trigger-backed invariants.

## Out of Scope

- Redesigning renderer tooltip semantics.
- Replacing `res1_infrastructure` with a dynamic view.
- Broader migration framework redesign beyond what is needed to ship triggers safely.

## Phase Plan

## Phase 0 - Baseline Lock and Safety Checks

### Objective

Establish current behavior and identify all runtime reconciliation call sites to remove later.

### Work

- Inventory all call sites of `reconcileRes1InfrastructureCountsFromRes4Overrides`.
- Mark each as:
  - startup/batch keep
  - runtime/manual remove
- Add temporary debug counters/logs to confirm trigger-based flow replaces runtime reconciliation.

### Verification

- Build passes.
- Test baseline captured before trigger migration.
- Explicit checklist of reconciliation call sites exists.

## Phase 1 - Trigger DDL and Migration Wiring

### Objective

Add durable trigger-based synchronization in SQLite schema/migrations.

### Work

- Create three triggers on `res4_feature_overrides`:
  - `AFTER INSERT`
  - `AFTER DELETE`
  - `AFTER UPDATE`
- `AFTER UPDATE` must recompute both `OLD.parent_h3_index` and `NEW.parent_h3_index`.
- Ensure idempotent migration behavior for existing databases (safe re-run patterns).
- Keep SQL simple, deterministic, and bounded to affected parent hexes.

### Verification

- Migration applies cleanly on fresh and existing DBs.
- Trigger existence checks pass in tests.
- No schema validation regressions.

## Phase 2 - Remove Runtime/Manual Reconciliation Paths

### Objective

Eliminate gameplay-time reconciliation calls and rely on triggers for incremental consistency.

### Work

- Remove reconciliation calls from movement preview/assignment and renderer-facing fetch paths.
- Keep startup/batch reconciliation in DB initialization/opening only.
- Preserve clear orienting comments on public methods impacted by this change.

### Verification

- Static search confirms runtime/manual calls removed.
- Startup/batch reconciliation still invoked in DB init/open flows.
- Build and lint pass.

## Phase 3 - Air Strike and Feature Mutation Contract Validation

### Objective

Guarantee that feature destruction (urban/airport/seaport) stays synchronized through triggers only.

### Work

- Keep mutation entry points writing only res4 feature flags (as they already do).
- Confirm no separate app-layer res1 count write is required after those writes.
- Add/adjust tests proving res1 counts match res4-derived counts immediately after:
  - urban destruction
  - airport destruction
  - seaport destruction

### Verification

- Tests assert exact res1=res4 rollup parity after each mutation type.
- No drift appears after turn-resolution flows.

## Phase 4 - Startup/Batch Reconciliation Hardening

### Objective

Retain startup/batch reconciliation as a one-time repair mechanism for legacy drift.

### Work

- Keep set-based startup reconciliation.
- Improve log messages:
  - changed row count
  - no-op path
- Ensure startup reconciliation runs before gameplay actions in both app init and test DB open paths.

### Verification

- Inject synthetic drift in tests and verify startup/open repairs it.
- Confirm gameplay tests pass without runtime reconciliation calls.

## Phase 5 - Reliability Regression Suite and Cleanup

### Objective

Prove behavior is stable and remove temporary migration scaffolding/noisy diagnostics.

### Work

- Run targeted suites:
  - `gameDb.test`
  - movement preview/assignment tests
  - multi-select + sealift tests
  - any air-strike resolution/regression tests in scope
- Remove temporary diagnostics not needed long-term.
- Update comments/docs for future developers.

### Verification

- All targeted tests pass.
- Lints pass.
- No runtime reconciliation call remains outside startup/batch.

## Acceptance Criteria

- `res1_infrastructure` updates automatically on every relevant `res4_feature_overrides` mutation.
- No manual/runtime reconciliation in gameplay paths.
- Startup/batch reconciliation remains and repairs legacy drift.
- Air-strike destruction flows remain synchronized without app-layer incremental reconciliation.
- Tests demonstrate both trigger correctness and startup repair behavior.

## Risks and Mitigations

- **Risk:** Trigger logic misses parent change on update.
  - **Mitigation:** Explicit old/new parent recompute and dedicated test.
- **Risk:** Migration drift across existing DB files.
  - **Mitigation:** Idempotent migration checks and existing DB integration tests.
- **Risk:** Hidden app code still mutates `res1_infrastructure` directly.
  - **Mitigation:** repository scan + tests asserting trigger-driven parity.

## Rollback Plan

- Keep startup/batch reconciliation intact during rollout.
- If trigger migration fails in production, disable trigger path via migration rollback while preserving startup/batch reconciliation as the only repair mechanism.
- Re-run drift-repair startup reconciliation on next launch.

## Developer Notes for Maintainability

- Treat `res4_feature_overrides` as the only feature-authoritative data source.
- Keep `res1_infrastructure` as a derived performance projection.
- Any new feature mutation path must update res4 only; triggers handle res1 sync.
- Avoid adding new runtime reconciliation hooks unless explicitly approved as emergency mitigation.
