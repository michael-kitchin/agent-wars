# Phase 5 Implementation Checklist (OpenRouter Boundary Refactor)

Source plan: `.spec/maintainability-consolidation-execution-plan.md` (Phase 5).

---

## Global Guardrails

1. Never commit or push changes.
2. Preserve OpenRouter behavior and tool contracts.
3. If behavior-level prompt/output changes are required, stop and request approval.

---

## 0. Scope Lock

### In-scope
- `src/main/openrouter/openRouter.ts`
- `src/main/openrouter/requestOrdersFlow.ts`
- new helper modules under `src/main/openrouter/`

### Out-of-scope
- AI strategy behavior changes
- tool contract changes
- non-OpenRouter gameplay logic

---

## 1. Baseline

Run:
- `npm run build:main`
- `npm run lint`
- `node dist/main/openrouter/openRouter.matrix.test.js`
- `node dist/main/openrouter/promptContracts.test.js`
- `node dist/main/openrouter/possibleUnitActions.test.js`

---

## 2. Extract Prompt Assembly Boundaries

1. Isolate system prompt composition helpers.
2. Isolate user prompt composition helpers.
3. Keep output text semantically identical unless bugfix is explicitly approved.

Verify:
- prompt contract tests remain green

---

## 3. Extract Tool-Loop Orchestration

1. Move tool-loop state machine logic into dedicated helper(s).
2. Keep request entrypoint signature unchanged.
3. Keep cancellation/timeout semantics unchanged.

Verify:
- matrix tests green

---

## 4. Extract Response Parse + Mapping

1. Consolidate parse/validation/mapping boundaries.
2. Preserve error messages where tests or UX rely on them.
3. Keep token/cost metrics wiring intact.

Verify:
- build and OpenRouter tests pass

---

## 5. Logging + Comment Compliance

1. Public backend invocations still debug-log.
2. Getter-style methods trace-log.
3. Catch blocks error-log.
4. Orienting comments on new/updated fields/methods.

---

## 6. Phase Exit Verification

Run:
- `npm run build:main`
- `npm run lint`
- `node dist/main/openrouter/openRouter.matrix.test.js`
- `node dist/main/openrouter/promptContracts.test.js`
- `node dist/main/openrouter/possibleUnitActions.test.js`
- `node dist/main/callbackEvaluation.test.js`
- `node dist/main/callbackSubscriptions.test.js`

---

## 7. Hard Stop Conditions

Stop and report if:
1. Tool call contract shape must change.
2. Prompt JSON schema output requirements need modification.
3. Non-OpenRouter modules must be altered heavily.

---

## 8. Definition of Done

1. OpenRouter modules are significantly smaller and boundary-driven.
2. Request behavior and contracts remain stable.
3. OpenRouter test matrix remains green.

