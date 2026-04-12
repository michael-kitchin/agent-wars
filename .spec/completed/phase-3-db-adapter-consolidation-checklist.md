# Phase 3 Implementation Checklist (DB Adapter Consolidation)

Source plan: `.spec/maintainability-consolidation-execution-plan.md` (Phase 3).

---

## Global Guardrails

1. Never commit or push changes.
2. Preserve DB behavior and public APIs in this phase.
3. If schema migration is needed, stop and request approval.

---

## 0. Scope Lock

### In-scope
- `src/main/gameDb.ts`
- `src/main/game-db/*` (new/existing adapters/helpers)
- tactical persistence DB bridge modules if needed

### Out-of-scope
- gameplay rules
- renderer-side refactors
- OpenRouter orchestration

---

## 1. Baseline

Run:
- `npm run build:main`
- `npm run lint`
- `node dist/main/gameDb.test.js`
- `node dist/main/tacticalBattle/computeTacticalBattleSnapshot.db.test.js`

---

## 2. Extract Focused Adapters

1. Move cohesive DB concerns out of `gameDb.ts`:
   - game-config key/value helpers,
   - tactical session persistence DB operations,
   - snapshot merge helpers.
2. Keep `gameDb.ts` as stable façade (same exports).
3. Maintain current SQL and transaction behavior.

Verify:
- `npm run build:main`

---

## 3. Keep API Compatibility

1. Do not rename exported `gameDb.ts` public functions in this phase.
2. If moving internals, use delegating wrappers.
3. Add temporary re-exports only if needed; mark for later cleanup.

Verify:
- TypeScript compile with no import breakages

---

## 4. Logging + Comments Compliance

1. Public methods: debug invocation logs.
2. Getter-style non-mutating methods: trace logs.
3. Catches: error logs.
4. Orienting comments for new/updated fields and non-overriding methods.

---

## 5. Phase Exit Verification

Run:
- `npm run build:main`
- `npm run lint`
- `node dist/main/gameDb.test.js`
- `node dist/main/tacticalBattle/computeTacticalBattleSnapshot.db.test.js`
- `node dist/main/tacticalBattle/tacticalBattleSession.test.js`

---

## 6. Hard Stop Conditions

Stop and report if:
1. DB schema migration becomes necessary.
2. Any `gameDb.ts` public API signature change is required.
3. Existing corruption recovery behavior changes.

---

## 7. Definition of Done

1. `gameDb.ts` complexity reduced through delegation.
2. Tactical persistence and snapshot merge paths remain stable.
3. No behavior drift in DB tests.
4. Verification commands pass.

