# Phase 4 Implementation Checklist (IPC Types Modularization)

Source plan: `.spec/maintainability-consolidation-execution-plan.md` (Phase 4).

---

## Global Guardrails

1. Never commit or push changes.
2. Preserve runtime behavior and wire contracts.
3. If payload/channel shape changes are required, stop and request approval.

---

## 0. Scope Lock

### In-scope
- `src/shared/ipcTypes.ts`
- new files under `src/shared/ipc/` (or equivalent folder)
- import updates in main/renderer as needed

### Out-of-scope
- runtime behavior changes
- IPC channel renames
- payload shape changes

---

## 1. Baseline

Run:
- `npm run build:main`
- `npm run build:renderer`
- `npm run lint`

---

## 2. Create Domain Type Files

1. Split monolithic type file into domain modules, example:
   - `gameStateTypes.ts`
   - `readyTypes.ts`
   - `ordersTypes.ts`
   - `tacticalTypes.ts`
2. Preserve symbol names and comments exactly where practical.
3. Create barrel export (single import surface) for compatibility.

Verify:
- `npm run build:main`
- `npm run build:renderer`

---

## 3. Migrate Imports Safely

1. Update imports incrementally.
2. Keep backward-compatible exports in `ipcTypes.ts` during transition.
3. After compile is green, optionally collapse to final import style.

Verify:
- compile remains green after each import batch

---

## 4. Documentation + Logging Policy Check

1. Ensure orienting comments persist through moved declarations.
2. This phase should not introduce new runtime methods, so logging changes should be minimal.

---

## 5. Phase Exit Verification

Run:
- `npm run build:main`
- `npm run build:renderer`
- `npm run lint`
- `node dist/main/gameIpcHandlers.test.js`
- `node dist/main/rendererConsolidation.test.js`

---

## 6. Hard Stop Conditions

Stop and report if:
1. Any payload wire shape must change to complete split.
2. Circular import issues require behavioral edits.
3. Generated static bundle breaks due to unresolved import strategy.

---

## 7. Definition of Done

1. IPC types are modularized by domain.
2. External import surface remains stable.
3. No runtime behavior changes.
4. Build/lint/tests pass.

