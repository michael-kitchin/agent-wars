# Phase 7 Implementation Checklist (Test Fixture Consolidation + Final Stabilization)

Source plan: `.spec/maintainability-consolidation-execution-plan.md` (Phase 7).

---

## Global Guardrails

1. Never commit or push changes.
2. Preserve runtime behavior; test refactors must remain contract-focused.
3. If cleanup requires behavior changes, stop and request approval.

---

## 0. Scope Lock

### In-scope
- test fixtures and helpers under:
  - `src/main/tacticalBattle/testSupport/*`
  - melee/tactical-related `*.test.ts`
- limited cleanup of temporary compatibility shims from earlier phases

### Out-of-scope
- feature behavior changes
- broad production-code rewrites

---

## 1. Baseline

Run:
- `npm run build:main`
- `npm run build:renderer`
- `npm run lint`
- `npm test`

---

## 2. Consolidate Repeated Test Setup

1. Identify repeated setup/teardown in melee/tactical tests.
2. Move repeated patterns into shared fixture helpers.
3. Keep tests contract-focused (happy path + essential failure only).

Verify:
- targeted test files still pass after each consolidation batch

---

## 3. Normalize Contract Test Structure

1. Standardize naming:
   - “contract” wording for behavioral guarantees.
2. Ensure each test asserts contract outcomes, not implementation details.
3. Remove redundant test cases made unnecessary by shared helpers.

Verify:
- lint and targeted tests pass

---

## 4. Remove Transitional Shims (If Safe)

1. Remove compatibility exports/helpers created in earlier phases only if:
   - no import usage remains,
   - build/tests pass immediately after removal.
2. Remove in small increments; verify after each removal.

---

## 5. Compliance Pass

1. Ensure test helpers and moved code keep orienting comments where required.
2. Ensure new/updated backend methods touched during cleanup still obey logging policy.

---

## 6. Final Verification (Phase Exit)

Run in order:
- `npm run build:main`
- `npm run build:renderer`
- `npm run lint`
- `npm test`

If full test is environment-sensitive, document exact failing external dependency and rerun affected subsets.

---

## 7. Hard Stop Conditions

Stop and report if:
1. A cleanup requires changing runtime behavior.
2. Shim removal causes multi-module breakage beyond phase scope.
3. Full test failures are unrelated and widespread.

---

## 8. Definition of Done

1. Test fixtures are consolidated and reusable.
2. Contract tests are clearer and less duplicated.
3. Transitional refactor scaffolding is reduced/removed where safe.
4. Full verification is green (or documented external dependency blocker only).

