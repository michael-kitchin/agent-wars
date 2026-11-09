# Phase 6 Implementation Checklist (IPC Handler + Tactical Lifecycle Consolidation)

Source plan: `.spec/maintainability-consolidation-execution-plan.md` (Phase 6).

---

## Global Guardrails

1. Never commit or push changes.
2. Preserve IPC behavior and tactical lifecycle semantics.
3. If contract or schema changes are required, stop and request approval.

---

## 0. Scope Lock

### In-scope
- `src/main/gameIpcHandlers.ts`
- tactical lifecycle modules under `src/main/tacticalBattle/`
- related helper modules under `src/main/`

### Out-of-scope
- renderer behavior changes
- shared contract shape changes (unless compatibility preserved)

---

## 1. Baseline

Run:
- `npm run build:main`
- `npm run lint`
- `node dist/main/gameIpcHandlers.test.js`
- `node dist/main/tacticalBattle/tacticalBattleSession.test.js`
- `node dist/main/tacticalBattle/computeTacticalBattleSnapshot.db.test.js`

---

## 2. Extract IPC Result Mapping Helpers

1. Move repeated Ready/Resolve result mapping into shared helper functions.
2. Keep response payload fields unchanged.
3. Keep event-driven consultation wrappers behavior unchanged.

Verify:
- `gameIpcHandlers.test.js` stays green

---

## 3. Consolidate Tactical Lifecycle Transitions

1. Centralize transitions:
   - start session,
   - mutate session,
   - persist/clear session,
   - restore session.
2. Ensure transition helpers are explicit and idempotent where expected.
3. Keep current persistence consistency checks intact.

Verify:
- tactical session + DB tests green

---

## 4. Logging Severity Cleanup

1. Expected precondition misses: debug/trace (not error).
2. Caught exceptional failures: error.
3. Ensure getter-style tactical queries use trace-level logs.

Verify:
- run tests and inspect output for error-log spam regressions

---

## 5. Comments Compliance

1. Add orienting comments for all new/updated fields and non-overriding methods.
2. Maintain clear “when to use / expected outcome / exceptions” format.

---

## 6. Phase Exit Verification

Run:
- `npm run build:main`
- `npm run lint`
- `node dist/main/gameIpcHandlers.test.js`
- `node dist/main/tacticalBattle/tacticalBattleSession.test.js`
- `node dist/main/tacticalBattle/computeTacticalBattleSnapshot.db.test.js`
- `node dist/main/gameDb.test.js`

---

## 7. Hard Stop Conditions

Stop and report if:
1. Need to change IPC channel names/payload structure.
2. Session lifecycle requires schema migration.
3. Ready/Resolve output behavior drifts.

---

## 8. Definition of Done

1. IPC handler mapping duplication is reduced.
2. Tactical lifecycle is centralized and explicit.
3. Logging severity aligns with expected vs exceptional paths.
4. Verification commands pass.

