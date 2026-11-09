# Tactical LLM parity — baseline trace (Phase 0)

*Historical baseline; superseded for commit/consult ordering — see “Current architecture” below.*

## Current architecture (Phases 3–4)

1. Renderer `handleReadyButtonClick` → `window.gameApi.commitHumanTacticalDraftOrders` (`readyHandler.ts`).
2. Main `ipcMain.handle(IPC_GAME.commitHumanTacticalDraftOrders)` awaits `runEventDrivenAfterTacticalBeatConsultation` when event-driven + Run + playback, then returns merge fields on the **same** invoke result (`main.ts`, `readyIpcResolutionMapping.ts`).
3. Renderer applies `TacticalPostBeatConsultFields` via `applyTacticalPostBeatConsultSideEffects` (`applyTacticalPostBeatConsultSideEffects.ts`); **no** `postResolutionConsultPush` channel.

## Phase 4 — tactical prefetch fingerprint

- **Fingerprint:** `buildTacticalHumanDraftPrefetchFingerprint` (`src/shared/tacticalHumanDraftPrefetchFingerprint.ts`) over human tactical marches, ranged, air, ferry, embark lists.
- **Capture:** `S.tacticalPrefetchFingerprintWhenRequestStarted` set in `startBackgroundRequestIfAllowed` (`openRouterRuntime.ts`) immediately before `requestAiOrders` when tactical planning is active.
- **Cancel on edit:** `invalidateTacticalPrefetchIfHumanDraftChangedSinceRequestStart()` after draft mutations (`tacticalOrders.ts`, `mainMapInteractions.ts`, `renderer.ts` sealift, `sidebarSupport.ts`).
- **Stale success discard:** If IPC returns success with `tacticalOpponentPlan` but fingerprint ≠ start, discard and re-queue prefetch.
- **Abort path:** `catch` treats `AbortError` as tactical prefetch abort without `unblockPrecomputedAiPlanningAfterBackgroundFailure` noise; may re-arm prefetch if still waiting.

## Phase 6 — tactical latency diagnostics

- **Structured log:** `logDebug('openRouter requestOrders tactical latency diagnostics (phase 6)', …)` in `requestOrdersFlow.ts` `finally` (wall-clock ms, pathfinding tool call counts, `battleId`).
- **Light precompute flag:** `TACTICAL_LIGHT_PRECOMPUTE_ENABLED` default `false` in `tacticalLightPrecompute.ts`; when `true`, intersects tactical tool names with a minimal allowlist (developer experiment only).

## Benchmark notes (Phase 6 verification)

- **Before/after:** Compare `openRouter requestOrders tactical latency diagnostics` `wallClockMs` and `planRouteToolCalls` / `totalToolCalls` in logs for the same scenario with `TACTICAL_LIGHT_PRECOMPUTE_ENABLED` false vs true (local only).
- **Same model:** Use one fixed model id so token variance does not dominate; run at least two beats per configuration.

## `startBackgroundRequestIfAllowed` (tactical)

- `openRouterRuntime.ts` (gates + `requestAiOrders`).
- Invoked from: `readyHandler` after tactical commit when opponent alive; `applyTacticalPostBeatConsultSideEffects`; OpenRouter UI init / Run toggle paths.

## Key symbols

- `runEventDrivenAfterTacticalBeatConsultation` — `src/main/ipc/readyIpcResolutionMapping.ts`
- `afterTacticalBeatResolution` — `src/main/openrouter/afterResolution.ts`
- `POST_RESOLUTION_CONSULT_TIMEOUT_MS` — `src/main/gameIpcHandlers.ts` (exported)
