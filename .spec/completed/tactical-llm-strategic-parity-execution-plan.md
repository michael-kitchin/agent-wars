# Execution Plan: Tactical LLM Cadence and Parity with Strategic

*Audience: implementers, including lower-capability coding agents. Goal: make tactical Run / event-driven opponent planning **as reliable and understandable** as strategic Ready consultation, while keeping changes **reviewable in small merges**.*

**Parity principle:** Strategic and tactical should match **where rules and UX allow**; document intentional differences (res4 footprint, movement budgets, no melee intercept, etc.) in code comments near the branch—not only in this spec.

---

## 0. Executive summary

**Problem (historical baseline):** Tactical opponent plans used to run on a **different cadence** than strategic AI orders (prefetch between beats, optional skipped post-beat consultation, and **deferred** `postResolutionConsultPush` after commit). Opponent “activity” for gating **under-counted** ranged-only beats; tactical `requestOrdersFlow` initially omitted standing-order merge when `tacticalAiBattle` was set.

**Direction (shipped in repo default):** Post-beat consultation is **awaited inside** `commitHumanTacticalDraftOrders` IPC; **`postResolutionConsultPush` is removed**; merge fields use `TacticalPostBeatConsultFields` / `toTacticalPostBeatConsultFields`; renderer applies side effects via `applyTacticalPostBeatConsultSideEffects` on the commit return. Remaining checklist items below are for **verification**, follow-up observability (Phase 2), or optional Phase 6 work—not for reintroducing the push path.

---

## 1. Purpose, success criteria, non-goals

### 1.1 Goals

1. **Cadence parity (primary):** When Run + event-driven consultation are on, tactical opponent orders for beat *N* should not systematically rely on a model call that only saw **pre–human-move** state for beat *N*. **Locked:** **await** post-beat consultation inside the tactical **commit** IPC before return, same idea as strategic `game:ready` (§8.1, §8.3, §8.5).

2. **Consultation gating parity:** `afterTacticalBeatResolution` should not skip LLM consultation solely because the opponent **did not march** if they **did** resolve ranged / air / melee relevant actions in the same beat (align with strategic richness where feasible).

3. **Standing-order parity (mandatory):** Opponent **standing-order** movement/ranged merge in `requestOrdersFlow` must apply in **tactical** the same way as strategic (subject to res4 validation—invalid rows drop with reasons like today). **Telemetry** (Phase 2) remains recommended to separate model omission vs validator drops.

4. **Future maintainability:** Each touched public backend entry follows repo logging policy; new helpers have **orienting comments**; tests lock **contracts** not incidental layout.

### 1.2 Explicit non-goals

- Rewriting the full OpenRouter tool loop or changing model vendors.
- Changing **strategic** Ready consultation semantics except where a shared helper must move for DRY (prefer tactical-only or shared-with-clear-branching).
- Product commits: this document does **not** authorize `git commit` / push (per project owner policy).

### 1.3 “Done” for the full program (mandatory phases 0–3, 5 + optional 2, 4, 6)

- [x] Tactical post-beat consultation is **awaited inside `commitHumanTacticalDraftOrders` IPC** (same ordering idea as strategic `game:ready`); timeout uses **`POST_RESOLUTION_CONSULT_TIMEOUT_MS`** **exported** from `gameIpcHandlers.ts` and imported in `main.ts`. **Locked (§8.6):** do **not** introduce a separate shared timeout module unless a future circular-dependency forces it—prefer export from `gameIpcHandlers.ts`.
- [x] **`postResolutionConsultPush`** and renderer listener / `channels.ts` entry removed (**hard cutover**, §8.3); no dual-path or “compat no-op” push.
- [ ] Unit tests cover expanded tactical activity predicates and consultation skip/invoke boundaries.
- [ ] Standing-order merge **on** for tactical: tests prove merge + dedupe parity with strategic patterns where applicable.
- [ ] Manual smoke checklist (§6) passes on a dev build with Run + Events on.
- [ ] **Lint:** `npm run lint` (or `npx eslint` on touched paths) passes.
- [ ] **Full test suite** when feasible: `npm test` (requires native rebuild per `package.json`; document skip reason if CI/agent cannot load `better-sqlite3`).
- [x] No regression in annihilation / Ready-disable behavior; **`tacticalDeferredPostBeatConsultPending` removed** (no latch—commit IPC awaits consult). If a future animation slice needs a latch, add a **new** named flag with JSDoc; do not resurrect the old symbol.
- [ ] Phase 2 (observability) is **recommended** but not strictly required for “done”; if omitted, add a follow-up ticket.

---

## 2. Baseline references (read before coding)

| Topic | Strategic (reference) | Tactical (shipped) |
|--------|-------------------------|------------------|
| Post-resolution LLM | `handleGameReady` **awaits** `runEventDrivenAfterResolutionConsultation` | `commitHumanTacticalDraftOrders` IPC **awaits** `runEventDrivenAfterTacticalBeatConsultation` before return (no push) |
| Opponent buffer | DB pending orders / IPC payload | Renderer `S.tacticalOpponentDraft` from commit IPC + prefetch; **no** `postResolutionConsultPush` |
| Idle / observable policy | `afterResolution` + rich `ReadyResult` slice | `afterTacticalBeatResolution` + `TacticalCommitResolutionPlayback` + `consultationPolicy.ts` (incl. ranged/air submission flags) |
| Standing orders in `requestOrders` | Merged when strategic | **Not merged in tactical** — AI and human use explicit orders only; `assign_order`/`cancel_order`/`query_orders` blocked or hidden |
| Precomputation | Can be on for strategic | **Forced off** when `tacticalAiBattle` set |

**Key files (extend as you touch code):**

- `src/main/openrouter/consultationPolicy.ts` — `opponentHadTacticalBeatResolutionActions`, `humanHadTacticalBeatResolutionActions`, `computePostResolutionConsultTriggers`.
- `src/main/openrouter/afterResolution.ts` — `afterTacticalBeatResolution`, `buildTacticalBeatResolutionReadyParticipants`.
- `src/main/gameActions.ts` — `commitHumanTacticalDraftOrders` playback construction (`opponentMoves`, ranged fields).
- `src/main/main.ts` — IPC handler for `commitHumanTacticalDraftOrders` (**awaits** `runEventDrivenAfterTacticalBeatConsultation`, merges via `toTacticalPostBeatConsultFields`).
- `src/main/ipc/readyIpcResolutionMapping.ts` — `runEventDrivenAfterTacticalBeatConsultation`, `toTacticalPostBeatConsultFields`.
- `src/renderer/gameplay/readyHandler.ts` — tactical commit; applies `TacticalPostBeatConsultFields` through `applyTacticalPostBeatConsultSideEffects` when present on the invoke result.
- `src/renderer/tactical/applyTacticalPostBeatConsultSideEffects.ts` — shared merge for post-beat consult fields (replaces former push listener body).
- `src/renderer/openRouter/openRouterControls.ts` — OpenRouter UI init (**no** `registerPostResolutionConsultPushListener`).
- `src/renderer/openRouter/openRouterRuntime.ts` — `startBackgroundRequestIfAllowed`, timeouts.
- `src/shared/ipc/tacticalOpponentPlanMerge.ts` — `nextTacticalOpponentDraftAfterPostBeatPlan` (commit-return merge path).
- `src/main/tacticalOpponentPlanPostBeatMerge.test.ts` — update contract tests when merge entry point changes.
- `src/shared/ipc/readyTypes.ts` — `TacticalPostBeatConsultFields`, `TacticalPostBeatConsultMergeSource` (IPC surface; push payload type removed).
- `src/main/preload.ts` — tactical commit return typed as `CommitHumanTacticalDraftOrdersIpcResult` (**no** push listener).
- `src/main/openrouter/requestOrdersFlow.ts` — standing-order merge branch, tactical validation.
- `src/main/gameIpcHandlers.ts` — `handleRequestAiOrders` (tactical annihilation gate, etc.); **`export const POST_RESOLUTION_CONSULT_TIMEOUT_MS`** (§8.6) for `main.ts` import.

---

## 3. Engineering principles (mandatory for all agents)

1. **One phase per PR** where possible; do not mix “policy tests” with “IPC await refactor” in the same merge unless unavoidable—then split commits inside the PR with clear messages.
2. **Tests before or with behavior change:** For consultation gating, add or extend tests in `afterResolution.tacticalBeat.test.ts`, `afterResolutionConsultationGates.test.ts`, or focused new `*.test.ts` under `src/main/openrouter/`—**no** new tests that only assert log string equality unless the log is a stable contract (prefer return shape / call counts).
3. **Logging:** New/updated **public** backend entry points: **debug** on normal entry, **error** in `catch`, **trace** for pure getters; include structured fields (`battleId`, `turnNumber`, `reason`, counts)—see project user rules.
4. **Orienting comments:** New non-trivial fields and non-overriding methods: **why, when, expected outcome, exceptions** (project user rules).
5. **File size:** If a file approaches **600 lines**, extract helpers to a sibling module (e.g. `tacticalConsultationPlayback.ts`) rather than growing monoliths.
6. **Do not commit or push** unless the repo owner explicitly asks; prepare diffs for review.

### 3.1 Compliance crosswalk (project user rules)

| Rule | How this plan enforces it |
|------|---------------------------|
| Specs in `.spec` | This document lives under `.spec/` per project convention. |
| Logging (debug / error / trace) | §3 item 3; Phase 2 reinforces consult skip reasons. |
| Orienting comments | §3 item 4; Phase 1 / 5 require comments on new helpers. |
| Tests: happy path + essential failures | §3 item 2; testing matrix §5; avoid brittle log assertions. |
| File size ~600 / hard 1000 | §3 item 5; split modules if tactical IPC refactor swells files. |
| No commit/push from agent | §3 item 6; §1.2 non-goals. |

---

## 4. Phases (mandatory and optional)

Each phase lists **objectives**, **work**, **verification**, and **dependencies**.

---

### Phase 0 — Baseline inventory and trace checklist *(mandatory, read-only + doc)*

**Objectives:** Ensure the next agent does not reverse-engineer from memory.

**Work:**

1. Produce a short **internal** appendix (can live at the bottom of this file or a linked `tactical-llm-parity-baseline-notes.md` in `.spec/`) listing:
   - **Current** exact call order (before Phase 3): renderer `commit` → main `commitHumanTacticalDraftOrders` → `setImmediate` → `runEventDrivenAfterTacticalBeatConsultation` → `webContents.send(postResolutionConsultPush)`.
   - **Target** call order (after Phase 3): same handler **awaits** consult → returns payload with plan fields → **no** push.
   - Where `S.tacticalDeferredPostBeatConsultPending` is set and cleared (grep); note removal plan after cutover.
   - Where `startBackgroundRequestIfAllowed` is invoked for tactical.
2. Add **no production code** in this phase unless you find a **factual error** in comments—then fix comment only.

**Verification:**

- [ ] Appendix exists and references real file paths and symbols (copy from grep).
- [ ] `npm run build:main` passes (confirms repo still builds).

**Dependencies:** None.

---

### Phase 1 — Tactical consultation activity predicates *(mandatory)*

**Objectives:** Stop incorrect **skip** of `afterTacticalBeatResolution` when the opponent (or human) had meaningful beat actions that are **not** represented in `opponentMoves` / noop-filtered human marches.

**Work:**

1. Extend detection used by `opponentHadTacticalBeatResolutionActions` and/or `humanHadTacticalBeatResolutionActions` (or introduce **pure** helpers in `consultationPolicy.ts` fed by `TacticalCommitResolutionPlayback` + `TacticalBattleSnapshot` + optional `TacticalOpponentPlanPayload` / draft slice) so that **at minimum**:
   - Opponent **ranged or air strike rows present in the committed opponent draft** that were applied this beat count as opponent activity **if** the resolution engine used them (align with how `gameActions.ts` builds `rangedCombatHexes` / removal—use existing playback fields; do not invent parallel combat).
   - Opponent **melee participation** if playback exposes it in a way already used for mandatory evaluation—stay consistent with `buildTacticalBeatResolutionReadyParticipants` / `evaluateTacticalMandatoryOverrides`.
2. Keep functions **pure** in `consultationPolicy.ts` where possible; if DB reads are ever needed, stop and split to a different phase (prefer not).
3. Add **orienting comments** on new helpers explaining the asymmetry vs strategic `ReadyResult`.

**Verification:**

- [ ] `npm run build:main` passes.
- [ ] `node dist/main/openrouter/afterResolution.tacticalBeat.test.js` passes (after `npm run rebuild:native:node` if sqlite mismatch—see `package.json` `test` script).
- [ ] New or updated tests demonstrate: **before** behavior that wrongly skipped / invoked consult is now **fixed** (name tests after the bug: e.g. “opponent ranged without march still counts as active”).

**Dependencies:** Phase 0 recommended but not strictly required.

---

### Phase 2 — Consultation skip / invoke observability *(optional, recommended before Phase 3)*

**Objectives:** Make production diagnosis trivial for “why no LLM this beat.”

**Work:**

1. In `afterTacticalBeatResolution`, when returning early (annihilation, no model/key, `!shouldConsult`, etc.), emit **one** `logDebug` line with a **stable machine-readable `reason` key** (string enum style: `skip_annihilation`, `skip_no_should_consult`, …) and numeric counters (mandatory count, subscription count, flags).
2. **Renderer (only if useful after Phase 3 order):** If Phase 2 is implemented **after** Phase 3 removes the push, log from **`readyHandler.ts`** (or equivalent) when applying **commit-return** consultation fields (e.g. attach-false / empty plan), not from a push listener. If Phase 2 ships **before** Phase 3, do **not** add push-specific log text that will be deleted immediately—prefer main-only `logDebug` until push is gone.

**Verification:**

- [ ] Manual: one tactical beat where consult is skipped produces the new debug line in main log (document how to enable debug in `.spec` appendix or point to existing logger config).
- [ ] No new PII in logs; no full snapshot dumps.

**Dependencies:** Phase 1 complete (so reasons align with new predicates).

---

### Phase 3 — Await tactical post-beat consultation in IPC *(mandatory for “strategic parity”)*

**Objectives:** Match strategic **ordering contract**: renderer should not treat “commit returned” as “safe to plan next beat AI” until post-beat consultation **finishes or fails** under timeout—**same process** as `handleGameReady` awaiting consultation.

**Work (high level — implementer must read current code before editing):**

1. **Main:** In `main.ts` `commitHumanTacticalDraftOrders` handler, replace `setImmediate` fire-and-forget with **`await runEventDrivenAfterTacticalBeatConsultation(...)`** inside the same `async` IPC handler **before** returning success to the renderer **only under the same conditions that today schedule deferred consult** (`result.success`, `tacticalBattle`, `tacticalResolutionPlayback`, `useEventDrivenConsultation`, `aiPlanningRunEnabled`—see existing early `return result`). When **either** event-driven is off **or** Run is off, return `result` **immediately** with **no** extra await (preserve non–event-driven behavior). **Fast return (§8.7):** when consultation is **not** entered (includes no model/key / `afterTacticalBeatResolution` early skips—same as today’s “no network” paths), the IPC must **not** block for the full 120s; only **`await`** when the consultation pipeline actually runs. Merge consultation results into the **IPC return payload** (`tacticalOpponentPlan`, `aiStrategy`, `toolInvocationCounts`, `attachTacticalOpponentPlanToIpc` semantics)—**without** breaking the annihilation “no LLM” early exit from prior work.
2. **Timeout:** **`export`** `POST_RESOLUTION_CONSULT_TIMEOUT_MS` from `gameIpcHandlers.ts` and **`import`** it in `main.ts` for `runEventDrivenAfterTacticalBeatConsultation` (§8.6). Replace the literal **`120_000`**—**do not** introduce a divergent tactical-only timeout or a duplicate constant file unless TypeScript proves an unbreakable import cycle (then document exception in PR).
3. **Hard cutover (§8.3):** **Delete** the `postResolutionConsultPush` path entirely: `main.ts` (`webContents.send`), `channels.ts`, `preload.ts` (`ipcRenderer.on` + `registerPostResolutionConsultPushListener`), `gameApiTypes.ts`, `openRouterControls.ts` listener registration, and **comments** in `gameIpcHandlers.ts` / `state.ts` that describe the push as tactical transport. **Repurpose** `tacticalOpponentPlanMerge.ts` / tests so merge logic applies to **commit IPC payload** (and prefetch path if still needed)—do not leave dead “deferred push” names in exported APIs (`PostResolutionConsultPushPayload` → rename, e.g. `TacticalPostBeatConsultIpcFields` or extend existing commit result type).
4. **Renderer:** Update `readyHandler.ts` so consultation fields come **only** from the commit IPC return (same shape the push used to carry). Remove or **delete** `tacticalDeferredPostBeatConsultPending` if nothing else needs it; if one narrow case remains (e.g. animation), rename + document—**do not** leave dead state.
5. **Renderer:** Ensure Ready / Run UI state cannot unlock incorrectly during await (align with strategic `readyRequestInFlight` / tactical commit in-flight patterns).
6. **Tests:** Update any tests that assumed deferred push; grep the repo for `postResolutionConsult` / `PostResolutionConsult` and clean all references.
7. **Documentation drift:** Update JSDoc and comments that describe tactical commit as **returning before** post-beat consult (e.g. `src/renderer/openRouter/aiPlanningState.ts` `isWaitingForPrecomputedAiOrders`, `src/main/gameIpcHandlers.ts` notes contrasting strategic await vs tactical push). After Phase 3, tactical event-driven consult is **awaited in the commit IPC**—comments must match to avoid misleading the next developer.

**Verification:**

- [ ] `npm run build:main` + `npm run build:renderer` pass; `npm run lint` on touched paths.
- [ ] `node dist/main/gameIpcHandlers.test.js` passes; `node dist/main/tacticalOpponentPlanPostBeatMerge.test.js` passes after merge-helper changes.
- [ ] Tactical beat tests pass.
- [ ] Grep shows **no** remaining `postResolutionConsultPush` / `registerPostResolutionConsultPushListener` (unless a different feature reuses the name—then rename to avoid confusion).
- [ ] **Manual smoke §6.1** (event-driven Run, two beats): opponent draft updates from **commit IPC only**; no double application of `tacticalOpponentPlan`.
- [ ] **Manual smoke §6.2** annihilation: still no LLM after terminal roster; no stuck Ready.

**Dependencies:** Phases 1–2 (2 optional) strongly recommended before this merge.

**Risk note:** IPC may block up to **120s** during consultation—**accepted** (§8.1). Renderer must keep the user informed (same quality bar as strategic Ready).

---

### Phase 4 — Prefetch invalidation *(optional)*

**Objectives:** If human edits orders after prefetch started, avoid applying **stale** `tacticalOpponentDraft` at commit without forcing an extra manual toggle.

**Work:**

1. Define a **cheap fingerprint** of the human tactical draft (sorted march targets + ranged ids + strikes + ferry + embark) in renderer state.
2. When fingerprint changes while `backgroundRequestInFlight`, call `cancelRequestAiOrders` and/or ignore stale results when fingerprint differs at response time.
3. Document race: prefetch may complete after cancel—**must** discard mismatched fingerprint responses.

**Verification:**

- [ ] Manual: change march destination after AI prefetch started; commit uses **no** stale opponent plan (assert via log or UI).

**Dependencies:** Phase 3 recommended so await path is primary; prefetch becomes “optimization only.”

---

### Phase 5 — Standing-order merge for tactical *(mandatory)*

**Objectives:** **Strategic parity:** opponent standing-order movement/ranged from `generateOrdersForStandingOrders` must merge into tactical `requestOrders` the same way as when `!tacticalBattle` (`requestOrdersFlow.ts` branch today). Product owner **requires** standing orders in tactical (§8.2).

**Work:**

1. **Design note:** Standing orders are defined on **strategic** unit ids; tactical uses **sub-unit** ids. Reuse or extend the existing tactical projection path so standing orders map to the correct **opponent sub-units** inside the res4 battle (same mental model as other tactical order validation—**do not** silently apply strategic-hex destinations that fall outside the tactical footprint).
2. Remove the `!tacticalBattle` guard that zeroes standing-order merge for tactical; implement merge + **the same dedupe precedence** as strategic (LLM wins per unit for movement; mirror ranged dedupe).
3. Add tests: tactical fixture with standing orders + LLM rows proves merged output and validator drops invalid tactical rows with clear drop reasons.

**Verification:**

- [ ] `npm run build:main` passes; OpenRouter / tactical order tests pass.
- [ ] Manual: opponent with standing ranged behaves in tactical similarly to strategic expectation (within res4 rules).

**Dependencies:** Phase 1 minimum; **Phase 3 recommended** so consultation latency dominates less than prefetch races.

**Note:** No feature flag—**on** by default after this phase ships (per §8.2).

---

### Phase 6 — Tactical “light” precomputation *(optional)*

**Objectives:** Reduce wall-clock for tactical `requestAiOrders` without full strategic precompute.

**Work:**

1. Spike: measure which tool groups dominate tactical latency (logs).
2. If feasible, introduce a **tactical-only** reduced tool allowlist or cached briefing segment under a flag—**default off**.

**Verification:**

- [ ] Benchmark notes in `.spec` appendix (before/after ms, same model).

**Dependencies:** Phase 3 (so consult is awaited and user-visible latency matters).

---

## 5. Testing matrix (minimum)

| Area | Automated | Manual |
|------|-----------|--------|
| Consultation predicates | `afterResolution.tacticalBeat.test.ts`, consultation gate tests | — |
| IPC await / no double merge | Extend `gameIpcHandlers.test.ts` or tactical commit tests if present | §6.1 |
| Annihilation / no LLM | Existing annihilation + handler tests | §6.2 |
| Prefetch cancel | Optional unit test with mocked `requestAiOrders` | §6.3 |
| Standing merge (tactical) | Unit tests + tactical validation drops | §6.4 |

---

## 6. Manual smoke procedures

### 6.1 Event-driven two-beat cadence

1. New skirmish, enter tactical, enable **Run** + **Events** tool group, set model/key.
2. Beat A: issue human marches only; Ready; observe opponent plan applied for beat B from **same** Ready round-trip (after Phase 3, no “one beat late” feel).
3. Beat B: confirm opponent reacts to **post–beat-A** positions.

### 6.2 Annihilation

1. End tactical on terminal roster; confirm **no** OpenRouter traffic after modal (existing product intent).

### 6.3 Prefetch stale (Phase 4)

1. Slow network or throttle; start prefetch; **change** human draft before Ready; commit; confirm opponent buffer not from stale response.

### 6.4 Standing orders in tactical (Phase 5)

1. Configure opponent standing orders on strategic parent units that have sub-units in an active tactical battle.
2. Enter tactical with Run on; confirm merged plan includes standing-order rows where valid at res4; confirm LLM overrides on conflict match strategic dedupe behavior.

---

## 7. Recommended phase order (for implementers)

Execute **0 → 1 → (2) → 3 → 5 → (4) → (6)** unless a dependency forces otherwise:

| Order | Phase | Rationale |
|-------|-------|-----------|
| 1 | 0 | Baseline doc reduces wrong edits. |
| 2 | 1 | Predicate fixes are small, test-only risk; improves consult correctness before await. |
| 3 | 2 | Optional; if done, do **main-only** logging first if Phase 3 lands same sprint (see Phase 2 work item). |
| 4 | 3 | Hard cutover + await; largest merge—after predicates stable. |
| 5 | 5 | Standing merge touches `requestOrdersFlow` (prefetch + consult both call `requestAiOrders`); can ship after 3 so behavior is easier to smoke-test. |
| 6 | 4 | Prefetch invalidation is optional polish once await reduces stale-consult pain. |
| 7 | 6 | Optional performance spike last. |

**Note:** Phase 5 **could** be parallelized with Phase 3 in separate PRs if touch different files and both pass `npm test`; the order above minimizes integration risk.

---

## 8. Locked stakeholder decisions *(2026 — product owner)*

| ID | Decision | Implication for implementers |
|----|-----------|-------------------------------|
| **8.1** | **Yes** — `commitHumanTacticalDraftOrders` IPC **may block** for up to the consultation timeout while the model runs. | Match strategic UX expectations (busy state, no premature Ready); Phase 3 is approved. |
| **8.2** | **Standing orders in tactical are required** (not optional). | Phase 5 is **mandatory** for program completion; implement merge + sub-unit mapping; **no** permanent feature flag to leave merge off. |
| **8.3** | **Hard cutover** — unreleased software; **remove** `postResolutionConsultPush` and related glue; **no** dual-path, deprecation period, or compat no-op push. | Delete channel, preload listener, renderer registration, and unused state; grep-clean the repo. |
| **8.4** | **Yes** — tactical post-beat consultation uses the **same** timeout as strategic (**120s** today, `POST_RESOLUTION_CONSULT_TIMEOUT_MS` in `gameIpcHandlers.ts`). | **`export`** the constant from `gameIpcHandlers.ts`; **`import`** in `main.ts`; replace `120_000` literal; document at `runEventDrivenAfterTacticalBeatConsultation` call sites. |
| **8.5** | Consultation results delivery | **IPC return payload only** (same as §8.3—no push duplication). |
| **8.6** | **Timeout constant location** | **Prefer `export` from `gameIpcHandlers.ts`** for `main.ts` (product owner). Do not add `consultationTimeouts.ts` unless an import cycle is proven unavoidable. |
| **8.7** | **No-key / no-consult fast return** | When post-beat consultation **does not run** (e.g. no API key, no model, annihilation roster, or `!shouldConsult` with no LLM invocation), `commitHumanTacticalDraftOrders` must return **without** waiting the full **120s** timeout. **Only `await`** the consultation `Promise.race` when an LLM-backed consult is actually scheduled—mirror strategic “skip consult” fast paths. |

---

## 9. Residual notes (non-blocking)

1. **Multi-window:** If the game ever uses multiple `BrowserWindow` instances, ensure tactical commit IPC targets the same window as today’s `invoke` response (push removal eliminates `webContents.send` concern).

---

## 10. Rollback strategy

- Each phase should remain a **git revert**–friendly merge when possible.
- **No** long-lived feature flag for “deferred vs awaited” push—hard cutover (§8.3). Rollback is **revert the merge** (or restore branch), not runtime toggles.
- Optional: during development only, a **local** branch flag is acceptable; it must **not** ship to the repository default branch.

---

## 11. Appendix — Optional baseline note template

```markdown
## Baseline note (Phase 0)

### Tactical commit → consult (current)
1. …
### tacticalDeferredPostBeatConsultPending *(removed)*
- **Historical:** Renderer used this latch while main sent `postResolutionConsultPush` after commit. **Current:** latch deleted; `commitHumanTacticalDraftOrders` awaits consultation on main before the invoke resolves.
### Background prefetch
- …
```

*(Implementer: fill during Phase 0.)*

---

*End of execution plan.*
