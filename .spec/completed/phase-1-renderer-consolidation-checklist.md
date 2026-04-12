# Phase 1 Implementation Checklist (Renderer Consolidation)

*Operational checklist for a lower-quality coding agent to execute Phase 1 safely and verifiably.*

Source plan: `.spec/maintainability-consolidation-execution-plan.md` (Phase 1).

---

## Global Guardrails

1. Never commit or push changes.
2. Do not change runtime behavior in this phase.
3. If scope expansion is required, stop and request approval.

---

## 0. Scope Lock (Do Not Skip)

This phase only refactors renderer structure. It must **not** change game rules or IPC contracts.

### In-scope files

- `src/renderer/renderer.ts`
- `src/renderer/tactical/*` (new/existing helper modules)
- `src/renderer/gameplay/*` (new/existing helper modules)
- `src/renderer/rendering/*` only if needed for extracted tooltip helpers

### Out-of-scope files

- `src/main/*`
- `src/shared/*` contracts
- any DB logic

If you need to touch out-of-scope files, stop and request approval.

---

## 1. Baseline Snapshot

1. Run:
   - `npm run build:renderer`
   - `npm run lint`
2. Confirm these pass before edits.
3. Record current tactical/melee manual behavior:
   - Ready with no intercept candidates -> no modal.
   - Ready with intercept candidates -> modal appears.
   - Fight -> tactical auto-start.
   - Ignore -> normal strategic resolution.

If baseline is red, stop and fix baseline first.

---

## 2. Extract Tactical Entry/Start Flow

Goal: make `renderer.ts` delegate tactical battle start wiring.

1. In `renderer.ts`, identify these responsibilities:
   - start tactical battle from res1 hex
   - apply start result side-effects (snapshot, sidebar, map mode, HUD)
   - restored tactical session activation path
2. Move behavior into `src/renderer/tactical/` helper module(s), for example:
   - `tacticalEntryFlow.ts`
   - (or extend `tacticalIpcHandlers.ts` if already present)
3. Keep `renderer.ts` with only:
   - import
   - thin wrapper callback wiring
4. Preserve all existing toasts/messages.

### Verify

- `npm run build:renderer`
- ensure no new TypeScript errors

---

## 3. Extract Melee-Intercept Ready Glue

Goal: move ready/modal tactical glue out of `renderer.ts` and keep orchestration in `readyHandler.ts` + helpers.

1. Confirm `readyHandler.ts` owns:
   - awaiting-melee-decision branch
   - modal open/resolve flow
   - tactical auto-start call after successful ready resolve
2. If still duplicated in `renderer.ts`, extract to `src/renderer/gameplay/*` helper(s).
3. Keep API boundary stable:
   - deps object passed into ready handler remains explicit.

### Verify

- `npm run build:renderer`
- `npm run lint`

---

## 4. Extract Tooltip/Hex HTML Reuse Point

Goal: isolate shared formatter for melee modal row “Hex (tooltip view)” content.

1. Identify code in `renderer.ts` that builds res1 tooltip-equivalent HTML.
2. Move to a reusable helper module (or existing tooltip module).
3. Ensure modal still calls shared formatter (no duplicate template strings).

### Verify

- `npm run build:renderer`
- manual check: tooltip-style row content remains unchanged

---

## 5. Orienting Comments + Logging Compliance Pass

1. For every new/updated field and non-overriding method:
   - add/update orienting comments in project style.
2. Ensure renderer-side try/catch paths keep meaningful error logs.
3. Do not remove useful existing diagnostics.

### Verify

- `npm run lint`
- scan diffs for undocumented new methods/fields

---

## 6. Regression Verification (Phase Exit)

Run in order:

1. `npm run build:renderer`
2. `npm run build:main` (guard against accidental cross-layer type breakage)
3. `npm run lint`
4. `node dist/main/rendererConsolidation.test.js` (after build)

Manual smoke checks:

1. Ready with candidate hexes -> modal appears, Fight disabled until selection.
2. Select row + Fight -> strategic resolution finishes, tactical auto-start occurs.
3. Ignore -> strategic melee resolves normally, no tactical auto-start.
4. Tactical exit still returns to strategic UI without broken sidebar/HUD state.

If any check fails, fix before ending phase.

---

## 7. Hard Stop Conditions

Stop immediately and report if any occurs:

1. Need to change `src/shared/ipcTypes.ts` contract shapes.
2. Need to change main-process behavior to complete renderer extraction.
3. Tactical/melee behavior changes unexpectedly during manual smoke checks.
4. Build/lint failures require broad unrelated edits.

---

## 8. Definition of Done (Phase 1)

Phase 1 is complete only if all are true:

1. `renderer.ts` is meaningfully smaller and mostly wiring/composition.
2. Tactical entry/start logic is delegated to tactical module(s).
3. Melee-intercept-ready glue is delegated to gameplay helper(s).
4. Shared tooltip-html generation is centralized (no duplicated format strings).
5. Build/lint/tests and manual smoke checks pass.

