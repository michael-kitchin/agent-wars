# Phase 2 Implementation Checklist (Strategic Ready Pipeline Decomposition)

Source plan: `.spec/maintainability-consolidation-execution-plan.md` (Phase 2).

---

## Global Guardrails

1. Never commit or push changes.
2. Preserve runtime behavior; refactor by extraction/delegation only.
3. If out-of-scope edits become necessary, stop and request approval.

---

## 0. Scope Lock

### In-scope
- `src/main/gameActions.ts`
- `src/main/game-actions/*` (new/existing ready/melee helpers)
- minimal related test files under `src/main/*test.ts`

### Out-of-scope
- renderer behavior changes
- shared IPC contract shape changes
- OpenRouter pipeline redesign

If out-of-scope edits are required, stop and ask.

---

## 1. Baseline

Run:
- `npm run build:main`
- `npm run lint`
- `node dist/main/combatResolution.test.js`
- `node dist/main/gameIpcHandlers.test.js`
- `node dist/main/game-actions/meleeInterceptCandidates.test.js`

All must pass before refactor starts.

---

## 2. Extract Ready Sub-Pipeline Modules

1. Split `ready()` orchestration into helper modules by responsibility:
   - movement/ranged pre-melee prep,
   - candidate/pause creation,
   - resume/decision validation,
   - finalization after melee.
2. Keep public signatures stable:
   - `ready(...)`
   - `resolveMeleeIntercept(...)`
3. Do not alter rule logic; only move and delegate.

Verify:
- `npm run build:main`

---

## 3. Consolidate Shared Guards

1. Centralize duplicated guard checks:
   - db initialized,
   - tactical active gate,
   - pending snapshot existence,
   - token/turn-state validation.
2. Preserve current error strings unless clearly buggy.

Verify:
- `npm run build:main`
- `npm run lint`

---

## 4. Preserve Logging + Comments

1. Ensure every new/updated public backend method logs debug invocation.
2. Ensure getter-style methods log trace invocation.
3. Ensure caught exceptions log error.
4. Add orienting comments for all new/updated fields and non-overriding methods.

Verify:
- lint clean
- spot-check diffs for comments and log calls

---

## 5. Phase Exit Verification

Run:
- `npm run build:main`
- `npm run lint`
- `node dist/main/combatResolution.test.js`
- `node dist/main/gameIpcHandlers.test.js`
- `node dist/main/game-actions/meleeInterceptCandidates.test.js`
- `node dist/main/game-actions/meleeInterceptFogMerge.test.js`
- `node dist/main/tacticalBattle/computeTacticalBattleSnapshot.db.test.js`

---

## 6. Hard Stop Conditions

Stop and report if any occurs:
1. Need IPC contract changes to proceed.
2. Behavior drift in Fight/Ignore semantics.
3. Turn phase/number mutates differently than baseline.
4. Broad edits needed outside `gameActions` + `game-actions`.

---

## 7. Definition of Done

1. `gameActions.ts` is materially smaller and primarily orchestration.
2. Ready pause/resume logic is delegated to focused helpers.
3. Behavior unchanged for Ready + melee intercept flows.
4. Verification commands pass.

